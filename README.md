# GTA VI Server Monitor — Railway ready

## Qué hace
Panel web que consulta cada 60 segundos ocho páginas regionales públicas de estado de PlayStation y guarda el resultado en SQLite.

**Importante:** consulta páginas públicas de estado; no mide la carga interna de PSN, las colas de descarga ni el número de precargas de GTA VI. Las regiones son localizaciones de páginas, no pruebas de centros de datos independientes.

## Despliegue en Railway

1. Sube el contenido de esta carpeta al repositorio GitHub conectado a Railway (incluidos `app.py`, `gunicorn.conf.py`, `requirements.txt`, `templates/` y `static/`).
2. En Railway, conecta un Volume al servicio con Mount Path `/data`.
3. En Variables, configura:
   - `DATABASE_PATH` = `/data/monitor.db`
   - `CHECK_INTERVAL_SECONDS` = `60`
4. En Settings > Deploy, configura el Start Command:
   ```bash
   gunicorn -c gunicorn_conf.py app:app
   ```
5. Haz Deploy/Redeploy y espera a que el despliegue termine.
6. Abre el dominio público del servicio.
7. Comprueba `https://TU-DOMINIO/health`. Debe mostrar `ok: true`, `database_path: /data/monitor.db` y `scheduler_started: true`.

## Ajustes importantes
- Usa exactamente un worker Gunicorn (`workers = 1`) para evitar dos programadores escribiendo el mismo histórico.
- El programador se inicia en el hook `post_worker_init`, después de que Gunicorn cree su worker.
- El primer chequeo se realiza al arrancar y después se repite cada 60 segundos.
- El volumen debe estar montado en `/data`; no pongas `/data/monitor.db` como Mount Path.
- No elimines ni desconectes el volumen si quieres conservar el histórico.

## Ejecución local en Windows
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
py app.py
```
Abre `http://localhost:8080`.

## Notificaciones
La interfaz ofrece notificaciones del navegador cuando el panel está abierto y recibe cambios. No implementa notificaciones push persistentes con el navegador cerrado.

## Limitaciones
- Sony puede cambiar la estructura HTML y el parser podría mostrar `unknown`.
- La latencia medida es la del servidor Railway hacia cada página regional, no la latencia desde cada país europeo.
- Una respuesta HTTP correcta no garantiza que el servicio de juego esté operativo.
- No se usan credenciales ni cuentas PSN.
