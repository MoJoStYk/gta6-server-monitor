import os
import re
import time
import sqlite3
import threading
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(APP_DIR, "monitor.db"))
DB_DIR = os.path.dirname(DB_PATH)
if DB_DIR:
    os.makedirs(DB_DIR, exist_ok=True)

INTERVAL = max(30, int(os.getenv("CHECK_INTERVAL_SECONDS", "60")))
TIMEOUT = 15

REGIONS = {
    "España": "https://status.playstation.com/es-es/",
    "Alemania": "https://status.playstation.com/de-de/",
    "Francia": "https://status.playstation.com/fr-fr/",
    "Reino Unido": "https://status.playstation.com/en-gb/",
    "Italia": "https://status.playstation.com/it-it/",
    "Países Bajos": "https://status.playstation.com/en-nl/",
    "Polonia": "https://status.playstation.com/en-pl/",
    "Irlanda": "https://status.playstation.com/en-ie/",
}
SERVICE_TERMS = {
    "PlayStation Store": ["playstation store", "store"],
    "Juegos y redes sociales": ["gaming and social", "juegos y redes sociales"],
    "Gestión de cuentas": ["account management", "gestión de cuentas"],
}

app = Flask(__name__)
lock = threading.Lock()
scheduler_lock = threading.Lock()
scheduler_started = False
latest = {"regions": [], "updated_at": None, "next_check_seconds": INTERVAL}


def db():
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""CREATE TABLE IF NOT EXISTS checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checked_at TEXT NOT NULL, region TEXT NOT NULL, status TEXT NOT NULL,
        latency_ms INTEGER, detail TEXT
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_checks_time ON checks(checked_at)")
    return conn


def classify(text):
    t = re.sub(r"\s+", " ", text.lower())
    if any(x in t for x in [
        "all services are up and running", "todos los servicios están activos",
        "tous les services sont opérationnels", "alle dienste sind betriebsbereit",
        "tutti i servizi sono attivi"
    ]):
        overall = "operational"
    elif any(x in t for x in [
        "service outage", "interrupción", "panne", "ausfall", "interruzione",
        "major outage", "critical"
    ]):
        overall = "outage"
    elif any(x in t for x in [
        "degraded", "degradado", "degraded performance", "rendimiento reducido",
        "partial outage", "problema"
    ]):
        overall = "degraded"
    elif any(x in t for x in [
        "service is running", "servicio está activo", "fonctionne", "betriebsbereit"
    ]):
        overall = "operational"
    else:
        overall = "unknown"

    services = {}
    for label, terms in SERVICE_TERMS.items():
        services[label] = "unknown"
        for term in terms:
            pos = t.find(term)
            if pos >= 0:
                excerpt = t[max(0, pos - 120):pos + 260]
                if any(x in excerpt for x in [
                    "not running", "not operational", "down", "outage",
                    "no está activo", "no funciona", "interruption"
                ]):
                    services[label] = "outage"
                elif any(x in excerpt for x in ["degraded", "degradado", "limited", "reduced"]):
                    services[label] = "degraded"
                else:
                    services[label] = "operational"
                break
    return overall, services


def check_region(name, url):
    started = time.monotonic()
    try:
        response = requests.get(
            url,
            timeout=TIMEOUT,
            headers={
                "User-Agent": "GTA-VI-Server-Monitor/1.1 (personal status dashboard)",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            },
        )
        latency = int((time.monotonic() - started) * 1000)
        if response.status_code >= 500:
            return {
                "region": name, "status": "unreachable", "latency_ms": latency,
                "detail": f"HTTP {response.status_code}", "services": {}, "url": url,
            }
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        overall, services = classify(soup.get_text(" ", strip=True))
        return {
            "region": name, "status": overall, "latency_ms": latency,
            "detail": f"HTTP {response.status_code}; lectura de la página oficial",
            "services": services, "url": url,
        }
    except Exception as exc:
        latency = int((time.monotonic() - started) * 1000)
        return {
            "region": name, "status": "unreachable", "latency_ms": latency,
            "detail": str(exc)[:180], "services": {}, "url": url,
        }


def run_check():
    global latest
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(check_region, name, url) for name, url in REGIONS.items()]
        results = [future.result() for future in as_completed(futures)]
    order = {name: index for index, name in enumerate(REGIONS)}
    results.sort(key=lambda item: order[item["region"]])
    now = datetime.now(timezone.utc).isoformat()

    conn = db()
    try:
        with conn:
            for item in results:
                conn.execute(
                    "INSERT INTO checks(checked_at,region,status,latency_ms,detail) VALUES(?,?,?,?,?)",
                    (now, item["region"], item["status"], item.get("latency_ms"), item.get("detail")),
                )
    finally:
        conn.close()

    with lock:
        latest = {"regions": results, "updated_at": now, "next_check_seconds": INTERVAL}
        return dict(latest)


def scheduler():
    # First check starts immediately; subsequent checks run at the configured interval.
    while True:
        try:
            run_check()
        except Exception as exc:
            app.logger.exception("Monitor check failed: %s", exc)
        time.sleep(INTERVAL)


def start_scheduler():
    """Start exactly one scheduler thread inside the current app worker."""
    global scheduler_started
    with scheduler_lock:
        if scheduler_started:
            return
        db().close()
        thread = threading.Thread(target=scheduler, name="psn-monitor-scheduler", daemon=True)
        thread.start()
        scheduler_started = True
        app.logger.info("PSN monitor scheduler started; interval=%s seconds", INTERVAL)


@app.route("/")
def index():
    return render_template("index.html", interval=INTERVAL)


@app.route("/api/status")
def api_status():
    with lock:
        data = dict(latest)
    if not data.get("updated_at"):
        data = run_check()
    return jsonify(data)


@app.route("/api/history")
def api_history():
    hours = min(max(int(request.args.get("hours", 24)), 1), 720)
    conn = db()
    try:
        rows = conn.execute(
            """SELECT checked_at, region, status, latency_ms
               FROM checks
               WHERE checked_at >= datetime('now', ?)
               ORDER BY checked_at""",
            (f"-{hours} hours",),
        ).fetchall()
    finally:
        conn.close()
    return jsonify([
        {"time": row[0], "region": row[1], "status": row[2], "latency_ms": row[3]}
        for row in rows
    ])


@app.route("/health")
def health():
    return jsonify({
        "ok": True,
        "interval_seconds": INTERVAL,
        "database_path": DB_PATH,
        "scheduler_started": scheduler_started,
    })


if __name__ == "__main__":
    start_scheduler()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")), threaded=True)
