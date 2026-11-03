# obrateatral

Sala privada para analizar obras de teatro con un amigo. Los videos viven en
links efímeros del estudio (~4 h, HLS directo); lo que se sincroniza por Socket.IO
es el **estado de reproducción**, nunca los bytes. El servidor es la autoridad del
estado de la sala.

## Arquitectura

Hosting partido: **front en Netlify**, **API + Socket.IO en Render**, **Postgres en Supabase**.

```
client/          React + Vite + TypeScript (SPA con BrowserRouter) -> Netlify
server/          Express + Socket.IO + Prisma 7                    -> Render (free)
netlify.toml     proxy /api/* -> Render (mismo origen: cookie first-party)
                 SPA fallback
```

Como el front y la API viven en dominios distintos:

- `/api/*` se proxea por el edge de Netlify. El navegador ve **un solo origen**, la
  cookie `SameSite=Lax` sigue siendo first-party y no interviene CORS.
- El WebSocket **no** se proxea (Netlify no lo soporta de forma confiable hacia un
  host externo): conecta directo a Render y se autentica con un token de 5 minutos
  (`GET /api/auth/socket-token`) enviado en el handshake.

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

En desarrollo no hace falta configurar nada: Vite proxea `/api` y `/socket.io` a
`localhost:3001`, así que todo corre como mismo origen.

## Despliegue en Render

Ver `render.yaml`: un web service en Render + **Postgres en Supabase** (externo).

- **Free tier** (decisión del usuario: nunca se paga por un servidor). El servicio
  duerme tras ~15 min sin tráfico y el primer request paga un arranque en frío de
  ~30-50 s. El cliente hace `fetch('/health')` cada 5 min mientras haya una pestaña
  abierta, así una sesión de 4 h no se corta por inactividad.
- El Postgres va en Supabase porque el free de Render **se elimina a los 90 días**.
  Usá el host del **session pooler** (puerto 5432), no el transaction pooler:
  `prisma migrate` necesita una conexión de sesión.

Variables: `DATABASE_URL`, `SESSION_SECRET` (`openssl rand -hex 32`),
`SEED_USERS` (`Nombre1:clave1,Nombre2:clave2` — idempotente, bcrypt),
`CLIENT_URL` (URL pública del servicio). `NODE_ENV=production` en Render.

Detalle del build: con `NODE_ENV=production`, `npm ci` omite devDependencies. Por eso
`tsx` vive en `dependencies` (el start corre TypeScript directo) y el build usa
`npm ci --include=dev` para tener el CLI de Prisma. Si movés `tsx` a devDependencies
sin compilar a JS, el servicio no arranca (`tsx: not found`, status 127).

## Estado

Ver `odd/tasks/obrateatral-mvp.md`. T1–T7 y T9 completos y verificados con
Chrome CDP (dos pestañas, mismo usuario). T8 (proxy HLS) pendiente de un link
real del estudio para comprobar CORS. T10 completo (configuración y notas de deploy).
