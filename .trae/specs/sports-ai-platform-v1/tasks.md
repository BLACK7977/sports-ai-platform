# Sports AI Platform v1 - Implementation Plan

## Fase 0 — Infraestructura y Configuración Base

---

## Task 1: Instalar dependencias necesarias (Zod, Supabase JS, LLM SDK)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Agregar `zod` para validación de esquemas en todas las capas.
  - Agregar `@supabase/supabase-js` como cliente DB (el IDE provee las keys via integración).
  - Agregar SDK del proveedor LLM default: `openai` (se abstraerá luego).
  - Justificación: sin estas 3 dependencias no podemos construir las capas de datos, validación ni IA.
- **Acceptance Criteria Addressed**: AC-7 (dependencias typescript-friendly)
- **Files Modified**: [package.json](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/package.json) (agregar 3 deps y `npm install`)
- **Files Created**: Ninguno nuevo (solo actualizar package.json / package-lock.json)
- **Test Requirements**:
  - `rule` TR-1.1: `npm ls zod @supabase/supabase-js openai` retorna las 3 paquetes instalados
  - `rule` TR-1.2: `npm install` exit code 0
- **Notes**: Si el usuario prefiere Anthropic sobre OpenAI, se intercambia paquete antes de Task 7.

---

## Task 2: Configurar variables de entorno y validación
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Crear `.env.example` con todas las vars necesarias (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, NODE_ENV).
  - Crear `src/lib/config/env.ts` con Zod schema que valida `process.env` al importarse.
  - Crear `src/lib/config/feature-flags.ts` con flags toggleables.
  - Actualizar `.gitignore` para incluir `.env*.local`.
- **Acceptance Criteria Addressed**: FR-7, NFR-2
- **Files Modified**: [.gitignore](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/.gitignore)
- **Files Created**:
  - [.env.example](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/.env.example)
  - [src/lib/config/env.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/config/env.ts)
  - [src/lib/config/feature-flags.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/config/feature-flags.ts)
- **Test Requirements**:
  - `rule` TR-2.1: Importar `env` de `@/lib/config/env` no lanza excepción con `.env.example` completo
  - `rule` TR-2.2: Con `.env` faltante lanza error descriptivo

---

## Task 3: Definir tipos y contratos core (domain layer)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Crear carpeta `src/types/core/` con interfaces compartidas:
    - `SportId`, `SportModule<TConfig>` (registro de módulo)
    - `DataSource<TInput, TOutput>`
    - `EntityMapper<TDto, TDb>`
    - `StatCalculator<TParams, TResult>`
  - Crear `src/types/db/` con tipos de tablas genericas (Sport, League, Season, Team, Player, Match, PlayerMatchStats).
  - Crear `src/types/ai/` con interfaces LLM: `LLMProvider`, `MatchAnalysisResult`, `MatchPredictionResult`, `PlayerInsightResult`.
- **Acceptance Criteria Addressed**: FR-1, FR-2, FR-4, FR-5
- **Files Created**:
  - [src/types/core/sport.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/types/core/sport.ts)
  - [src/types/core/data-source.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/types/core/data-source.ts)
  - [src/types/db/tables.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/types/db/tables.ts)
  - [src/types/ai/index.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/types/ai/index.ts)
- **Test Requirements**:
  - `rule` TR-3.1: `tsc --noEmit` pasa sin errores
  - `rubric` TR-3.2: Diseño de interfaces; escala 1-5; 1=tipos acoplados a implementación, 3=interfaces ok pero pocas abstracciones, 5=interfaces limpias, genéricas, desacopladas; threshold >=4; evidencia=code review de tipos

---

## Fase 1 — Capa de Datos y Persistencia

---

## Task 4: Crear cliente DB y repositorios
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - Crear `src/lib/db/client.ts` — singleton de `createClient` de Supabase con service_role para server-side.
  - Crear `src/lib/db/repositories/` uno por entidad:
    - `sports-repo.ts` (getAll, getById)
    - `leagues-repo.ts`
    - `seasons-repo.ts`
    - `teams-repo.ts`
    - `players-repo.ts`
    - `matches-repo.ts` (upsert por external_id + sport_id)
    - `player-stats-repo.ts` (bulk-upsert)
  - Cada repo devuelve tipos de `src/types/db/tables.ts`.
- **Acceptance Criteria Addressed**: FR-3, AC-2 (upsert semilla)
- **Files Created**:
  - [src/lib/db/client.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/db/client.ts)
  - [src/lib/db/repositories/sports-repo.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/db/repositories/sports-repo.ts)
  - [src/lib/db/repositories/leagues-repo.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/db/repositories/leagues-repo.ts)
  - [src/lib/db/repositories/seasons-repo.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/db/repositories/seasons-repo.ts)
  - [src/lib/db/repositories/teams-repo.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/db/repositories/teams-repo.ts)
  - [src/lib/db/repositories/players-repo.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/db/repositories/players-repo.ts)
  - [src/lib/db/repositories/matches-repo.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/db/repositories/matches-repo.ts)
  - [src/lib/db/repositories/player-stats-repo.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/db/repositories/player-stats-repo.ts)
- **Test Requirements**:
  - `rule` TR-4.1: Todos los repos exportan al menos 3 métodos (getById, list, upsert)
  - `rule` TR-4.2: `matches-repo.ts` contiene `upsertByExternalId(external_id, sport_id, data)` que no duplica

---

## Task 5: Migración Supabase y datos semilla
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4
- **Description**:
  - Crear carpeta `supabase/migrations/` con SQL:
    - `001_create_core_tables.sql` — tablas genéricas sports/leagues/seasons/teams/players/matches/player_match_stats con JSONB `sport_specific`.
    - Índices + constraints.
  - Crear `supabase/seed/demo-soccer.sql` con 2 ligas demo, 10 equipos, 50 partidos, 200 jugadores con stats.
  - Script `npm run seed` que ejecuta el SQL via `supabase-js` o migration runner del IDE.
  - Si no hay Supabase configurado, proveer un "modo offline": `src/lib/db/in-memory-store.ts` que simula las tablas en memoria (para dev local sin credenciales).
- **Acceptance Criteria Addressed**: FR-3, FR-8, AC-2, AC-3
- **Files Created**:
  - [supabase/migrations/001_create_core_tables.sql](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/supabase/migrations/001_create_core_tables.sql)
  - [supabase/seed/demo-soccer.sql](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/supabase/seed/demo-soccer.sql)
  - [src/lib/db/in-memory-store.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/db/in-memory-store.ts)
- **Files Modified**:
  - [package.json](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/package.json) — agregar scripts `db:migrate`, `db:seed`, `dev:offline`
- **Test Requirements**:
  - `rule` TR-5.1: En modo offline, después de seed, `matchesRepo.count()` >= 50
  - `rule` TR-5.2: Modo offline se activa cuando faltan vars Supabase sin lanzar error

---

## Fase 2 — Servicios de Negocio

---

## Task 6: Sports Registry (Auto-descubrimiento) + Módulo Soccer (Fútbol) piloto
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3, Task 4 (Task 5 en paralelo)
- **Description**:
  - Crear `src/lib/config/sports-registry.ts` que usa `import.meta.glob('../sports/*/index.ts', { eager: true })` para descubrir automáticamente módulos. Exporta `getActiveSports()`, `getSport(id)` **sin necesidad de editar este archivo por cada deporte nuevo** (agregar carpeta alcanza).
  - Crear estructura `src/sports/soccer/` con:
    - `index.ts` — exporta `default soccerModule: SportModule` (el glob lo detecta automáticamente)
    - `config.ts` — constantes del deporte (posiciones, puntos por victoria, etc.)
    - `types.ts` — SoccerMatch (JSONB content), SoccerPlayerStats
    - `mappers.ts` — convierte payload de ingesta → filas de tablas core + JSONB soccer
    - `data-sources/mock-source.ts` — DataSource que devuelve fixtures demo (sin DB)
    - `statistics/calculators.ts` — calculadora de tabla posiciones, promedios por jugador
  - **Ninguna línea de registro manual**. Con crear la carpeta y exportar default alcanza (validación AC-6).
- **Acceptance Criteria Addressed**: FR-1, AC-1, AC-6 (auto-descubrimiento sin tocar core)
- **Files Modified**: Ninguno
- **Files Created**:
  - [src/lib/config/sports-registry.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/config/sports-registry.ts)
  - [src/sports/soccer/index.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/sports/soccer/index.ts)
  - [src/sports/soccer/config.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/sports/soccer/config.ts)
  - [src/sports/soccer/types.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/sports/soccer/types.ts)
  - [src/sports/soccer/mappers.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/sports/soccer/mappers.ts)
  - [src/sports/soccer/data-sources/mock-source.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/sports/soccer/data-sources/mock-source.ts)
  - [src/sports/soccer/statistics/calculators.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/sports/soccer/statistics/calculators.ts)
- **Test Requirements**:
  - `rule` TR-6.1: `getActiveSports().find(s => s.id==='soccer')` no es null (sin edición manual del registry)
  - `rule` TR-6.2: Mock source devuelve al menos 3 partidos al llamar `.fetchMatches()`
  - `rule` TR-6.3: `SoccerStandingsCalculator.compute([...])` retorna 9 pts para equipo con 3 victorias (AC-3 base)
  - `rule` TR-6.4: Prueba de extensibilidad — copiar `src/sports/soccer` a `src/sports/tennis` (mock) y `getActiveSports()` pasa a retornar 2, **sin editar `sports-registry.ts`** (evidencia AC-6 rubrica ≥ 4)

---

## Task 7: Ingestion Service + Statistics Service
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 6
- **Description**:
  - Crear `src/lib/services/ingestion-service.ts` — orquesta `source.fetch() → mapper.toDb() → repo.upsert()`. Método `runIngestionJob(sportId, sourceId)`.
  - Crear `src/lib/services/statistics-service.ts` — despacha al `StatCalculator` del sport: `getTeamStandings(sportId, leagueId, seasonId)`, `getPlayerRanking(sportId, metric)`, `getMatchStats(sportId, matchId)`.
- **Acceptance Criteria Addressed**: FR-2, FR-4, AC-2, AC-3
- **Files Created**:
  - [src/lib/services/ingestion-service.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/services/ingestion-service.ts)
  - [src/lib/services/statistics-service.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/services/statistics-service.ts)
- **Test Requirements**:
  - `rule` TR-7.1: `runIngestionJob('soccer', 'mock')` inserta partidos sin errores (comprueba count aumenta o se mantiene en modo idempotente)
  - `rule` TR-7.2: `getTeamStandings('soccer', 'demo-liga-1', '2026')` retorna standings con puntaje calculado correctamente (AC-3)

---

## Fase 3 — Capa IA

---

## Task 8: LLM Provider abstraction + OpenAI impl
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2, Task 3
- **Description**:
  - Crear `src/lib/ai/llm-provider.ts` — interface `LLMProvider` con `chat({ messages, stream? })`.
  - Crear `src/lib/ai/providers/openai-provider.ts` que implementa la interface con SDK OpenAI (streaming).
  - Crear `src/lib/ai/providers/mock-provider.ts` — responde con texto fijo para dev sin API keys.
  - Factory en `src/lib/ai/index.ts` — según env vars elige provider real o mock.
- **Acceptance Criteria Addressed**: FR-5
- **Files Created**:
  - [src/lib/ai/llm-provider.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/ai/llm-provider.ts)
  - [src/lib/ai/providers/openai-provider.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/ai/providers/openai-provider.ts)
  - [src/lib/ai/providers/mock-provider.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/ai/providers/mock-provider.ts)
  - [src/lib/ai/index.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/ai/index.ts)
- **Test Requirements**:
  - `rule` TR-8.1: `createLLMProvider()` sin OpenAI key retorna MockProvider
  - `rule` TR-8.2: MockProvider.chat devuelve texto >= 50 tokens

---

## Task 9: AI Services (RAG + Prompts por deporte)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7, Task 8
- **Description**:
  - Crear `src/lib/ai/prompts/soccer-prompts.ts` — system prompts y builders para:
    - buildMatchAnalysisContext(match, teamStats, playerStats)
    - buildPredictionContext(teamA, teamB, recentFormA, recentFormB)
    - buildPlayerInsightContext(player, seasonStats)
  - Crear `src/lib/ai/services/match-analysis-service.ts` — generate(matchId)
  - Crear `src/lib/ai/services/match-prediction-service.ts` — predict(matchId)
  - Crear `src/lib/ai/services/player-insight-service.ts` — generate(playerId)
  - Caché simple en memoria por input hash para no re-consultar.
- **Acceptance Criteria Addressed**: FR-5, AC-4
- **Files Created**:
  - [src/sports/soccer/ai/prompts.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/sports/soccer/ai/prompts.ts)
  - [src/lib/ai/services/match-analysis-service.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/ai/services/match-analysis-service.ts)
  - [src/lib/ai/services/match-prediction-service.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/ai/services/match-prediction-service.ts)
  - [src/lib/ai/services/player-insight-service.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/ai/services/player-insight-service.ts)
  - [src/lib/ai/cache/simple-cache.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/lib/ai/cache/simple-cache.ts)
- **Test Requirements**:
  - `rule` TR-9.1: `matchAnalysisService.generate(validMatchId)` devuelve longitud >= 100 tokens con al menos 2 menciones a stats reales del contexto (AC-4)
  - `rule` TR-9.2: Segunda llamada al mismo matchId responde desde caché (se prueba mockeando provider y comprobando 1 invocación en 2 calls)

---

## Fase 4 — UI y Rutas Web

---

## Task 10: Componentes UI compartidos (Design System ligero)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None (independiente; en paralelo con Fases 1-3)
- **Description**:
  - Reutilizar Tailwind existente; crear componentes reutilizables:
    - `src/components/ui/card.tsx`
    - `src/components/ui/button.tsx`
    - `src/components/ui/badge.tsx`
    - `src/components/ui/table.tsx`
    - `src/components/ui/spinner.tsx`
    - `src/components/ui/skeleton.tsx`
  - Actualizar `src/components/layout/site-shell.tsx` para incluir: header con selector de deporte, navegación principal, footer.
- **Acceptance Criteria Addressed**: FR-6 (base UI)
- **Files Modified**:
  - [src/components/layout/site-shell.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/layout/site-shell.tsx)
- **Files Created**:
  - [src/components/ui/card.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/ui/card.tsx)
  - [src/components/ui/button.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/ui/button.tsx)
  - [src/components/ui/badge.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/ui/badge.tsx)
  - [src/components/ui/table.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/ui/table.tsx)
  - [src/components/ui/spinner.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/ui/spinner.tsx)
  - [src/components/ui/skeleton.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/ui/skeleton.tsx)
  - [src/components/layout/header.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/layout/header.tsx)
  - [src/components/layout/footer.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/layout/footer.tsx)
- **Test Requirements**:
  - `rule` TR-10.1: SiteShell renderiza header con selector de deporte visible
  - `rule` TR-10.2: Todos los componentes UI exportan type-safe props

---

## Task 11: Visualizaciones SVG Nativas (Charts sin librerías)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 10 (componentes UI; paralelo con Fases 1-3)
- **Description**:
  - Implementar visualizaciones en SVG puro (sin dependencias, confirmado por usuario) bajo `src/components/charts/`:
    - `bar-chart.tsx` — barras comparativas horizontales/verticales (ej: goles a favor vs contra, tiros).
    - `sparkline.tsx` — línea pequeña de tendencia (últimos N partidos, forma reciente).
    - `donut-chart.tsx` / `gauge.tsx` — porcentajes (posesión, efectividad de tiro).
  - Props totalmente tipadas, responsive (width 100%, viewBox escalable), accesibles (aria labels).
  - Un archivo demo `charts-demo.tsx` para visualizar todos los tipos en `/ui-playground` temporal si hace falta (opcional, no es ruta final).
- **Acceptance Criteria Addressed**: FR-6 (visualizaciones SVG)
- **Files Created**:
  - [src/components/charts/bar-chart.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/charts/bar-chart.tsx)
  - [src/components/charts/sparkline.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/charts/sparkline.tsx)
  - [src/components/charts/donut-chart.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/charts/donut-chart.tsx)
- **Test Requirements**:
  - `rule` TR-11.1: Cada componente renderiza SVG válido con `viewBox` adecuado y sin errores JSX
  - `rule` TR-11.2: Bar chart con 3 series data renderiza exactamente 3 `<rect>` o `<path>`
  - `rule` TR-11.3: Donut chart con 65% → stroke-dasharray calculado correctamente (proporcional a circunferencia)
  - `rubric` TR-11.4: Legibilidad visual; escala 1-5; 1=ilegible, 3=aceptable, 5=claro colores-contrastados-ejes; threshold >=4

---

## Task 12: Rutas app (Next 16 App Router)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7 (data services), Task 10 (UI base), Task 11 (SVG charts)
- **Description**:
  - `src/app/page.tsx` — Home con overview y acceso a deportes.
  - `src/app/[sport]/page.tsx` — landing del deporte (liga destacada, próximos partidos).
  - `src/app/[sport]/leagues/page.tsx` — lista ligas y temporadas.
  - `src/app/[sport]/matches/page.tsx` — lista partidos con filtros (liga, fecha).
  - `src/app/[sport]/matches/[matchId]/page.tsx` — detalle + Server Actions para análisis IA.
  - `src/app/[sport]/players/page.tsx` — ranking jugadores.
  - `src/app/[sport]/players/[playerId]/page.tsx` — perfil jugador + insight IA.
  - `src/app/[sport]/predictions/page.tsx` — panel predicciones.
  - Composición de cada página delega en componentes bajo `src/components/[sport]/...`; usar SVG charts en detalle partido y perfil jugador.
- **Acceptance Criteria Addressed**: FR-6, AC-5
- **Files Modified**:
  - [src/app/page.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/page.tsx) (reemplaza placeholder)
- **Files Created**:
  - [src/app/[sport]/page.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/[sport]/page.tsx)
  - [src/app/[sport]/leagues/page.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/[sport]/leagues/page.tsx)
  - [src/app/[sport]/matches/page.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/[sport]/matches/page.tsx)
  - [src/app/[sport]/matches/[matchId]/page.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/[sport]/matches/[matchId]/page.tsx)
  - [src/app/[sport]/players/page.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/[sport]/players/page.tsx)
  - [src/app/[sport]/players/[playerId]/page.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/[sport]/players/[playerId]/page.tsx)
  - [src/app/[sport]/predictions/page.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/[sport]/predictions/page.tsx)
  - [src/components/soccer/standings-table.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/soccer/standings-table.tsx)
  - [src/components/soccer/match-card.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/soccer/match-card.tsx)
  - [src/components/soccer/match-detail.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/soccer/match-detail.tsx)
  - [src/components/soccer/player-card.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/soccer/player-card.tsx)
  - [src/components/soccer/player-detail.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/soccer/player-detail.tsx)
  - [src/components/soccer/prediction-panel.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/soccer/prediction-panel.tsx)
  - [src/components/soccer/leagues-list.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/soccer/leagues-list.tsx)
  - [src/components/home/landing-page.tsx](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/components/home/landing-page.tsx)
- **Test Requirements**:
  - `rule` TR-12.1: GET `/soccer/matches/<valid-id>` retorna 200 y contiene nombres de equipos, marcador, fecha, botón "Analizar con IA" (AC-5)
  - `rule` TR-12.2: Todas las nuevas rutas retornan 200 (no 404) en dev mode
  - `rubric` TR-12.3: UI responsive; escala 1-5; 1=roto en mobile, 3=usable pero no optimizado, 5=limpio en mobile/tablet/desktop; threshold >=4

---

## Task 13: Server Actions (solo server) para features IA interactivas
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 12
- **Description**:
  - Server Actions en `src/app/[sport]/matches/[matchId]/actions.ts`:
    - `generateMatchAnalysis(formData)`
    - `generateMatchPrediction(formData)`
  - Server Action en `src/app/[sport]/players/[playerId]/actions.ts`:
    - `generatePlayerInsight(formData)`
  - **Nota**: No hay Route Handlers públicos en v1 (confirmado por usuario Q2). Toda interacción es via Server Actions sobre páginas (Next 16 pattern).
- **Acceptance Criteria Addressed**: FR-5 (ejecución desde UI), NFR-2 (solo server)
- **Files Created**:
  - [src/app/[sport]/matches/[matchId]/actions.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/[sport]/matches/[matchId]/actions.ts)
  - [src/app/[sport]/players/[playerId]/actions.ts](file:///c:/Users/Dark/Desktop/sports-ai-platform-transfer/src/app/[sport]/players/[playerId]/actions.ts)
- **Test Requirements**:
  - `rule` TR-13.1: `generateMatchAnalysis` devuelve `{ ok: true, text: string }` con longitud >= 100 caracteres
  - `rule` TR-13.2: Las actions declaran `"use server"` y no se pueden invocar sin él (compile-time)

---

## Fase 5 — Verificación Final y Quality Gate

---

## Task 14: Smoke test end-to-end en modo offline
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5, Task 7, Task 12, Task 13
- **Description**:
  - Levantar `next dev` en modo offline (sin Supabase).
  - Ejecutar seed en memoria.
  - Probar navegación: `/` → `/soccer` → `/soccer/matches` → detalle → "Analizar con IA" → `/soccer/players` → perfil → "Generar insight".
  - Capturar screenshots como evidencia.
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-4, AC-5
- **Test Requirements**:
  - `rule` TR-14.1: Dev server arranca exit code 0, todas las rutas clave responden 200
  - `rule` TR-14.2: Botón "Analizar con IA" produce un texto visible en la UI dentro de 10 segundos

---

## Task 15: Quality Gate (lint + tsc + build)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Todas las anteriores
- **Description**:
  - Correr `npm run lint` → 0 errores.
  - Correr `tsc --noEmit` → 0 errores (strict).
  - Correr `npm run build` → build exitoso.
  - Si algo falla, crear issues y volver a implementación.
- **Acceptance Criteria Addressed**: AC-7, NFR-4, NFR-5
- **Files Modified**: Ninguno si todo pasa; si fallan, los archivos necesarios.
- **Test Requirements**:
  - `rule` TR-15.1: `npm run lint` exit 0
  - `rule` TR-15.2: `tsc --noEmit` exit 0
  - `rule` TR-15.3: `npm run build` exit 0
