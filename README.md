# quincevictoria

## Prerenderizado de SVG

Para optimizar los recursos gráficos y contar con versiones en mapa de bits listas para servir en producción, se incluyó un proceso de prerenderizado para los SVG almacenados en `assets/`.

```bash
npm install
npm run prerender:svg
```

El script `npm run prerender:svg` analiza cada archivo `assets/*.svg`, limpia los nodos con `svgson` y genera versiones PNG y WebP en `assets/prerendered/`. Se recomienda ejecutar este comando como parte del flujo de compilación o despliegue, antes de iniciar el servidor en el entorno de producción.

Tras ejecutar el comando, el servidor (`app.js`) entregará automáticamente las versiones WebP/PNG pre-generadas cuando el encabezado `Accept` del cliente lo permita, manteniendo los SVG originales como alternativa de compatibilidad.

## Respaldos de la base de datos

La aplicación habilita el modo [`WAL`](https://www.sqlite.org/wal.html) en SQLite para mejorar el rendimiento y la concurrencia. Al generar respaldos mientras el servidor está en ejecución, basta con copiar el archivo `database.db`; SQLite se encarga de mantener la consistencia del archivo aun cuando exista un archivo `-wal` temporal.
