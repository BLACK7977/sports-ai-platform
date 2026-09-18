# Preparación automática de próximos partidos — Fase 1

La ejecución es segura por defecto y siempre comienza como simulación:

```powershell
npm run prepare:upcoming
```

La escritura requiere confirmación explícita. En Windows, para evitar problemas de reenvío de argumentos de npm, usar directamente:

```powershell
npx tsx --env-file=.env.local --conditions=react-server src/lib/scripts/prepare-upcoming.ts --confirm
```

Opciones: `--horizon-days=14` y `--limit=20`. El proceso es secuencial, revalida cada kickoff y nunca reemplaza una predicción canónica existente. La migración `011_match_preparation_state.sql` debe ser revisada y aplicada antes de una ejecución confirmada.
