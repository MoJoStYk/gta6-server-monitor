import os
import time
import sqlite3
import threading
import re
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
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
ROCKSTAR_URL = "https://support.rockstargames.com/servicestatus"
ROCKSTAR_SERVICES = {
    "GTA Online · PS5": ("Grand Theft Auto Online", "PlayStation 5"),
    "GTA Online · PS4": ("Grand Theft Auto Online", "PlayStation 4"),
    "GTA Online · Xbox Series X|S": ("Grand Theft Auto Online", "Xbox Series X|S"),
    "GTA Online · Xbox One": ("Grand Theft Auto Online", "Xbox One"),
    "GTA Online · PC": ("Grand Theft Auto Online", "PC"),
    "Red Dead Online · PC": ("Red Dead Online", "PC"),
    "Autenticación Rockstar": ("Online Services", "Authentication"),
    "Rockstar Games Launcher": ("Online Services", "Rockstar Games Launcher"),
    "Rockstar Store": ("Online Services", "Store"),
}

PSN_DATA_URLS = {
    "SCEE": "https://status.playstation.com/data/statuses/region/SCEE.json",
    "SCEA": "https://status.playstation.com/data/statuses/region/SCEA.json",
}
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
    "Estados Unidos": ("US", "https://status.playstation.com/en-us/"),
    "Canadá": ("CA", "https://status.playstation.com/en-ca/"),
}
SERVICE_NAMES = {
    "PlayStation_Store": "PlayStation Store",
    "Gaming_And_Social": "Juegos y redes sociales",
    "Account_Management": "Gestión de cuentas",
}

class _PageText(HTMLParser):
    """Extrae texto visible; ignora scripts y estilos."""
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.hidden += 1
    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.hidden = max(0, self.hidden - 1)
    def handle_data(self, data):
        if not self.hidden and data.strip():
            self.parts.append(" ".join(data.split()))


def parse_rockstar_status(html):
    """Interpretación conservadora de texto visible de la página oficial.
    Si Rockstar cambia su HTML, devuelve unknown, nunca un falso operativo.
    """
    parser = _PageText()
    parser.feed(html)
    text = "\n".join(parser.parts)
    sections = ("Grand Theft Auto Online", "Red Dead Online", "Online Services", "Cfx")
    status_pattern = re.compile(r"^(All services operational|Operational|Up|Limited|Degraded|Partial outage|Major outage|Down|Unavailable|Maintenance)$", re.I)
    rows = [x.strip() for x in text.splitlines() if x.strip()]
    # Solo se acepta una lectura si contiene la estructura pública esperada.
    if not any(x == "Grand Theft Auto Online" for x in rows):
        return {name: "unknown" for name in ROCKSTAR_SERVICES}
    data = {}
    section = None
    for idx, row in enumerate(rows):
        if row in sections:
            section = row
            continue
        if section is None:
            continue
        if row not in {platform for sec, platform in ROCKSTAR_SERVICES.values() if sec == section}:
            continue
        following = rows[idx + 1:idx + 4]
        match = next((v for v in following if status_pattern.fullmatch(v)), None)
        if match is None:
            continue
        v = match.lower()
        state = ("operational" if v in ("all services operational", "operational", "up")
                 else "outage" if v in ("major outage", "down", "unavailable")
                 else "degraded")
        data[(section, row)] = state
    return {name: data.get(pair, "unknown") for name, pair in ROCKSTAR_SERVICES.items()}


def fetch_rockstar():
    started = time.monotonic()
    states = {name: "unknown" for name in ROCKSTAR_SERVICES}
    error = None
    try:
        response = requests.get(ROCKSTAR_URL, timeout=TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ViceCityMonitor/2.5)", "Accept-Language": "en-US,en;q=0.9"})
        response.raise_for_status()
        states = parse_rockstar_status(response.text)
        if all(x == "unknown" for x in states.values()):
            error = "Rockstar no expone estados interpretables en el HTML recibido"
    except (requests.RequestException, ValueError) as exc:
        error = str(exc)[:180]
        app.logger.warning("Rockstar status unavailable: %s", error)
    statuses = list(states.values())
    overall = worst_status(statuses)
    return {"status": overall, "services": states, "updated_at": datetime.now(timezone.utc).isoformat(),
            "latency_ms": int((time.monotonic() - started)*1000), "source": ROCKSTAR_URL,
            "load_percent": None, "load_note": "Rockstar no publica porcentaje de ocupación",
            "detail": error or "Estado publicado por Rockstar (no mide carga)"}


app = Flask(__name__)

lock = threading.Lock()
scheduler_lock = threading.Lock()

scheduler_started = False

latest = {
    "regions": [],
    "updated_at": None,
    "next_check_seconds": INTERVAL
}
rockstar_latest = {"status": "unknown", "services": {}, "updated_at": None, "load_percent": None}


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
        CREATE TABLE IF NOT EXISTS rockstar_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checked_at TEXT NOT NULL,
            service TEXT NOT NULL,
            status TEXT NOT NULL,
            latency_ms INTEGER
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rockstar_time ON rockstar_checks(checked_at)")
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
        "detail": f"PSN; país {code}; {len(raw_services) if isinstance(raw_services, list) else 0} servicios",
        "services": services,
        "url": url,
    }


def fetch_psn_region(region):
    """Consulta un grupo Sony sin convertir fallos de red en estados operativos."""
    started = time.monotonic()
    try:
        response = requests.get(
            PSN_DATA_URLS[region], timeout=TIMEOUT,
            headers={"User-Agent": "GTA-VI-Server-Monitor/2.2", "Accept": "application/json"},
        )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Respuesta regional inesperada de Sony")
        raw = data.get("countries")
        if not isinstance(raw, list) or not raw:
            raise ValueError("Lista de países ausente o vacía")
        countries = {c["countryCode"].upper(): c for c in raw
                     if isinstance(c, dict) and isinstance(c.get("countryCode"), str)}
        return countries, int((time.monotonic() - started) * 1000), None
    except (requests.RequestException, ValueError, TypeError, KeyError) as exc:
        app.logger.warning("No se pudo consultar PSN %s: %s", region, exc)
        return {}, int((time.monotonic() - started) * 1000), str(exc)[:180]


def fetch_country_results():
    # Consultas paralelas: un fallo americano no bloquea ni falsea Europa.
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {name: executor.submit(fetch_psn_region, name) for name in PSN_DATA_URLS}
        sources = {name: future.result() for name, future in futures.items()}
    results = []
    for name, (code, url) in REGIONS.items():
        source = "SCEA" if code in ("US", "CA") else "SCEE"
        countries, latency, error = sources[source]
        if error:
            results.append({
                "region": name, "status": "unreachable", "latency_ms": latency,
                "detail": f"PSN {source}: {error}", "services": {}, "url": url,
            })
        else:
            item = check_country(name, code, url, countries, latency)
            item["detail"] = f"PSN {source}; " + item["detail"]
            results.append(item)
    return results


def run_check():

    global latest, rockstar_latest

    # Dos fuentes independientes: si Rockstar falla, PSN sigue funcionando.
    with ThreadPoolExecutor(max_workers=2) as executor:
        psn_future = executor.submit(fetch_country_results)
        rockstar_future = executor.submit(fetch_rockstar)
        results = psn_future.result()
        try:
            rockstar_result = rockstar_future.result()
        except Exception as exc:
            app.logger.exception("Rockstar check failed: %s", exc)
            rockstar_result = {"status": "unknown", "services": {}, "updated_at": datetime.now(timezone.utc).isoformat(),
                "load_percent": None, "detail": "Error de lectura", "source": ROCKSTAR_URL}

    now = datetime.now(timezone.utc).isoformat()

    conn = db()

    try:

        with conn:

            for service, state in rockstar_result.get("services", {}).items():
                conn.execute("INSERT INTO rockstar_checks(checked_at,service,status,latency_ms) VALUES(?,?,?,?)",
                             (now, service, state, rockstar_result.get("latency_ms")))
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

        rockstar_latest = rockstar_result
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


@app.route("/api/rockstar/status")
def api_rockstar_status():
    with lock:
        result = dict(rockstar_latest)
    return jsonify(result)


@app.route("/api/rockstar/history")
def api_rockstar_history():
    try:
        hours = min(max(int(request.args.get("hours", 24)), 1), 720)
    except (ValueError, TypeError):
        hours = 24
    conn = db()
    try:
        rows = conn.execute("SELECT checked_at, service, status, latency_ms FROM rockstar_checks "
            "WHERE julianday(checked_at) >= julianday('now', ?) ORDER BY checked_at",
            (f"-{hours} hours",)).fetchall()
    finally:
        conn.close()
    return jsonify([{"time": r[0], "service": r[1], "status": r[2], "latency_ms": r[3]} for r in rows])


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