# obrateatral

Sala privada para analizar obras de teatro con un amigo. **No se guarda el video**:
cada encuentro es una *sesión* a la que le ponés un nombre, se pega el link que
entrega el estudio y la app guarda por dónde van (los minutos). El link se persiste
**encriptado con AES-256-GCM** para reutilizarlo mientras siga vigente; la base
nunca contiene la URL en texto plano. El estado de reproducción se sincroniza entre
los dos navegadores por Socket.IO y el servidor es la autoridad.

## Arquitectura

Hosting partido: **front en Netlify**, **API + Socket.IO en Render (free)**,
**Postgres en Supabase**.

```
client/          React + Vite + TypeScript (SPA con BrowserRouter) -> Netlify
server/          Express + Socket.IO + Prisma 7                    -> Render
netlify.toml     proxy /api/* -> Render (mismo origen: cookie first-party)
```

Dos detalles que sostienen el diseño:

- `/api/*` se proxea por el edge de Netlify. El navegador ve **un solo origen**,
  la cookie `SameSite=Lax` sigue siendo first-party y no interviene CORS.
- El WebSocket **no** se proxea (Netlify no lo soporta de forma confiable hacia un
  host externo): conecta directo a Render y se autentica con un token de 5 minutos
  (`GET /api/auth/socket-token`) enviado en el handshake.

## Qué se guarda (y qué no)

| Tabla | Contenido |
| --- | --- |
| `User` | cuenta, hash bcrypt, rol (`admin` / `member`) |
| `Session` | nombre libre, `positionSeconds`, link encriptado (`sourceUrlEnc`), vencimiento (`sourceExpiresAt`), timestamps |

**El link del estudio se persiste encriptado**, nunca en texto plano. Se cifra con
AES-256-GCM usando `LINK_KEY`, que vive sólo en el entorno del servidor (Render),
no en la base: una fuga de la base sin esa clave no permite leer los links. La sala
lo desencripta al entrar para reutilizarlo mientras siga vigente; si venció, deja de
servirse al reproductor pero sigue disponible para copiar.

Límite honesto: como el servidor debe desencriptarlo para reproducir, cualquier
usuario autenticado que abra la sesión puede obtenerlo por la API. La encriptación
protege contra una fuga de la base, no contra usuarios logueados ni un pedido legal.

## Reproductor

Soporta dos formatos, porque los proveedores entregan cosas distintas:

- `.m3u8` → **hls.js** (Chrome no reproduce HLS nativo; verificado con
  `MEDIA_ERR_SRC_NOT_SUPPORTED`). Requiere `Access-Control-Allow-Origin` del CDN.
- `.mp4` / progresivo → se asigna directo a `<video src>`; **no necesita CORS**.
- Si el link declara su vencimiento (`s` = emitido, `e` = duración en segundos), la
  app muestra una cuenta regresiva y el vencimiento nominal, y deja de servirlo unos
  2 minutos antes (margen de seguridad). Si no lo declara, no inventa nada.
- El link guardado se reutiliza automáticamente al entrar mientras siga vigente, y
  se puede copiar (vigente o vencido) sin mostrarlo en pantalla.

## Desarrollo

```bash
# PostgreSQL (o apuntá DATABASE_URL a Supabase)
cd server
printf 'PORT=3001\nCLIENT_URL=http://localhost:5173\nDATABASE_URL=postgresql://USER:PASS@localhost:5432/obrateatral\nSESSION_SECRET=%s\nLINK_KEY=%s\nSEED_USERS="mauro:clave:admin,marcos:clave"\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env
npm install && npx prisma migrate deploy && npm run db:seed
npm run dev             # http://localhost:3001

cd ../client && npm install && npm run dev   # http://localhost:5173
```

En desarrollo no hace falta configurar nada más: Vite proxea `/api` y `/socket.io`
a `localhost:3001`, así que todo corre como mismo origen.

## Despliegue en Render

Ver `render.yaml` (web service **free**). El servicio duerme tras ~15 min sin
tráfico y el primer request paga un arranque en frío; el cliente hace
`fetch('/health')` cada 5 min mientras haya una pestaña abierta, así que una sesión
de 4 h no se corta.

Variables: `DATABASE_URL` (pooler de Supabase, puerto 5432), `SESSION_SECRET`
(`openssl rand -hex 32`), `LINK_KEY` (clave AES-256-GCM; Render la genera sola),
`SEED_USERS` (`nombre:clave:admin,...`, sólo crea usuarios faltantes), `CLIENT_URL`
(URL de Netlify) y `NODE_ENV=production`. Si apuntás otro entorno a la misma base,
reusá el mismo `LINK_KEY` o los links guardados no se podrán desencriptar.

Detalle del build: con `NODE_ENV=production`, `npm ci` omite devDependencies. Por
eso `tsx` vive en `dependencies` (el start corre TypeScript directo) y el build usa
`npm ci --include=dev` para tener el CLI de Prisma.
