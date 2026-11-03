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
- [ ] T8. Proxy del manifiesto HLS en el backend **solo si** se comprueba que falta
      `Access-Control-Allow-Origin` (pedir el link real primero). (S8)
- [x] T9. Auth privada: dos cuentas fijas (opción B) validadas con bcrypt,
      cookie httpOnly `obrateatral_session` (JWT, 30 días) en `/entrar`, `/api/auth/*`,
      `requireAuth` en /api/plays y /api/progress, middleware en Socket.IO.
      Seed via `SEED_USERS="name:password,..."` desde .env (gitignored).
      **Credenciales dev temporales**: Mauro-Dev / Amigo-Dev (de 4 bytes hex del
        `.env`). Pedir al usuario las definitivas antes o al desplegar. (S9)
- [ ] T10. Deploy Render: `render.yaml` + notas (web service + plan con WebSockets,
      Postgres con expiración documentada, env vars, `CLIENT_URL`). (S10)

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

Pregunta abierta (Ask trigger, bloquea solo T9):
 - Auth: ¿contraseña compartida (passphrase única para los dos) o 2 cuentas fijas
   (usuario+clave hasheada) con sesión por cookie httpOnly?
