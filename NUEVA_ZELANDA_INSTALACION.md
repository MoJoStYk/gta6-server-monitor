# Premium 3.8.1 · Nueva Zelanda 🇳🇿

Se añade Nueva Zelanda (NZ) a las regiones de PSN con bandera SVG local, tarjeta, servicios, historial y métricas. Se mantiene intacto el monitor Rockstar global y se añade una tarjeta explicativa para Nueva Zelanda con su bandera. Rockstar no publica estado ni carga exclusiva de servidores en NZ.

## Instalación
1. Descomprime el ZIP.
2. Abre tu repositorio GitHub, rama `main`.
3. Sustituye o sube **todo el contenido de `gta6-server-monitor-main/`**, conservando rutas y carpetas (no subas una carpeta adicional anidada).
4. Haz `Commit changes`. Railway debería desplegar automáticamente si está vinculado a GitHub.
5. Comprueba `/api/status` y que aparezca `Nueva Zelanda`. Si Sony no publica NZ en la respuesta consultada, figurará `SIN DATOS` (no se inventará un estado).
6. Abre el panel y fuerza recarga con Ctrl+F5 para cargar el nuevo CSS y JS.

No borres el volumen Railway `/data` ni cambies `DATABASE_PATH`: así se conserva el historial.
