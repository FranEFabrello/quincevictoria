# quincevictoria

## Configuración de base de datos remota

La aplicación ahora utiliza PostgreSQL (o cualquier base de datos compatible con el driver `pg`) mediante la variable de entorno `DATABASE_URL`. Definí esta variable antes de iniciar el servidor, por ejemplo:

```bash
export DATABASE_URL="postgresql://usuario:contraseña@host:5432/quincevictoria"
```

El esquema mínimo que debe existir en la base de datos es:

```sql
CREATE TABLE IF NOT EXISTS invitados (
    id TEXT PRIMARY KEY,
    nombre TEXT,
    apellido TEXT,
    cantidad INTEGER,
    confirmados INTEGER,
    estado TEXT
);
```

Podés ejecutar este script manualmente o a través del proveedor donde tengas alojada la base antes de desplegar la aplicación. `app.js` intenta crear la tabla en el arranque, pero contar con el esquema previamente configurado facilita los despliegues continuos.

## Prerenderizado de SVG

Para optimizar los recursos gráficos y contar con versiones en mapa de bits listas para servir en producción, se incluyó un proceso de prerenderizado para los SVG almacenados en `assets/`.

```bash
npm install
npm run prerender:svg
```

El script `npm run prerender:svg` analiza cada archivo `assets/*.svg`, limpia los nodos con `svgson` y genera versiones PNG y WebP en `assets/prerendered/`. Se recomienda ejecutar este comando como parte del flujo de compilación o despliegue, antes de iniciar el servidor en el entorno de producción.

Tras ejecutar el comando, el servidor (`app.js`) entregará automáticamente las versiones WebP/PNG pre-generadas cuando el encabezado `Accept` del cliente lo permita, manteniendo los SVG originales como alternativa de compatibilidad.

## Respaldos de la base de datos

El panel de administración ofrece una ruta de respaldo que exporta los registros de `invitados` a un archivo JSON ordenado por nombre. Este archivo se guarda temporalmente en la carpeta `backups/` y luego se ofrece para su descarga. Podés versionar o almacenar el JSON resultante en tu proveedor de confianza para contar con una copia remota de la información.
