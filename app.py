import os
import time
import sqlite3
import threading
from datetime import datetime, timezone

import requests
from flask import Flask, jsonify, render_template, request

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(APP_DIR, "monitor.db"))
DB_DIR = os.path.dirname(DB_PATH)

if DB_DIR:
    os.makedirs(DB_DIR, exist_ok=True)

INTERVAL = max(30, int(os.getenv("CHECK_INTERVAL_SECONDS", "60")))
TIMEOUT = 20
PSN_DATA_URL = "https://status.playstation.com/data/statuses/region/SCEE.json"
# Cada país conserva su enlace oficial para abrirlo desde la interfaz.
REGIONS = {
    "España": ("ES", "https://status.playstation.com/es-es/"),
    "Alemania": ("DE", "https://status.playstation.com/de-de/"),
    "Francia": ("FR", "https://status.playstation.com/fr-fr/"),
    "Reino Unido": ("GB", "https://status.playstation.com/en-gb/"),
    "Italia": ("IT", "https://status.playstation.com/it-it/"),
    "Países Bajos": ("NL", "https://status.playstation.com/en-nl/"),
    "Polonia": ("PL", "https://status.playstation.com/en-pl/"),
    "Irlanda": ("IE", "https://status.playstation.com/en-ie/"),
}
SERVICE_NAMES = {
    "PlayStation_Store": "PlayStation Store",
    "Gaming_And_Social": "Juegos y redes sociales",
    "Account_Management": "Gestión de cuentas",
}

app = Flask(__name__)

lock = threading.Lock()
scheduler_lock = threading.Lock()

scheduler_started = False

latest = {
    "regions": [],
    "updated_at": None,
    "next_check_seconds": INTERVAL
}


def db():
    conn = sqlite3.connect(DB_PATH, timeout=20)

    conn.execute("PRAGMA journal_mode=WAL")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checked_at TEXT NOT NULL,
            region TEXT NOT NULL,
            status TEXT NOT NULL,
            latency_ms INTEGER,
            detail TEXT
        )
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_checks_time
        ON checks(checked_at)
    """)

    return conn


def classify_incidents(incidents):
    """Clasifica incidencias explícitas; una lista vacía significa sin incidencias."""
    if not isinstance(incidents, list):
        return "unknown"
    if not incidents:
        return "operational"
    kinds = []
    for incident in incidents:
        if not isinstance(incident, dict):
            return "unknown"
        kind = str(incident.get("statusType", "")).lower()
        if "outage" in kind or kind in ("down", "unavailable"):
            kinds.append("outage")
        elif any(word in kind for word in ("degrad", "maintenance", "disrupt", "issue")):
            kinds.append("degraded")
        else:
            kinds.append("unknown")
    if "outage" in kinds:
        return "outage"
    if "degraded" in kinds:
        return "degraded"
    return "unknown"


def worst_status(statuses):
    """No declara operativo un país si hay estados que no podemos interpretar."""
    for status in ("outage", "degraded", "unknown", "operational"):
        if status in statuses:
            return status
    return "unknown"


def check_country(name, code, url, countries, latency):
    country = countries.get(code)
    if not isinstance(country, dict):
        return {
            "region": name, "status": "unknown", "latency_ms": latency,
            "detail": f"País {code} ausente del JSON", "services": {}, "url": url,
        }

    services = {}
    country_status = classify_incidents(country.get("status"))
    all_statuses = [country_status]
    raw_services = country.get("services")
    if not isinstance(raw_services, list) or not raw_services:
        all_statuses.append("unknown")
    else:
        for service in raw_services:
            if not isinstance(service, dict):
                all_statuses.append("unknown")
                continue
            service_id = service.get("serviceId")
            statuses = [classify_incidents(service.get("status"))]
            resources = service.get("resources", [])
            if not isinstance(resources, list):
                statuses.append("unknown")
            else:
                for resource in resources:
                    if not isinstance(resource, dict):
                        statuses.append("unknown")
                    else:
                        statuses.append(classify_incidents(resource.get("status")))
            service_status = worst_status(statuses)
            all_statuses.append(service_status)
            if service_id in SERVICE_NAMES:
                services[SERVICE_NAMES[service_id]] = service_status

    # El campo regional contiene incidencias agregadas de distintos países.
    # No se aplica indiscriminadamente: solo se usa la información del país.
    overall = worst_status(all_statuses)
    return {
        "region": name,
        "status": overall,
        "latency_ms": latency,
        "detail": f"PSN SCEE; país {code}; {len(raw_services) if isinstance(raw_services, list) else 0} servicios",
        "services": services,
        "url": url,
    }


def fetch_country_results():
    started = time.monotonic()
    try:
        response = requests.get(
            PSN_DATA_URL, timeout=TIMEOUT,
            headers={"User-Agent": "GTA-VI-Server-Monitor/2.0", "Accept": "application/json"},
        )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Respuesta regional inesperada de Sony")
        raw_countries = data.get("countries")
        if not isinstance(raw_countries, list) or not raw_countries:
            raise ValueError("Lista de países ausente o vacía")
        countries = {c["countryCode"]: c for c in raw_countries
                     if isinstance(c, dict) and isinstance(c.get("countryCode"), str)}
        latency = int((time.monotonic() - started) * 1000)
        return [check_country(name, code, url, countries, latency)
                for name, (code, url) in REGIONS.items()]
    except (requests.RequestException, ValueError, TypeError, KeyError) as exc:
        latency = int((time.monotonic() - started) * 1000)
        app.logger.exception("Error consultando datos JSON de PlayStation")
        return [{
            "region": name, "status": "unreachable", "latency_ms": latency,
            "detail": str(exc)[:180], "services": {}, "url": url,
        } for name, (code, url) in REGIONS.items()]


def run_check():

    global latest

    results = fetch_country_results()

    now = datetime.now(timezone.utc).isoformat()

    conn = db()

    try:

        with conn:

            for item in results:

                conn.execute(
                    """
                    INSERT INTO checks(
                        checked_at,
                        region,
                        status,
                        latency_ms,
                        detail
                    )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        now,
                        item["region"],
                        item["status"],
                        item.get("latency_ms"),
                        item.get("detail"),
                    ),
                )

    finally:
        conn.close()

    with lock:

        latest = {
            "regions": results,
            "updated_at": now,
            "next_check_seconds": INTERVAL
        }

        return dict(latest)


def scheduler():

    # Primera comprobación inmediata.
    # Después, una comprobación cada INTERVAL segundos.

    while True:

        try:

            app.logger.info(
                "Iniciando comprobación de PlayStation..."
            )

            run_check()

            app.logger.info(
                "Comprobación de PlayStation finalizada."
            )

        except Exception as exc:

            app.logger.exception(
                "Monitor check failed: %s",
                exc
            )

        time.sleep(INTERVAL)


def start_scheduler():

    global scheduler_started

    with scheduler_lock:

        if scheduler_started:
            return

        db().close()

        thread = threading.Thread(
            target=scheduler,
            name="psn-monitor-scheduler",
            daemon=True
        )

        thread.start()

        scheduler_started = True

        app.logger.info(
            "PSN monitor scheduler started; interval=%s seconds",
            INTERVAL
        )


@app.route("/")
def index():

    return render_template(
        "index.html",
        interval=INTERVAL
    )


@app.route("/api/status")
def api_status():

    with lock:
        data = dict(latest)

    if not data.get("updated_at"):
        data = run_check()

    return jsonify(data)


@app.route("/api/history")
def api_history():

    hours = min(
        max(int(request.args.get("hours", 24)), 1),
        720
    )

    conn = db()

    try:

        rows = conn.execute(
            """
            SELECT
                checked_at,
                region,
                status,
                latency_ms
            FROM checks
            WHERE julianday(checked_at) >= julianday('now', ?)
            ORDER BY checked_at
            """,
            (f"-{hours} hours",),
        ).fetchall()

    finally:
        conn.close()

    return jsonify([
        {
            "time": row[0],
            "region": row[1],
            "status": row[2],
            "latency_ms": row[3]
        }
        for row in rows
    ])


@app.route("/health")
def health():

    return jsonify({
        "ok": True,
        "interval_seconds": INTERVAL,
        "database_path": DB_PATH,
        "scheduler_started": scheduler_started
    })


if __name__ == "__main__":

    start_scheduler()

    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        threaded=True
    )
