# obrateatral — link encriptado en sesiones + mobile

Objective: persistir el link del estudio encriptado (AES-256-GCM) para reutilizarlo
mientras siga vigente, mostrar vencimiento/cuenta regresiva, permitir copiarlo aun
vencido, y completar la UI mobile. Reemplaza la regla S15 "ningún link se guarda".
Branch: main (cambios locales; sin push ni deploy)
Delivery strategy: ask-on-risk
Test runner: ninguno configurado; verificación con build + DB local temporal + socket E2E
Risk: item 1 (formato persistido nuevo), item 2 (clave de encriptación), item 5 (env de deploy)

## Specs

S1. Mobile (320–430 px): el header/nav no se desborda (envuelve), targets táctiles
    ≥ 44 px, inputs con font-size ≥ 16 px (evita zoom en iOS), `.watch-layout` apila,
    nombres largos y links no generan scroll horizontal, panel y listas legibles.
S2. El link pegado se persiste en `Session` encriptado con AES-256-GCM. La DB nunca
    contiene el texto plano: columnas `sourceUrlEnc` (texto `v1.iv.tag.ct` en base64)
    y `sourceExpiresAt`. Migración aditiva, no destructiva.
S3. `LINK_KEY` vive en el entorno del server (Render), nunca en Supabase. Si falta o
    es inválida, el link sigue viviendo sólo en RAM y se emite un warning; la app no
    se cae. No se loguea el link ni el ciphertext.
S4. Al entrar a una sesión cuyo link guardado sigue vigente, el server lo desencripta
    y lo carga automáticamente (reutilizar) sin volver a pegarlo.
S5. Si el link declara `s` + `e`, la UI muestra cuenta regresiva en vivo y el estado
    vencido. Si no lo declara, no se inventa nada.
S6. Copiar el link funciona con link vigente o vencido mediante endpoint autenticado
    (`GET /api/sessions/:id/link`). El texto plano nunca se renderiza en la UI.
S7. Un link vencido no se sirve al player; al cruzar el umbral la sala emite el estado
    vencido (timer server-side) y conserva el ciphertext para poder copiarlo.
S8. `GET /api/sessions` y `GET /api/sessions/:id` devuelven sólo metadatos del link
    (`hasLink`, `linkExpiresAt`, `linkExpired`), nunca el ciphertext ni el texto plano.

## Tasks

- [x] T1. `server/src/linkCrypto.ts` + `server/src/linkExpiry.ts` (AES-GCM, parseo s/e).
      Verificado: round-trip, ciphertext sin plaintext, tamper → null, s+e / sin s / sólo e.
- [x] T2. Schema `Session.sourceUrlEnc`/`sourceExpiresAt` + migración aditiva.
      Verificado: `prisma migrate deploy` en DB local temporal (4 migraciones OK).
- [x] T3. `sessions.ts`: forma pública sin link, endpoint autenticado de copia.
      Verificado: list/detail sin ciphertext ni plaintext; copia 200; sin auth 401.
- [x] T4. `rooms.ts`: persistir al cargar, desencriptar al entrar, timer de vencimiento.
      Verificado por socket E2E: reuso tras reiniciar sala, timer emite `sourceExpired`.
- [x] T5. Cliente: tipos/API, cuenta regresiva, copiar, aviso de reutilización.
      Verificado en Chrome: badge guardado/vencido, countdown, copiar vigente y vencido,
      plaintext nunca en el DOM.
- [x] T6. CSS mobile (header/nav, formularios, panel, listas, touch targets).
      Verificado a 390x844: sin overflow horizontal, nav envuelve, targets 46 px,
      input 17 px.
- [x] T7. Verificación: build cliente+server, migración en DB local temporal,
      socket E2E (persistencia/reuso/vencimiento/copia), viewport mobile.
      Resultado: 22/22 checks E2E; `tsc --noEmit` server OK; `vite build` OK.

## Log

L1 (2026-11-04, verbatim): "ok, la web ya esta funcionando, ya la estuve usando pero
note que la parte mobile no esta hecha. hay que hacer eso y ademas se me ocurrio que
en las sesiones, una vez que se pega el link este quede almacenado pero encriptado,
asi como si fuera una contraseña cosa que no se puede leer. y si el link ofrece
timestamp o cuenta regresiva, que me muestre esa informacion de si venció o no. que
haya una opcion de reutilizar si este no expiró y de copiar el link sea que haya
expirado o no. es esto posible? tratarlo como si fuera una contraseña que este bien
encriptada y que no se muestre a cualquiera?"

L2 (2026-11-04, verbatim): "es que avancemos con eso porque ya que de por si estamos
consumiendo ese link y esta expuesto. desde un principio estamos expuestos asi que no
tiene sentido. con la link encriptado en mi db la unica forma de verlo es que yo lo
desencripte no?"

L3 (2026-11-04, aclaración técnica): se avisó que el server desencripta automáticamente
para reproducir, así que la encriptación protege contra una fuga de DB sola (sin
`LINK_KEY`), no contra usuarios logueados ni contra un pedido legal. El usuario
autorizó avanzar ("avancemos con eso"). Decisión: se conserva el ciphertext después
del vencimiento para cumplir "copiar aunque haya expirado"; el player nunca recibe un
link vencido.

L4 (2026-11-04, decisión de diseño): el ciphertext se escribe desde `room:load`
(mismo flujo que ya carga el link), y `getOrCreate` lo desencripta al reabrir la sala.
`LINK_KEY` acepta 64 hex o cualquier secreto fuerte (se deriva con SHA-256).

L5 (2026-11-04, verificación): DB local temporal `obrateatral_verify` (no se tocó
Supabase). `prisma migrate deploy` aplicó las 4 migraciones. Script socket E2E:
22/22 checks (persistencia cifrada, list/detail sin fuga, copia autenticada 200 /
sin auth 401, reuso tras reiniciar la sala, timer de vencimiento, copia vencida,
rechazo de link ya vencido y no persistido). En Postgres: `sourceUrlEnc` empieza
con `v1.` y 0 filas contienen `cdn.example`. Chrome/CDP a 390x844: sin overflow
horizontal, nav envuelve, targets de 46 px, input 17 px, badges y cuenta regresiva
correctos, copiar vigente y vencido funciona, el texto plano nunca aparece en el DOM.
Hallazgo corregido: el error del reproductor estaba dentro de `.player-shell`
(`overflow: hidden`), así que no se veía; se movió fuera del contenedor.
