# Subagentes de Claude Code — Sistema de Inventario Cafetería/Producción

Este paquete contiene 3 subagentes listos para usar con Claude Code, divididos por capa técnica:

| Archivo | Agente | Enfoque |
|---|---|---|
| `.claude/agents/frontend-developer.md` | `frontend-developer` | React + Vite + PWA, pantallas y componentes |
| `.claude/agents/backend-firebase.md` | `backend-firebase` | Firestore, reglas de seguridad, transacciones, Cloud Functions, FCM |
| `.claude/agents/testing-qa.md` | `testing-qa` | Tests, casos límite, QA end-to-end |

## Cómo instalarlos

1. Copia la carpeta `.claude/agents/` a la raíz de tu proyecto (donde correrás Claude Code), fusionándola si ya existe una carpeta `.claude/`.
2. Abre Claude Code en ese proyecto. Los tres subagentes quedan disponibles automáticamente.
3. Puedes invocarlos explícitamente, por ejemplo:
   - "Usa el agente frontend-developer para crear la pantalla de login."
   - "Usa el agente backend-firebase para definir las reglas de seguridad de Firestore."
   - "Usa el agente testing-qa para escribir las pruebas de la transacción de venta."
4. Claude Code también puede invocarlos automáticamente cuando la tarea coincide con la `description` de cada uno.

## Notas
- Cada agente tiene su propio checklist de tareas, alineado a las 7 fases del plan de desarrollo (Fase 0 a Fase 7).
- Los tres comparten el mismo modelo de datos de Firestore (documentado dentro de `backend-firebase.md`) para mantener consistencia.
- Si cambias el modelo de datos o el flujo de negocio, actualiza los tres archivos para que no queden desincronizados.
