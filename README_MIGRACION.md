# Migración Cloud Functions → Render + Vercel

Contexto: el proyecto de Firebase (`bit-coffee-668f6`) no puede activar el
plan Blaze (error persistente `OR_BACR2_44` de Google Cloud Billing, sin
solución clara), y Blaze es obligatorio para usar Cloud Functions. Esta
migración reemplaza **solo la capa de cómputo**: las 6 funciones de
`backend/functions/` pasan a ser rutas de un servidor Express
(`backend/server/`), pensado para correr en Render. Firestore, Auth y FCM
siguen en Firebase exactamente igual que antes — no se tocaron.

Todo lo de este documento **ya está hecho** salvo la sección final
"Lo que falta — pasos manuales tuyos", que requiere tus credenciales reales
de Render/Vercel y no se puede automatizar desde acá.

## Qué cambió

- **`backend/server/`** (nuevo) — servidor Express con las 6 rutas
  (`createRestockRequest`, `editPendingRequest`, `acceptRestockRequest`,
  `rejectRestockRequest`, `dispatchRestockRequest`, `confirmReceipt`),
  probado contra el emulador de Firestore/Auth con los mismos 12+ casos
  (transiciones + negativos) que ya estaban validados en `TESTING_LOG.md`
  para las Cloud Functions — mismos resultados exactos.
- **`backend/functions/`** — **intacto, sin tocar**. Queda como respaldo
  hasta que confirmes que Render + Vercel funcionan de verdad en
  producción. No se borra ni se modifica en esta sesión.
- **`frontend/src/services/firebase/restockRequests.ts`** — los 6
  `httpsCallable(...)` se reemplazaron por `fetch()` contra
  `${VITE_API_URL}/xxx`, con el mismo header `Authorization: Bearer
  <idToken>` que ya usaba Firebase. La forma de la respuesta y de los
  errores (`err.message` en español) es idéntica — no hubo que tocar
  `RequestsPage`, `QueuePage`, `DispatchForm` ni `RejectReasonForm`.
- **`frontend/src/services/firebase/config.ts`** — se sacó el SDK de
  Firebase Functions (`getFunctions`/`connectFunctionsEmulator`), ya no se
  usa.
- **`render.yaml`** (raíz del repo) — Blueprint de un clic para Render.
- Probado end-to-end: servidor Express local + frontend real +
  emulador de Firestore/Auth, las 6 transiciones completas por click real
  en la UI (crear → editar → aceptar → despachar → confirmar recepción,
  con producción aceptando/despachando en el medio). Cero errores de
  consola, cero deploys a `bit-coffee-668f6`.

## `render.yaml` — Blueprint para Render

```yaml
services:
  - type: web
    name: 21-bit-coffee-api
    runtime: node
    rootDir: backend/server
    plan: free
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: FIREBASE_PROJECT_ID
        value: bit-coffee-668f6
      - key: FIREBASE_SERVICE_ACCOUNT_JSON
        sync: false
      - key: ALLOWED_ORIGIN
        sync: false
```

Con esto, Render puede crear el servicio desde el dashboard con "New +" →
"Blueprint", apuntando al repo — detecta `render.yaml` solo.

## Variables de entorno — Render (`backend/server`)

Estas se cargan a mano en el dashboard de Render (pestaña "Environment"),
**nunca en el repo**:

| Variable | Valor | Notas |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON completo de la cuenta de servicio, en una sola línea | Firebase Console → Configuración del proyecto → Cuentas de servicio → "Generar nueva clave privada". Render no permite subir archivos, por eso va como variable de texto. |
| `FIREBASE_PROJECT_ID` | `bit-coffee-668f6` | Ya viene precargado por `render.yaml` (no es secreto). |
| `ALLOWED_ORIGIN` | La URL real de Vercel, ej. `https://21-bit-coffee.vercel.app` | Sin slash final. Placeholder en `.env.example` hasta que exista el deploy de Vercel. |
| `PORT` | — | No hace falta setearla. Render la inyecta sola; el servidor ya lee `process.env.PORT`. |

`FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` — **no** se
configuran en Render. Son solo para desarrollo local; si están seteadas el
servidor intenta usar el emulador en vez de Firebase real.

## Variables de entorno — Vercel (`frontend`)

| Variable | Valor | Notas |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | (la real, ver `frontend/.env`) | Ya existe hoy, sin cambios. |
| `VITE_FIREBASE_AUTH_DOMAIN` | `bit-coffee-668f6.firebaseapp.com` | Sin cambios. |
| `VITE_FIREBASE_PROJECT_ID` | `bit-coffee-668f6` | Sin cambios. |
| `VITE_FIREBASE_STORAGE_BUCKET` | `bit-coffee-668f6.firebasestorage.app` | Sin cambios. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `800537398162` | Sin cambios. |
| `VITE_FIREBASE_APP_ID` | (la real, ver `frontend/.env`) | Sin cambios. |
| `VITE_FIREBASE_VAPID_KEY` | (la real, si ya la generaste para FCM) | Sin cambios — no relacionada con esta migración. |
| `VITE_USE_FIREBASE_EMULATOR` | `false` (o sin setear) | Producción nunca debe usar el emulador. |
| `VITE_API_URL` | **TODO** — recién se conoce después del primer deploy de Render | Ver siguiente sección. |

## Lo que falta — pasos manuales tuyos

Esto no lo puede hacer el agente: requiere tus credenciales reales en
Render y Vercel.

1. **Crear cuenta en Render** (si no tenés) en render.com, conectando tu
   cuenta de GitHub.
2. **Crear el servicio** — Dashboard de Render → "New +" → "Blueprint" →
   elegí el repo `kechavez07/21_bit_coffee` → Render detecta `render.yaml`
   solo.
3. **Cargar las variables de entorno de Render** (tabla de arriba) —
   especialmente `FIREBASE_SERVICE_ACCOUNT_JSON`, que tenés que generar vos
   desde Firebase Console (Configuración del proyecto → Cuentas de
   servicio → Generar nueva clave privada) y pegar el JSON completo como
   una sola línea.
4. **Dejar `ALLOWED_ORIGIN` en blanco por ahora** (o poner un placeholder)
   — todavía no existe la URL de Vercel.
5. **Deployar el servicio en Render** y confirmar que `https://tu-servicio.onrender.com/health`
   responde `{"ok":true}`.
6. **Crear/usar tu cuenta de Vercel**, conectar el repo, apuntar el
   "Root Directory" del proyecto a `frontend/`.
7. **Cargar las variables de entorno de Vercel** (tabla de arriba) —
   `VITE_API_URL` todavía no la tenés en este paso, dejala vacía o con
   cualquier placeholder.
8. **Deployar el frontend en Vercel** y copiar la URL real que te da
   (ej. `https://21-bit-coffee.vercel.app`).
9. **Volver a Render** y setear `ALLOWED_ORIGIN` = esa URL real de Vercel
   (sin slash final) → esto redeploya el servicio automáticamente.
10. **Volver a Vercel** y setear `VITE_API_URL` = la URL real de Render
    (ej. `https://21-bit-coffee-api.onrender.com`, sin slash final) →
    redeployá el frontend.
11. **Probar el flujo completo en producción real** — login, crear pedido,
    aceptar, despachar, confirmar recepción — igual que se probó acá
    contra el emulador, pero ahora contra `bit-coffee-668f6` real.
12. Recién ahí, si todo funciona, tiene sentido considerar borrar
    `backend/functions/` (no antes, y no automáticamente — es una decisión
    tuya aparte).

## Cómo correr todo localmente (para seguir probando)

```bash
# 1. Emulador de Firestore + Auth (desde backend/)
cd backend
firebase emulators:start --only firestore,auth

# 2. Sembrar datos de prueba (una vez, con el emulador arriba)
node functions/seed-emulator.js

# 3. Servidor Express (desde backend/server/, con backend/server/.env
#    apuntando al emulador — ver backend/server/.env.example)
cd server
npm install
npm start

# 4. Frontend (desde frontend/, con frontend/.env.local con
#    VITE_USE_FIREBASE_EMULATOR=true y VITE_API_URL=http://localhost:8081)
cd ../../frontend
npm run dev
```

Credenciales de prueba (sembradas por `seed-emulator.js`):
`test-cafeteria@example.com` / `test-produccion@example.com`, contraseña
`Test1234!` para ambas.
