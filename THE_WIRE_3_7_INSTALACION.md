# THE WIRE Premium 3.7 — instalación

1. Haz una copia de seguridad del repositorio actual.
2. Descomprime este ZIP y sustituye los archivos del repositorio en GitHub (rama `main`), conservando sus rutas.
3. En Railway comprueba que el despliegue termine en **Success**. No cambies el volumen `/data` ni `DATABASE_PATH=/data/monitor.db`.
4. Abre `/api/news` y comprueba que `state` sea `ok` y que `items` tenga noticias.
5. Abre la página principal con Ctrl+F5. La sección THE WIRE mostrará noticias RSS gratuitas.

**Sin API de X:** la variable `X_BEARER_TOKEN` ya no es necesaria para THE WIRE. Puedes retirarla de Railway si no se usa en otra parte.

**Fuentes:** RSS de búsquedas públicas de Google News. Los titulares enlazan a sus fuentes; la disponibilidad depende del servicio externo. «En tendencia» es relevancia editorial, no popularidad medida.

**Monitor:** se preservan el scheduler, el historial SQLite, los endpoints PSN y Rockstar y los demás scripts.
