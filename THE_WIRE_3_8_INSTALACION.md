# THE WIRE Premium 3.8 — Instalación segura

Esta versión parte del proyecto completo Premium 3.7 y mantiene los endpoints y el monitor PSN/Rockstar.

## Archivos que cambian respecto a 3.7
- `templates/index.html`
- `static/news.js`
- `static/style.css`
- `free_news.py`

## Instalación
1. Descarga una copia del repositorio actual (GitHub → Code → Download ZIP).
2. Abre tu repositorio en GitHub, rama `main`.
3. Sustituye **solo los cuatro archivos** anteriores por los del ZIP, respetando las rutas. También puedes subir el proyecto completo si tu repositorio coincide con la base 3.7 incluida.
4. Confirma los cambios con `Commit changes`. Railway desplegará automáticamente si está conectado a `main`.
5. Comprueba en Railway → Deployments que el nuevo despliegue termine en `Success`.
6. Comprueba `/api/news`: `state: ok` e `items` con noticias.
7. Abre la web y pulsa `Ctrl+F5`. Verifica filtros, búsqueda, agrupación y pestañas.

## Nota sobre verificación de fuentes
Un enlace de Google News no prueba que el artículo sea oficial aunque su editor figure como Rockstar Games. El backend solo marca `official: true` cuando el enlace directo usa HTTPS y el dominio `rockstargames.com` o un subdominio suyo. Por ello el filtro de oficiales verificadas puede estar vacío con feeds agregados. No se inventan verificaciones.

## Precauciones
No modifiques el volumen Railway `/data`, ni `DATABASE_PATH=/data/monitor.db`. No añadas claves de X. «En tendencia» sigue siendo selección editorial, no ranking por interacciones. La agrupación usa semejanza textual conservadora, no inteligencia semántica perfecta.
