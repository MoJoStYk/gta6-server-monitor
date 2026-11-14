# GTA VI Server Monitor

Panel web independiente para consultar cada 60 segundos las páginas regionales oficiales de estado de PlayStation.

## Requisitos
- Python 3.10+
- Conexión a Internet
- Un equipo o servidor encendido mientras se quiera monitorizar

## Arranque en Windows
1. Instala Python desde https://www.python.org/downloads/ (marca "Add Python to PATH").
2. Descomprime el proyecto.
3. Abre PowerShell en la carpeta `gta_vi_server_monitor`.
4. Ejecuta:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
py app.py
```

5. Abre `http://localhost:8080` en el navegador.
6. Pulsa "Activar notificaciones" y permite las notificaciones del navegador.

## Uso desde iPhone u otro dispositivo de la misma Wi-Fi
- Averigua la IP local del PC con `ipconfig`.
- En el iPhone abre `http://IP-DEL-PC:8080`.
- El PC debe permanecer encendido y ambos dispositivos en la misma red.
- Para notificaciones, los navegadores suelen exigir HTTPS o localhost. En iPhone, usa una dirección HTTPS si se publica en Internet; la web local por HTTP puede no permitir notificaciones.

## Publicación en Internet
Despliega la carpeta en un servidor Python/Flask que permanezca encendido (VPS, Render, Railway u otro host compatible). Configura:
- `CHECK_INTERVAL_SECONDS=60`
- `PORT` según el proveedor

No uses el servidor de desarrollo de Flask para una publicación pública. Para producción, usa Gunicorn:
```bash
pip install gunicorn
gunicorn -w 1 --threads 8 -b 0.0.0.0:$PORT app:app
```
Mantén un solo worker porque el planificador y el estado en memoria están dentro del proceso. Para producción robusta conviene separar el programador de comprobaciones del servidor web y usar una base de datos persistente.

## Qué se consulta
Muestras regionales:
- España, Alemania, Francia, Reino Unido, Italia, Países Bajos, Polonia e Irlanda.
- La fuente es `status.playstation.com`, no una API privada de Sony.
- El historial se guarda en SQLite (`monitor.db`).

## Limitaciones
- La página oficial puede cambiar su HTML; si ocurre, el parser podría mostrar "Sin datos". Comprueba siempre el enlace oficial.
- Las páginas regionales no prueban que existan centros de datos separados; son páginas/localizaciones regionales de estado.
- La frecuencia de 60 segundos es la frecuencia de consulta de este monitor, no la frecuencia de actualización de Sony.
- Las notificaciones del navegador se generan mientras el panel está abierto y recibe cambios. No es un servicio push persistente cuando el navegador está cerrado.
- No se puede conocer la carga interna de los servidores, las colas de descarga ni el número de descargas de GTA VI sin datos publicados por Sony.
- Los informes de usuarios de Downdetector no se incorporan automáticamente porque no hay una API pública general garantizada; no se debe hacer scraping que incumpla sus condiciones.

## Privacidad
No se solicita cuenta PSN, contraseña, NPSSO ni credenciales de PlayStation. No recopila datos personales de los jugadores.
