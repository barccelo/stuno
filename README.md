# Stuno

Juego multijugador de palabras y cartas para 2–8 personas. Incluye partidas por turnos y simultáneas, formatos en línea y en vivo, cartas especiales, votaciones, cronómetro y categorías editables.

## Desarrollo local

```bash
npm ci
npm run dev
```

Para habilitar el editor global de categorías en local, copia `.dev.vars.example` como `.dev.vars` y cambia la clave. Nunca publiques `.dev.vars`.

## Cloudflare

Stuno se ejecuta en un único Cloudflare Worker y utiliza una base D1 llamada `stuno-db` para las salas y el catálogo global de categorías.

```bash
npm run build
npm run deploy
```

Las tablas se inicializan de forma segura en la primera solicitud. Las migraciones SQL se conservan en `drizzle/` para futuras actualizaciones del esquema.

El secreto `CATEGORY_ADMIN_KEY` debe configurarse en Cloudflare y no debe guardarse en GitHub.

## Publicación

La rama `main` es la fuente de producción desplegada en Cloudflare. La integración de compilación se verificó nuevamente el 24 de agosto de 2026.
