# obrateatral

Sala privada para analizar obras de teatro con un amigo. Los videos viven en
links efímeros del estudio (~4 h, HLS directo); lo que se sincroniza por Socket.IO
es el **estado de reproducción**, nunca los bytes. El servidor es la autoridad del
estado de la sala.

## Arquitectura

```
client/          React + Vite + TypeScript (SPA con BrowserRouter,
                servida por Express en producción)
server/          Express + Socket.IO + Prisma 7 (PostgreSQL)
```

Flujo: ambos navegan la misma `/obra/:id`; cualquiera pega el link del estudio;
el servidor persiste el `source_url` en `Room` y lo distribuye; ambos reproducen
localmente con hls.js y se corrigen por drift (ticks de 5 s, umbral 2 s).
`WatchProgress` guarda `lastPosition` (nunca decrece) y `completed` (≥ 90 % de la
duración declarada) por usuario.

## Desarrollo

```bash
# PostgreSQL 16 local, cluster 5432 (ver odd/tasks/obrateatral-mvp.md)
createdb obrateatral   # o usa un rol existente
cd server && printf 'PORT=3001\nCLIENT_URL=http://localhost:5173\nDATABASE_URL=postgresql://USER:PASS@localhost:5432/obrateatral\nSESSION_SECRET=$(openssl rand -hex 32)\nSEED_USERS="Nombre1:clave1,Nombre2:clave2"\n' > .env
npm install && npx prisma migrate dev && npm run db:seed
npm run dev             # http://localhost:3001

cd ../client && npm install && npm run dev   # http://localhost:5173
```

## Despliegue en Render

Ver `render.yaml`: un web service en Render + **Postgres en Supabase** (externo).

- El cliente mantiene el servicio despierto con `fetch('/health')` cada 5 min
  mientras haya una pestaña abierta, así una sesión de 4 h no se corta por
  inactividad en el free tier. El plan `starter` evita el arranque en frío.
- El Postgres va en Supabase porque el free de Render **se elimina a los 90 días**.
  Usá el host del **session pooler** (puerto 5432), no el transaction pooler:
  `prisma migrate` necesita una conexión de sesión.

Variables: `DATABASE_URL`, `SESSION_SECRET` (`openssl rand -hex 32`),
`SEED_USERS` (`Nombre1:clave1,Nombre2:clave2` — idempotente, bcrypt),
`CLIENT_URL` (URL pública del servicio). `NODE_ENV=production` en Render.

## Estado

Ver `odd/tasks/obrateatral-mvp.md`. T1–T7 y T9 completos y verificados con
Chrome CDP (dos pestañas, mismo usuario). T8 (proxy HLS) pendiente de un link
real del estudio para comprobar CORS. T10 completo (configuración y notas de deploy).
