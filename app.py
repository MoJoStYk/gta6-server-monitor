import os, re, time, sqlite3, threading
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(APP_DIR, "monitor.db")
INTERVAL = int(os.getenv("CHECK_INTERVAL_SECONDS", "60"))
TIMEOUT = 15

# Regional PlayStation status pages. These are samples of European locales,
# not separate guarantees of physically independent infrastructure.
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
latest = {"regions": [], "updated_at": None, "next_check_seconds": INTERVAL}

def db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("""CREATE TABLE IF NOT EXISTS checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checked_at TEXT NOT NULL, region TEXT NOT NULL, status TEXT NOT NULL,
        latency_ms INTEGER, detail TEXT
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_checks_time ON checks(checked_at)")
    return conn

def classify(text):
    t = re.sub(r"\s+", " ", text.lower())
    # Page-level known phrases, localized and English.
    if any(x in t for x in ["all services are up and running", "todos los servicios están activos",
                            "tous les services sont opérationnels", "alle dienste sind betriebsbereit",
                            "tutti i servizi sono attivi"]):
        overall = "operational"
    elif any(x in t for x in ["service outage", "interrupción", "panne", "ausfall", "interruzione",
                              "major outage", "critical"]):
        overall = "outage"
    elif any(x in t for x in ["degraded", "degradado", "degraded performance", "rendimiento reducido",
                              "partial outage", "problema"]):
        overall = "degraded"
    elif any(x in t for x in ["service is running", "servicio está activo", "fonctionne", "betriebsbereit"]):
        overall = "operational"
    else:
        overall = "unknown"

    services = {}
    for label, terms in SERVICE_TERMS.items():
        found = False
        for term in terms:
            pos = t.find(term)
            if pos >= 0:
                found = True
                excerpt = t[max(0, pos-120):pos+260]
                if any(x in excerpt for x in ["not running", "not operational", "down", "outage",
                                               "no está activo", "no funciona", "interruption"]):
                    services[label] = "outage"
                elif any(x in excerpt for x in ["degraded", "degradado", "limited", "reduced"]):
                    services[label] = "degraded"
                else:
                    services[label] = "operational"
                break
        if not found:
            services[label] = "unknown"
    return overall, services

def check_region(name, url):
    started = time.monotonic()
    try:
        response = requests.get(url, timeout=TIMEOUT, headers={
            "User-Agent": "GTA-VI-Server-Monitor/1.0 (personal status dashboard)",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
        })
        latency = int((time.monotonic() - started) * 1000)
        if response.status_code >= 500:
            return {"region": name, "status": "unreachable", "latency_ms": latency,
                    "detail": f"HTTP {response.status_code}", "services": {}}
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        text = soup.get_text(" ", strip=True)
        overall, services = classify(text)
        return {"region": name, "status": overall, "latency_ms": latency,
                "detail": f"HTTP {response.status_code}; lectura de la página oficial",
                "services": services, "url": url}
    except Exception as e:
        latency = int((time.monotonic() - started) * 1000)
        return {"region": name, "status": "unreachable", "latency_ms": latency,
                "detail": str(e)[:180], "services": {}, "url": url}

def run_check():
    global latest
    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(check_region, n, u) for n, u in REGIONS.items()]
        for f in as_completed(futures):
            results.append(f.result())
    order = {name: i for i, name in enumerate(REGIONS)}
    results.sort(key=lambda x: order[x["region"]])
    now = datetime.now(timezone.utc).isoformat()
    conn = db()
    with conn:
        for r in results:
            conn.execute("INSERT INTO checks(checked_at,region,status,latency_ms,detail) VALUES(?,?,?,?,?)",
                         (now, r["region"], r["status"], r.get("latency_ms"), r.get("detail")))
    conn.close()
    with lock:
        latest = {"regions": results, "updated_at": now, "next_check_seconds": INTERVAL}
    return latest

def scheduler():
    while True:
        try:
            run_check()
        except Exception:
            pass
        time.sleep(INTERVAL)

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
    hours = min(int(__import__("flask").request.args.get("hours", 24)), 168)
    conn = db()
    rows = conn.execute(
        "SELECT checked_at, region, status, latency_ms FROM checks WHERE checked_at >= datetime('now', ?) ORDER BY checked_at",
        (f"-{hours} hours",)
    ).fetchall()
    conn.close()
    return jsonify([{"time": r[0], "region": r[1], "status": r[2], "latency_ms": r[3]} for r in rows])

@app.route("/health")
def health():
    return jsonify({"ok": True, "interval_seconds": INTERVAL})

if __name__ == "__main__":
    db().close()
    threading.Thread(target=scheduler, daemon=True).start()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")), threaded=True)
