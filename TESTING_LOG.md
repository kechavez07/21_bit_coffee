# Testing Log — sesión de emulador (2026-08-14)

Entorno: Firebase Emulator Suite local (Auth :9099, Functions :5001, Firestore :8090),
frontend contra `http://localhost:5173` con `VITE_USE_FIREBASE_EMULATOR=true`. Nada de
esto tocó `bit-coffee-668f6` real — cero deploys, todo local.

## Fase 0 — Entorno

- Puerto 8080 (default de Firestore emulator) ocupado por `iphlpsvc` (servicio de
  Windows, PID vía `svchost.exe`) — **no** un emulador colgado. No se tocó ese proceso.
  Firestore emulator reconfigurado a **8090** en `backend/firebase.json` y
  `frontend/src/services/firebase/config.ts`.
- `firebase.json` no tenía bloque `emulators.auth` — el CLI avisaba "Not starting the
  auth emulator". Agregado (`port: 9099`, matching lo que `config.ts` ya asumía).
- Primer intento de `firebase emulators:start` quedó colgado sin output — el CLI estaba
  esperando confirmación interactiva (probablemente la descarga del jar del emulador en
  el primer uso) contra un proceso sin TTY. Resuelto con `CI=true`.
- Ese primer intento colgado, al cortarlo, dejó un `java.exe` huérfano en el puerto 8090
  (el JVM del emulador de Firestore, cuyo proceso padre de Firebase CLI ya había
  terminado). Identificado con `tasklist` y cerrado con `taskkill /PID <pid> /F` — este
  sí era el caso "emulador colgado de sesión anterior", a diferencia del `iphlpsvc`.
- Los 3 emuladores (Auth, Functions, Firestore) arrancan limpio con
  `CI=true firebase emulators:start --only firestore,functions,auth`. Las 6 Cloud
  Functions + `ping` cargan correctamente en el runtime real de Functions.

## Fase 1 — Frontend conectado al emulador

- `frontend/.env.local` creado (gitignored) con `VITE_USE_FIREBASE_EMULATOR=true`,
  superpuesto a `frontend/.env` (que ya tenía las credenciales reales del proyecto).
- Puertos en `config.ts` confirmados: Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8090`,
  Functions `127.0.0.1:5001` — coinciden con `backend/firebase.json`.
- `npm run dev` arriba en `:5173` sin errores. Verificado con browser headless
  (`/login`): consola limpia, aparece `[firebase] Using local emulator suite
  (VITE_USE_FIREBASE_EMULATOR=true)`, formulario de login renderiza bien (tabs
  Contraseña / Enlace por correo).

## Fase 1.5 — String literal del rol

Confirmado por grep, no asumido — `"cafeteria"` / `"production"` (inglés, sin tilde,
minúsculas) en:
- `backend/functions/lib/validation.js:36` (`getCallerRole`)
- `backend/functions/lib/restockRequests.js` (los 6 `requireRole(uid, "...")`)
- `frontend/src/services/firebase/auth.ts:46,135` (`UserRole`, `getUserRole`)

`"pasteleria"` NO existe como valor de dato en ningún lado — es únicamente el label de
UI (`ROLE_LABELS.production` en `utils/restockRequests.ts`). Los usuarios de prueba se
sembraron con el valor real (`"cafeteria"` / `"production"`).

## Fase 2 — Datos sembrados

Script: `backend/functions/seed-emulator.js` (dev-only, nunca deployado — no lo
requiere `index.js`). Idempotente para los usuarios, siempre crea producto/variante
nuevos para no pisar stock de una corrida anterior.

```json
{
  "cafeteria": { "email": "test-cafeteria@example.com", "uid": "w1Pv3fRQVmqI7AmfaJTZeFjcrsED" },
  "production": { "email": "test-produccion@example.com", "uid": "aC9NR3sfMelgPfvcWyMwtFEQGYga" },
  "product": { "id": "FzFFHkGRSy3sYQWbsFGz", "name": "Galleta de prueba" },
  "variant": { "id": "n00hLiyxk6gn3MvQfeUa", "flavor": "Chocolate", "stock": 50, "minStockAlert": 10 }
}
```
Password de ambas cuentas de prueba: `Test1234!`.

## Fase 3, Paso 1 — Las 6 funciones directo contra `:5001`

### 🐛 Bug real #1 (CRÍTICO, corregido): `admin.firestore.FieldValue` es `undefined` dentro del runtime del emulador de Functions

- **Síntoma**: `createRestockRequest` (y las otras 5, mismo patrón) tiraban
  `TypeError: Cannot read properties of undefined (reading 'serverTimestamp')` en
  runtime, aunque el mismo código funcionaba en un script Node suelto.
- **Causa**: el patrón clásico de namespace (`admin.firestore.FieldValue`,
  `admin.messaging()`, `admin.firestore()`) no resuelve de forma confiable dentro del
  runtime del Functions Emulator con esta versión de `firebase-admin`/`firebase-tools`.
- **Fix**: migrado a imports modulares (`firebase-admin/firestore`,
  `firebase-admin/messaging`) en `lib/validation.js`, `lib/notify.js`,
  `lib/restockRequests.js` — `getFirestore()`, `FieldValue`, `getMessaging()` en vez de
  `admin.firestore()`/`admin.firestore.FieldValue`/`admin.messaging()`. Es además el
  patrón recomendado actual del SDK, no es un workaround frágil.
- **Verificado**: las 6 funciones responden `{"result":...}` después del fix.

### Resultados (todos contra `http://127.0.0.1:5001/bit-coffee-668f6/us-central1/...`, con ID tokens reales obtenidos del Auth emulator vía `accounts:signInWithPassword`)

| Paso | Resultado |
|---|---|
| `createRestockRequest` (cafetería, qty 5) | ✅ `{"result":{"id":"qu3JpLpRu0WgxNvEsVlJ"}}` |
| `editPendingRequest` (cafetería, qty 5→7, sigue pending) | ✅ éxito |
| `acceptRestockRequest` (producción, pending→queued) | ✅ éxito |
| `rejectRestockRequest` sobre el mismo pedido ya `queued` | ✅ **falla como se esperaba**: `FAILED_PRECONDITION` — `"Este pedido ya no está en un estado válido para esta acción (estado actual: \"queued\")."` |
| `dispatchRestockRequest` qty≠pedida SIN nota | ✅ **falla como se esperaba**: `INVALID_ARGUMENT` — `"\"Galleta de prueba\" tiene una cantidad distinta a la pedida (7) — agrega una nota explicando por qué."` |
| `dispatchRestockRequest` qty≠pedida CON nota (4 de 7) | ✅ éxito, `queued→dispatched` |
| `confirmReceipt` (cafetería, `dispatched→received`) | ✅ éxito. Verificado en Firestore: `variant.stock` 50→**54** (+4, el `dispatchedQty` real, no el `requestedQty`), doc final con `receivedBy`/`receivedAt`/`dispatchedBy`/`acceptedBy` todos poblados correctamente |
| `createRestockRequest` con `requestedQty: 501` | ✅ **falla como se esperaba**: `INVALID_ARGUMENT` — `"La cantidad pedida no puede superar 500 unidades por producto."` (H-08) |
| `createRestockRequest` con `requestedQty: 500` (límite exacto) | ✅ éxito — confirma que el límite es `≤500`, no `<500` |
| Cafetería llama `acceptRestockRequest` (production-only) | ✅ **falla como se esperaba**: `PERMISSION_DENIED` — `"Tu cuenta no tiene permiso para hacer esto."` |
| Producción llama `createRestockRequest` (cafetería-only) | ✅ **falla como se esperaba**: mismo mensaje |
| Sin token de auth | ✅ **falla como se esperaba**: `UNAUTHENTICATED` — `"Debes iniciar sesión para hacer esto."` |

12/12 casos se comportan según el contrato. Sin bugs adicionales encontrados en esta pasada.

## Fase 3, Paso 2 — UI real (`localhost:5173`)

- Login como `test-cafeteria@example.com` desde el formulario real: ✅ funciona,
  redirige a `/cafeteria`, tabs Dashboard/Catálogo/Movimientos/Pedidos visibles.

### 🐛 Bug real #2 (corregido): `useCatalog`/`useMovements`/`useRestockRequests` se quedan en "Cargando…" para siempre si el listener SOLO recibe errores

- **Síntoma**: con las reglas actuales (`firestore.rules` deny-all para `products` —
  esperado, es H-02, pendiente de Fase 4), el Dashboard de Cafetería se quedaba
  mostrando "Cargando…" indefinidamente en vez de mostrar el error. Confirmado con
  `curl` directo a la REST API de Firestore que el 403 sí llegaba
  (`PERMISSION_DENIED — false for 'list' @ L39`), o sea el problema no era la regla, era
  el hook.
- **Causa**: en los 3 hooks, `loading` se calcula como `!(xLoaded && yLoaded)`, pero el
  callback de error de `onSnapshot` solo hacía `setError(...)` — nunca marcaba
  `xLoaded`/`yLoaded` como `true`. Si el listener solo dispara error (nunca éxito),
  `loading` queda `true` para siempre y el componente nunca llega a renderizar la
  pantalla de error, aunque `error` sí esté seteado.
- **Fix**: en `useCatalog.ts`, `useMovements.ts`, `useRestockRequests.ts`, el callback de
  error ahora también marca el flag de "loaded" correspondiente — un error cuenta como
  "terminó de cargar" tanto como un éxito. (`useComments.ts` ya lo hacía bien, no se tocó.)
- **Verificado**: tras el fix, recargando `/cafeteria` con las reglas todavía en
  deny-all, la pantalla pasa correctamente a "No se pudo cargar el catálogo / Ocurrió un
  problema al cargar los datos. Intenta de nuevo." en vez de quedarse colgada.

### Pendiente de esta fase

El resto del recorrido de Paso 2 (crear pedido desde el formulario, aceptar/despachar
desde la cuenta de producción, confirmar recepción, todo por click) **no se pudo
completar todavía** — las pantallas de Catálogo/Pedidos dependen de listeners de
Firestore que hoy están bloqueados por las reglas deny-all (H-02, todavía sin resolver).
Se retoma en Fase 4, después de escribir las reglas — el propio plan ya lo anticipaba
("repetir el recorrido... para confirmar que el listado ahora sí se ve en pantalla").

## Resumen de bugs encontrados y corregidos en esta sesión

1. **`admin.firestore.FieldValue` undefined en el emulador de Functions** — las 6 Cloud
   Functions de Fase 1 crasheaban en cualquier escritura. Corregido migrando a imports
   modulares del Admin SDK.
2. **Loading colgado para siempre en `useCatalog`/`useMovements`/`useRestockRequests`
   cuando el listener solo recibe errores** — bug preexistente del frontend (no
   introducido en esta sesión), encontrado al ejercitar el flujo real contra reglas
   restrictivas. Corregido en los 3 hooks.

Ninguno de los dos era ambigüedad de spec — ambos eran bugs de implementación
reproducibles, confirmados con evidencia (stack trace del emulador en el caso 1, curl
directo a la REST API de Firestore en el caso 2) antes de tocar código.

## Fase 4 — Reglas de Firestore + tests + recorrido completo

### Reglas escritas (`backend/firestore.rules`)

Alcance exacto pedido: `products`, `variants`, `restock_requests` + subcolección
`comments`. `users/{uid}` y `sales`/`merma` sin tocar — estos últimos siguen bajo el
fallback deny-all (H-02, fuera de alcance de esta pasada; siguen rotos a propósito).

- `products`/`variants`: lectura para ambos roles, escritura solo `cafeteria`.
  `isCatalogFieldUpdate()`/`isStockOnlyUpdate()` en variants son mutuamente excluyentes
  (nombradas igual que en los comentarios de `catalog.ts`, que ya asumían su existencia).
  `isValidVariantCreate()` verifica que el `productId` referenciado exista de verdad
  (`exists()`).
- `restock_requests`: como toda escritura legítima pasa por las 6 Cloud Functions
  (Admin SDK, que siempre ignora las reglas), el bloque de reglas para este documento es
  "segunda barrera" documentada como tal — espeja la misma máquina de estados
  (`isValidAccept`/`isValidReject`/`isValidDispatch`/`isValidEdit`/`isValidConfirmReceipt`),
  incluyendo que `reject` solo es válido desde `pending`.
- `comments`: escritura directa de cliente (no pasa por callable), valida
  `authorUid == auth.uid` y `authorRole` contra el rol real (vía `get()` a `users/{uid}`).

### 🐛 Bug real #3 (corregido, antes de probar): estructura inválida del archivo de reglas

Al escribir el primer intento, dejé las `function` y los nuevos `match` FUERA de
`service cloud.firestore { match /databases/{database}/documents { ... } } }` — Firestore
rechazó el archivo (`firestore.rules:85:1 - ERROR Unexpected 'match'`, y dos más). El
emulador loggea esto solo (`Change detected, updating rules...` seguido del error), no
frena el arranque — hay que mirar el log para notarlo. Corregido anidando todo
correctamente dentro del bloque `service`; el emulador confirmó `Rules updated.` sin
errores en el segundo intento.

### Tests automatizados (`backend/tests/firestore.rules.test.js`)

Nuevo `backend/package.json` (separado de `functions/package.json` — no es código de
Cloud Functions) con `@firebase/rules-unit-testing`, corridos con el test runner nativo
de Node (`node --test`, sin agregar Jest/Mocha). 19 casos, contra un `projectId` de test
aislado (no toca los datos sembrados de `bit-coffee-668f6`):

```
ℹ tests 19
ℹ pass 19
ℹ fail 0
```

Cubre: creación/lectura de products por rol, mezcla catálogo+stock rechazada en variants,
`isStockOnlyUpdate`/`isCatalogFieldUpdate` cada uno por separado, variant con `productId`
inexistente rechazada, creación de pedido por rol, aceptar pendiente→cola,
**rechazar-desde-cola rechazado por la regla** (mismo caso que probé por HTTP en Fase 3),
edición de pedido ajeno rechazada, salto directo pending→dispatched rechazado, comentarios
(uid propio ok / suplantación rechazada / mentir sobre el rol rechazado), y confirmación de
que `sales` sigue bloqueado (fuera de alcance).

(Nota: `node --test tests/` como directorio no funcionó en esta versión de Node —
`Cannot find module '...\backend\tests'`. Apuntar al archivo directo
(`node --test tests/firestore.rules.test.js`) sí funciona; así quedó el script en
`package.json`.)

### Recorrido completo por la UI real, con las reglas activas

Sin bugs nuevos — todo funcionó al primer intento una vez las reglas estuvieron bien
estructuradas:

1. Cafetería → Pedidos → "+ Nuevo pedido" → Galleta de prueba/Chocolate, cantidad 3 → "Enviar
   pedido". Aparece en la lista como Pendiente.
2. Cafetería → "Editar" sobre ese mismo pedido → cantidad 3→6 → "Guardar cambios". Detalle
   confirma cantidad 6.
3. Cerrar sesión, login como `test-produccion@example.com` → Dashboard read-only muestra
   el stock real (54, sin controles de escritura) → Solicitudes → pedido de cantidad 6 →
   "Aceptar". Pasa a "En cola", desaparece de pendientes.
4. **Confirmado visualmente que "Rechazar" no existe en la pestaña Cola** — solo
   "Despachar". Coincide con lo documentado en Fase 3 y con la regla de Firestore nueva
   (reject solo válido desde `pending`).
5. Cola → "Despachar" → cantidad pre-cargada en 6 (coincide con lo pedido, nota opcional)
   → "Confirmar despacho". Cola queda vacía.
6. Cerrar sesión, login como cafetería de nuevo → Pedidos → pedido en estado "Despachado" →
   "Confirmar recepción". Pasa a "Recibido", tabla muestra Pedido=6/Despachado=6/Nota="—".
7. Catálogo → stock de la variante: **60** (54 + 6). Confirmado también leyendo Firestore
   directo vía REST API con el token de la cuenta de prueba.

Sin errores de consola en ningún paso.

## Resumen final de bugs encontrados y corregidos en esta sesión

1. `admin.firestore.FieldValue` undefined en el runtime del emulador de Functions —
   crasheaba las 6 Cloud Functions. Migrado a imports modulares del Admin SDK.
2. Loading colgado para siempre en `useCatalog`/`useMovements`/`useRestockRequests`
   cuando el listener solo recibe errores. Corregido marcando "loaded" también en el
   callback de error.
3. Estructura inválida en el primer borrador de `firestore.rules` (bloques fuera de
   `service cloud.firestore { match /databases/{database}/documents { ... } } }`).
   Corregido antes de que llegara a probarse contra la app real — el emulador lo señaló
   en el log al recargar.

Ningún bug era ambigüedad de spec. Los tres se confirmaron con evidencia concreta antes
de tocar código: stack trace del emulador (#1), curl directo a la REST API de Firestore
(#2), y el propio log de compilación de reglas del emulador (#3).

## Estado final

Fases 0 a 4 completas. Flujo de pedidos de reposición (los 6 pasos) funciona de punta a
punta contra el emulador: Cloud Functions, reglas de Firestore, y UI real, los tres
niveles probados y coherentes entre sí. Nada de esto se desplegó contra
`bit-coffee-668f6` — sigue pendiente una revisión humana antes de ese paso (no hay plan
Blaze activo, y aunque lo hubiera, corresponde una decisión explícita aparte).

Fuera de alcance de esta sesión, sin resolver: `sales`/`merma` bajo el fallback deny-all
(H-02 parcial), `users/{uid}` sin tocar, y ningún deploy real ejecutado.
