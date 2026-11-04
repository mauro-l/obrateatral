# obrateatral — MVP: plataforma privada para analizar obras de teatro

Objective: Plataforma privada para 2 personas pares (Mauro y su amigo) que reproduce
las obras desde links **efímeros** del estudio (HLS directo, 4 h de validez) y mantiene
a ambos sincronizados. No hay archivos de video: lo que se sincroniza es el **estado de
reproducción**, no los bytes.
Branch: feat/mvp-platform (creada desde main)
Delivery strategy: ask-on-risk (no se esperan PRs sin aprobación explícita; commits por work-unit)
Test runner: ninguno configurado todavía (fase de scaffold); verificación por curl + Chrome/CDP
Risk: security (auth), real-time sync (concurrency), third-party media contract (HLS/CORS)

## Specs

> **Cambio de modelo (2026-11-03)**: por pedido del usuario, S1, S5, S6 y S7 quedaron
> reemplazados por **S15** (modelo de sesiones, sin persistir links). El catálogo fijo
> de 6 obras, `WatchProgress` por usuario y la tabla `Room` ya no existen.

S1. Catálogo de 6 obras (título, descripción, duración, portada, estado de visualización).
S2. El video NUNCA es una URL guardada en el repo ni en la DB: cada sesión pega un link
    efímero del estudio (~4 h válido). La sala guarda `source_url` + estado.
S3. Reproductor via **hls.js**. Verificado en Chrome 156 (Linux): `<video>` nativo NO reproduce
    HLS (`NotSupportedError`, `MEDIA_ERR_SRC_NOT_SUPPORTED`, `canPlayType` "maybe" engañoso).
S4. Sincronización por **Socket.IO** entre los navegadores. Eventos: `PLAY`, `PAUSE`, `SEEK`,
    `CHANGE_VIDEO`, `SYNC_STATE`, `USER_JOINED`, `USER_LEFT`. El **servidor es la autoridad** del
    estado (`version` incrementada por mutación); nunca al revés.
S5. Persistencia con PostgreSQL + Prisma, entidades: `Users`, `Plays`, `Rooms` (estado actual),
    `WatchProgress` (historial por usuario/obra). `Rooms` ≠ `WatchProgress` a propósito.
S6. Progreso: guardar posición al pausar/seek/cerrar; obra "vista" al umbral **90-95%**, no al final.
S7. Retomar: al pegar el link nuevo de la misma obra, la app aplica `currentTime = posición guardada`
    en **ambos** dispositivos (no se puede persistir el link viejo).
S8. El CDN del estudio podría exigir CORS: `Access-Control-Allow-Origin` requerido por hls.js
    (XHR). Referer no es el problema (se envía nada). Fallback: proxy del manifiesto en el backend.
S9. Auth privada (antes de desplegar).
S10. Deploy en Render (decisión del usuario). Advertencias: free tier duerme tras 15 min y
     rompe WebSockets; Postgres free expira a los 90 días.
S11. Fuera del MVP: chat, videollamada, perfiles públicos, multi-room, recomendaciones.
S15. Modelo (b) — la sesión es la entidad central:
     - Sólo se persisten `User` y `Session` (nombre libre + `positionSeconds`).
     - **Ningún link se guarda**: vive en la memoria del servidor y se descarta al
       vaciarse la sala. Motivo: son links firmados a contenido de terceros.
     - El reproductor soporta HLS (`.m3u8` + hls.js) y progresivo (`.mp4` directo a
       `<video src>`, sin CORS).
     - Si el link declara vencimiento (`s`+`e`), se muestra y se rechaza el vencido;
       si no lo declara, no se asume nada y sólo se reporta el error del player.

     > **Cambio (2026-11-04)**: esta regla quedó reemplazada por
     > `odd/tasks/obrateatral-encrypted-links-mobile.md`: el link ahora se persiste
     > encriptado (AES-256-GCM) para reutilizarlo mientras siga vigente, y se
     > completó la UI mobile.
S14. El link del estudio dice cuándo vence (`s` = emitido, `e` = duración, 14400 s).
     La app lo parsea: muestra la hora de vencimiento, rechaza links ya vencidos al
     cargarlos y descarta de la sala un link vencido (nunca lo sirve al player, que
     sólo produciría el video promocional del CDN). Tras pegar un link nuevo, ambos
     retoman desde la última posición guardada.
S13. Administración de cuentas desde la web (`/admin`, solo `role = "admin"`): crear
     usuario, renombrarlo y resetear su contraseña. El rol se lee de la DB en cada
     request (revocar es inmediato). El seed sólo bootstrapea el admin inicial
     (`SEED_USERS="nombre:clave:admin,..."`); la operación diaria es por la UI.
S12. Cambio de contraseña desde la web (`/cuenta`): exige la contraseña actual, mínimo 6
     caracteres, hash bcrypt nuevo. `db:seed` sólo crea usuarios faltantes y NUNCA
     sobrescribe una contraseña cambiada desde la UI.

## Tasks

- [x] T1. Scaffold: `client` (Vite+React+TS, hls.js, react-router-dom) y `server`
      (Express + Socket.IO + /health + /api/plays); server verificado (`/health` ok,
      `/api/plays` devuelve 6 placeholders).
- [x] T2. Catálogo: fetch `/api/plays`, grid con PlayCard. Verificado en Chrome
      (CDP): 6 cards renderizan, nav OK. (S1) — e9880b3
- [x] T3. Reproductor: hls.js + input para pegar el link efímero, ABR nativo.
      Verificado: cargar `test-streams.mux.dev/.../x36xhzz.m3u8` → blob URL,
      readyState 4, duration 634.58 s, sin errores en consola. (S3, S2) — e9880b3
- [x] T4. Sala sincronizada: `server/src/rooms.ts` (autoridad versiónada),
      `client/src/lib/useRoomSync.ts`. Verificado en Chrome CDP con dos pestañas:
      ambas ven 2 personas, `room:load` propaga el source_url automáticamente,
      drift < 0.02 s a los ~4.8 s, pause sincroniza al mismo instante,
      seek a 400 s idéntico en ambas. (S4) — 3f7e525
- [x] T5. PostgreSQL + Prisma: schema Users/Plays/Rooms/WatchProgress (Prisma 7,
      `@prisma/adapter-pg`, generated client en src/generated, `prisma.config.ts`),
      seed idempotente e upsert. Roles local: `obrateatral` (CREATEDB) + db
      `obrateatral` en cluster 16/5432. Servidor lee catálogo desde PG; salas se
      persisten e hidratan al reboot. (S5)
- [x] T6. Persistencia de progreso: seek/pause/leave → upsert por usuario
      (`lastPosition` nunca regresa, `completed` al 90% de `durationMinutes`).
      Verificado en Chrome CDP con 2 pestañas mismo usuario: tras seek a 600 y
      pausa, `/api/progress` devuelve `{ lastPosition: 600, completed: true }`
      (obra-1 puesta temporalmente a 11 min para la prueba, restaurada a 60,
      progreso y sala borrados tras la prueba). Historial real en UI. (S6)
- [x] T7. Retomar sesión: al pegar el link (o tras reiniciar server/hidratar
      desde PG), el cliente aplica posición guardada y arrastra a ambos.
      Verificado: tras matar el server y recargar ambas pestañas, el player
      volvió cargado en 30 s sin pegar el link de nuevo (hidratado desde PG). (S7)
- [x] T11. Cambio de contraseña web: POST /api/auth/change-password (requiere sesión y
      contraseña actual), página `/cuenta` con enlace en el nav, banner de confirmación.
      Seed pasa a `update: {}` para no pisar claves cambiadas por UI. Verificado E2E en
      Chrome: cambio -> la vieja da "Credenciales inválidas" -> la nueva entra -> revertido
      a teatro2026 -> login OK. (S12)
- [x] T12. Hosting partido: front en Netlify + API/Socket.IO en Render + PG en
      Supabase. `netlify.toml` proxea `/api/*` al host de Render (cookie first-party,
      sin CORS) y hace SPA fallback. El WebSocket conecta directo y se autentica con
      token de 5 min (`GET /api/auth/socket-token`, verificable en el handshake);
      el servidor acepta token o cookie (fallback dev). `CLIENT_URL` acepta lista
      separada por comas para CORS. `render.yaml` ya no compila el cliente.
      Verificado: `/api/auth/socket-token` 200 con sesión y 401 sin sesión; en el
      navegador la petición se hace y la sala conecta por token. (S10, S9)
- [x] T13. Cuentas administradas por la web: `User.role` (migración
      `20261103225003_add_user_role` con promoción de `mauro`), `server/src/admin.ts`
      (GET/POST/PATCH /api/admin/users con `requireAdmin`), `/me` devuelve el rol y
      cae a 401 si la cuenta no existe, página `/admin` con crear/renombrar/resetear
      y generador de contraseñas, enlace en el nav sólo para admin.
      Verificado: rename `teff`→`marcos` desde la UI (mismo id, misma clave),
      creación por API 201, y `marcos` (member) recibe 403 en /api/admin/users. (S13)
- [x] T14. Vencimiento de links: `linkExpiresAt`/`isLinkExpired` en `rooms.ts`
      (margen de 120 s), `sourceExpired` + `expiresAt` en el snapshot, `room:error`
      al intentar cargar un link vencido, y la UI muestra "vence alrededor de las HH:MM"
      o el aviso de que venció. Bug corregido en verificación: el flag se calculaba
      después de nullificar `sourceUrl`, así que nunca llegaba a la UI.
      Verificado: link vencido rechazado (no se guarda), sala con link vencido
      hidratada muestra el aviso y no monta el player, y el link real de obra-1
      quedó intacto. (S14)
- [x] T15. Modelo de sesiones: migración `sessions_only` (crea `Session`; borra
      `Play`, `Room` y `WatchProgress` con el link guardado), `server/src/sessions.ts`
      (GET/POST/PATCH), sala en RAM sin persistir URLs, posición por sesión,
      reproductor con soporte progresivo, UI con lista de sesiones y
      `/sesion/:id`. Verificado: HLS (readyState 4) y MP4 (readyState 4, reprodujo)
      con la posición guardada en `Session`; la tabla no tiene columna de URL.
      (S15)
- [ ] T8. Proxy del manifiesto HLS en el backend **solo si** se comprueba que falta
      `Access-Control-Allow-Origin` (pedir el link real primero). (S8)
- [x] T9. Auth privada: dos cuentas fijas (opción B) validadas con bcrypt,
      cookie httpOnly `obrateatral_session` (JWT, 30 días) en `/entrar`, `/api/auth/*`,
      `requireAuth` en /api/plays y /api/progress, middleware en Socket.IO.
      Seed via `SEED_USERS="name:password,..."` desde .env (gitignored).
      **Credenciales dev temporales**: Mauro-Dev / Amigo-Dev (de 4 bytes hex del
        `.env`). Pedir al usuario las definitivas antes o al desplegar. (S9)
- [x] T10. Deploy Render: `render.yaml` (web service `starter` + Postgres free
      con advertencia de expiración 90 días), `npm start` -> tsx src/server.ts
      con NODE_ENV=production (Express sirve client/dist), README con desarrollo,
      env vars y advertencias. Var: DATABASE_URL, SESSION_SECRET, SEED_USERS,
      CLIENT_URL. (S10)

## Log

L1 (req original, verbatim, fragmentos del usuario):
  "https://chatgpt.com/share/6aea4910-5700-83e9-927f-380a11d6573e"
  "ok, ahi pude charlar y es un poco mas complicado. no tiene los archivos.
   el estudio le genera un link con una duracion de 4hs. osea que cada vez que
   nos juntemos a analizar la obra debemos cargar un link que nos daran."
  "es algo asi el link /04/03291/c83xbg8d36oz_n/master.m3u8?t=lnm8rPPPNQYzsgMKF69mmnCqY6w7YSRM0q9M6gZHEXw&s=1793737748&e=14400&v=5004289&i=0.0&sp=0"
  "ok, lo correremos en render . ahora si empieza con la implementacion total"

Notas de diseño confirmadas:
 - El link es HMAC-SHA256: `t` = firma; `s` = 1793737748 (2026-11-03, hoy);
   `e` = 14400 (**exactamente 4 h**); `i` = offset inicial (`0.0`); `v` = id de asset.
   La firma es ineludible: a las 4 h da 403. No se puede forjar ni extender.
 - `sp=0`: flag desconocido, no interpretar.
 - `master.m3u8` = master playlist con ABR.

L2 (verificación con Chrome CDP, 2026-11-03): bug real de sync en el seek — el
cliente snap-backeaba al hacer seek a posiciones lejanas porque (a) `room:seek` se
emitía sólo en 'seeked' (evento asíncrono, posterior al tick de 5 s) y (b) el servidor
trataba el tick del reportante con posición en movimiento como drift y reenviaba
snapshot. En un seek a 600 desde 123, el drift correction devolvía al cliente a 123 y
el seek nunca se completaba. Fix: el cliente emite `room:seek` en `seeking` (intención,
no finalización) con dedupe por tiempo; el servidor ignora `room:tick` con `seeking:
true` para la corrección de drift. Verificado: seek a 600 se aplica y persiste
`completed: true`. Commit 2501056.

L9 (2026-11-03, verbatim del usuario): "si guardamos links en mi supabase estamos
comprometiendonos, como te dije pueden ser obras con copyright. yo no quiero tener
nada que ver con una demanda con nintendo asi que no me parece bueno guardar links
en mi supabase. [...] vi que tenemos 6 obras, pensaba hacerlas como sesiones.
ponemos el nombre y vos guardas los min etc etc. nosotros sabemos que estabamos
viendo y ya". Y luego: "si se pega otro link que no es ese que viste, es probable
que no contenga los mismos datos en el link [...] puede venir de otro lado".
Se implementó el modelo (b) con soporte de HLS y MP4. El usuario autorizó con "dale".

L8 (2026-11-03): el usuario detectó que el link queda guardado en `Room.sourceUrl`
(y por eso el otro navegador entra sin pegarlo) y que vence a las 4 h. Se implementó
el manejo de vencimiento leyendo `s`+`e` del propio link. Comportamiento final: con
link válido se muestra la hora de vencimiento; al vencer, la sala deja de servirlo y
pide uno nuevo; el progreso se conserva y al pegar el link nuevo ambos retoman la
posición.

L7 (2026-11-03, diagnóstico del link real del estudio): el player mostraba el
video promocional del CDN (`/taunt/promo/`) y parecía anti-hotlink. Falso: CORS
está abierto (`Access-Control-Allow-Origin: *`) y el CDN responde 200 con
cualquier combinación de Origin/UA/Sec-Fetch/sec-ch-ua/HTTP2. La causa era un
**302 cacheado** (`cache-control: max-age=8640000`, mismo `date` en requests
distintas) que el navegador servía a hls.js; con `fetch(..., {cache:'no-store'})`
la misma URL devuelve 200 y el manifiesto real. Conclusión: no hace falta proxy;
cada sesión estrena token → URL nueva → sin caché envenenada. Se agregó
`<meta name="referrer" content="no-referrer">` (higiene, no era la causa).

L6 (2026-11-03): el usuario pidió dejar de depender del seed: `mauro` pasa a admin
y gestiona cuentas desde `/admin` (crear, renombrar, resetear clave). Se aplicó el
rename `teff`→`marcos` por la UI, preservando el id y la contraseña. `SEED_USERS`
queda sólo para bootstrapear el admin en una base nueva.

L5 (2026-11-03, deploy Render): el start falló con `sh: 1: tsx: not found` /
status 127. Causa: `NODE_ENV=production` hace que `npm ci` omita devDependencies y
`tsx` estaba ahí, aunque `npm start` corre TypeScript directo. Fix: `tsx` pasa a
dependencies (es runtime real en este diseño), `engines.node >= 20`, y el
buildCommand usa `npm ci --include=dev` para tener Prisma CLI en el build.
Verificado con una instalación limpia `npm ci --omit=dev` en directorio temporal:
`tsx --version` responde.

L4 (2026-11-03): el usuario definió hosting partido: server en Render (blueprint,
tier FREE — nunca se paga) y front en Netlify. Consecuencia resuelta: cookie
SameSite=Lax no viaja cross-site, así que `/api` se proxea por Netlify y el
WebSocket se autentica con token corto en el handshake. Prisma se conectó a
Supabase (pooler session, 5432) y se verificó login, catálogo y escritura de
progreso; datos de prueba limpiados. Commit pendiente en feat/mvp-platform.

L3 (2026-11-03): cuentas definitivas `mauro` y `teff` con contraseña compartida
`teatro2026` (pedido explícito del usuario: "ponle una contraseña facil"), más opción
de cambiarla desde `/cuenta`. Keep-alive: el cliente hace `fetch('/health')` cada 5 min
mientras la hay pestaña abierta para que Render no duerma el servicio ni corte el
WebSocket. Base elegida: Supabase (el proyecto configurado en el MCP no respondía:
"Database is possibly not accessible"; el usuario crea uno nuevo).

Auth (resuelta por el usuario en sesión): opción B — dos cuentas fijas con bcrypt y
cookie httpOnly de sesión. Credenciales definitivas pendientes de pedir al desplegar.

L10 (2026-11-04): el usuario pidió persistir el link encriptado y completar mobile.
Revierte S15/L9 por decisión explícita. Se documentó el límite real (el server
desencripta para reproducir; protege contra fuga de DB, no contra usuarios ni
pedidos legales). Implementación y verificación en
`odd/tasks/obrateatral-encrypted-links-mobile.md`.
