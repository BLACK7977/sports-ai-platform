# Sports AI Platform v1 - Product Requirements Document

## Overview
- **Summary**: Plataforma de IA para análisis estadístico deportivo con arquitectura extensible que soporte múltiples deportes, obtenga datos de partidos y jugadores, los almacene, analice con IA y presente predicciones e insights en una interfaz web.
- **Purpose**: Construir una base arquitectónica sólida y extensible para agregar deportes, análisis estadísticos y modelos predictivos en el futuro sin refactorizaciones mayores.
- **Target Users**: Analistas deportivos, entrenadores, aficionados y equipos que buscan insights estadísticos y predictivos basados en datos.

---

## Goals
1. **Captura de Datos**: Pipeline modular para obtener estadísticas de partidos y jugadores de distintas fuentes (APIs externas, ingesta manual, archivos).
2. **Almacenamiento Persistente**: Base de datos relacional con modelos de datos genéricos (extensibles por deporte).
3. **Análisis Estadístico**: Capa de agregación, cálculo de métricas y ranking configurable por deporte.
4. **IA Predictiva**: Integración con LLM para generar análisis narrativos, predicciones de partidos y métricas avanzadas.
5. **Interfaz de Usuario**: Vistas web para explorar partidos, jugadores, estadísticas y predicciones.
6. **Extensibilidad**: Diseño por "módulos de deporte" (Fútbol, Básquet, Tenis, etc.) que se registran y aportan su propio schema, lógica y UI.

## Non-Goals
- Autenticación/autorización de usuarios (pospuesto a v1.1).
- Pago/subscripciones (pospuesto).
- Sistema de permisos por rol (pospuesto).
- Ingestión en tiempo real con WebSockets (v1 comenzará con bajo demanda / cron).
- Modelos de ML custom entrenados; la IA predictiva de v1 usará LLMs con RAG sobre los datos estadísticos.
- Soporte para apps móviles (solo web responsive).

---

## Background & Context
- El repositorio parte de un scaffold Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4.
- Estructura actual: `src/app`, `src/components`, `src/lib` — ruta `/` con placeholder.
- No hay base de datos ni integraciones configuradas todavía.
- Convención del repo: mantener rutas en `src/app` delgadas; componentes en `src/components` por dominio/deporte; lógica no visual en `src/lib`.
- Advertencia en `AGENTS.md`: Next.js 16 contiene breaking changes; hay que consultar `node_modules/next/dist/docs/` para APIs no estándar.

---

## Functional Requirements

### FR-1 — Módulo de Deporte (Sports Plugin) con auto-descubrimiento
- Debe existir una interface/protocolo `SportModule` que cada deporte implemente con:
  - Definición de entidades propias (ej: `SoccerMatch`, `BasketballPlayerStats`).
  - Mapeadores de ingesta (Data Sources → DB).
  - Calculadoras de estadísticas.
  - Prompts de IA específicos.
  - Rutas UI y componentes propios.
- **Mecanismo de descubrimiento dinámico**: el core escanea automáticamente la carpeta `src/sports/*/index.ts` usando `import.meta.glob` (nativo de Next 16 / Turbopack). Agregar un deporte **solo** requiere crear la carpeta `src/sports/<id>/` y exportar un default `SportModule`. No hay que editar ningún archivo del core.
- Un "deporte registro" (`getActiveSports()`) devuelve los módulos descubiertos. Fútbol (`soccer`) viene incluido como piloto.

### FR-2 — Obtención de Datos (Ingesta)
- `DataIngestionService` con `DataSource` plugables:
  - API externa REST genérica (configurable por URL, headers, rate-limit).
  - Ingesta manual por formulario.
  - Importación por CSV/JSON.
- Cada `SportModule` define sus propios `DataSourceAdapter`s.
- La ingesta valida esquema y des-duplica registros antes de persistir.

### FR-3 — Almacenamiento de Datos
- Base de datos Postgres a través de Supabase (integración disponible en el IDE).
- Tablas genéricas: `sports`, `leagues`, `seasons`, `teams`, `players`, `matches`, `player_match_stats`.
- Columnas JSONB `sport_specific` para extender esquemas por deporte sin migraciones de columnas nuevas.
- Índices por `sport_id`, `league_id`, `season_id`, `match_date`.
- Prisma-like ORM layer simple a través de `src/lib/db/` que centraliza consultas.

### FR-4 — Análisis Estadístico
- `StatisticsService` que calcula métricas agregadas:
  - Por equipo (ganados, perdidos, empatados, goles a favor/contra, etc. — según deporte).
  - Por jugador (promedio por partido, ranking, máximos, streaks).
  - Por temporada / liga.
- Cada `SportModule` puede extender el servicio con métricas propias.
- Los resultados se pueden cachear en memoria para queries repetidas.

### FR-5 — IA: Análisis y Predicciones
- Integración con LLM (OpenAI GPT-4 / Claude configurable) a través de `src/lib/ai/`.
- Flujos IA:
  1. **MatchAnalysis**: dado un `match_id`, genera resumen narrativo + insights clave.
  2. **MatchPrediction**: dados dos equipos y contexto reciente, devuelve predicción (resultado, probabilidades, explicación).
  3. **PlayerInsight**: dado un `player_id`, genera scouting narrativo y expectativas.
- Uso de RAG: construir contexto a partir de `StatisticsService` antes de llamar al LLM.
- Costo: caché de respuestas IA por combinación de inputs para no re-gastar tokens en consultas idénticas.

### FR-6 — Interfaz de Usuario (Web UI) con Visualizaciones SVG Nativas
- Rutas:
  - `/` — Home con selector de deporte y overview.
  - `/[sport]/leagues` — Ligas y temporadas del deporte.
  - `/[sport]/matches` — Lista de partidos con filtros.
  - `/[sport]/matches/[id]` — Detalle de partido + stats + análisis IA.
  - `/[sport]/players` — Lista de jugadores + ranking.
  - `/[sport]/players/[id]` — Perfil del jugador + stats + insight IA.
  - `/[sport]/predictions` — Panel de predicciones.
- UI responsive con Tailwind, tema claro/oscuro existente.
- Cargado progresivo: skeleton + streaming de respuestas IA.
- **Visualizaciones SVG nativas** (sin librerías de charts):
  - Barras comparativas (goles/partido, puntos/partido).
  - Sparklines de forma reciente (últimos 5/10 partidos).
  - Mini gauge / donut para porcentajes (posesión, tiros al arco).
  - Componentes reutilizables en `src/components/charts/` (SVG puro).

### FR-7 — Configuración Centralizada
- `src/lib/config/sports-registry.ts` — **auto-descubrimiento dinámico** de módulos de deporte via `import.meta.glob('../sports/*/index.ts', { eager: true })` (no hace falta editarlo para agregar un deporte).
- `src/lib/config/env.ts` — validación de variables de entorno (DB, LLM API keys, etc.).
- `src/lib/config/feature-flags.ts` — toggles para features experimentales.

### FR-8 — Migraciones y Semilla
- Script de setup que crea tablas, inserta catálogos iniciales (deportes, ligas ejemplo).
- Datos semilla de demo para Fútbol (ej: 2 ligas, 10 equipos, 50 partidos, 200 jugadores) para poder probar la UI sin ingesta externa.

---

## Non-Functional Requirements

### NFR-1 — Escalabilidad por Deporte
- Agregar un nuevo deporte no debe requerir tocar módulos del core — solo crear carpeta en `src/sports/[deporte]/` y registrarla en el sports-registry.

### NFR-2 — Seguridad
- Nunca exponer API keys al cliente; todas las llamadas a DB y LLM pasan por Server Actions / Route Handlers de Next.
- Validación de inputs con Zod en todas las capas.

### NFR-3 — Performance
- Páginas críticas (partido, jugador) con carga inicial < 1.5s en conexión 4G.
- Respuestas IA con streaming (< 2s hasta primer token).
- Queries DB con índices; caché en memoria de resultados frecuentes.

### NFR-4 — Mantenibilidad
- Todos los módulos con TypeScript strict.
- Layers bien definidos (domain → services → UI), sin acoplamiento cruzado (solo vía interfaces).

### NFR-5 — Compatibilidad con Next.js 16
- Cumplir con las APIs documentadas de Next 16, evitando patrones deprecados según `node_modules/next/dist/docs/`.

---

## Constraints

### Técnicas
- **Framework frontend**: Next.js 16 App Router + React 19 Server Components por defecto; Client Components solo cuando haya interacción.
- **Base de datos**: Postgres vía Supabase (integración ya disponible en el IDE; no se agrega Prisma).
- **ORM/Query layer**: helper propio en `src/lib/db` usando el cliente de Supabase JS (más ligero y alineado con la integración).
- **Validación**: Zod.
- **IA**: LLM via proveedor configurable. **Proveedor default de v1: OpenAI GPT-4o-mini** (confirmado por el usuario). La capa `src/lib/ai/` abstrae el proveedor para intercambiarlo luego. Incluye `MockProvider` obligatorio para dev offline.
- **Estilos**: Tailwind CSS v4 (ya instalado).
- **Charts / Visualizaciones**: Ninguna librería de charts. **Visualizaciones SVG nativas** (`src/components/charts/`) — barras, sparklines, gauges/donuts (confirmado por el usuario).
- **Auto-descubrimiento de deportes**: Usar `import.meta.glob` soportado nativamente por Next 16 / Turbopack (confirmado por el usuario).
- **No se agregarán dependencias nuevas sin justificación y aprobación**.

### Business
- Fútbol es el deporte piloto — solo se implementa de manera concreta en v1; el resto queda habilitado por la arquitectura de módulos.
- La ingesta externa real requiere API keys del usuario; v1 provee un mock-data-source para demo.

### Dependencias
- Variables de entorno para Supabase URL + anon/service_role keys (configurables via integración IDE).
- API key de LLM (OpenAI / Anthropic) para features de IA.

---

## Assumptions
- El usuario contará con acceso a Supabase y LLM API keys para el entorno final. Mientras tanto, el modo demo con datos semilla + respuestas IA mockeadas funcionará sin credenciales.
- El usuario puede agregar deportes adicionales en versiones posteriores siguiendo la guía del módulo.
- Para v1, las predicciones son "narrativas" basadas en LLM, no en modelos estadísticos entrenados.

---

## Acceptance Criteria

### AC-1: El Sports Registry registra y expone el módulo Fútbol
- **Type**: `rule`
- **Given**: El sports-registry incluye `soccer`
- **When**: La aplicación arranca y se lee `getActiveSports()`
- **Then**: Devuelve un arreglo con al menos el módulo `soccer` con id, name, routesPath y module ref
- **Pass Condition**: `getActiveSports().length >= 1` y `getSport('soccer')` retorna objeto con interfaz `SportModule`
- **Evidence**: Invocación de la función en runtime + snapshot

### AC-2: Ingesta y almacenamiento de datos de partido de Fútbol
- **Type**: `rule`
- **Given**: Hay un DataSourceAdapter de Soccer con datos mock
- **When**: Se ejecuta `ingestMatchData(sport='soccer', payload)` con payload válido
- **Then**: Se inserta 1 registro en `matches`, N en `player_match_stats`, sin duplicados si se ejecuta dos veces
- **Pass Condition**: Query `SELECT count(*) FROM matches WHERE external_id = $1` retorna 1 después de 2 ingestas
- **Evidence**: Salida de DB después de ingesta + logs

### AC-3: Estadísticas agregadas por equipo calculadas correctamente
- **Type**: `rule`
- **Given**: 5 partidos semilla de la Liga Demo con resultados definidos
- **When**: `getTeamStandings(sport='soccer', leagueId, seasonId)` calcula tabla de posiciones
- **Then**: El equipo con 3 victorias aparece primero con 9 puntos
- **Pass Condition**: Valores coinciden con fixtures esperados
- **Evidence**: Output del service comparado con expected.json

### AC-4: Análisis de partido devuelve texto generado por IA
- **Type**: `rule`
- **Given**: Un partido existente y stats cargadas
- **When**: `matchAnalysisService.generate(matchId)` se llama con LLM mock u oficial
- **Then**: Devuelve texto coherente de >= 100 tokens citando al menos 2 datos estadísticos reales
- **Pass Condition**: Longitud + match de keywords contra el contexto inyectado
- **Evidence**: Texto generado + evidencia de RAG (contexto enviado)

### AC-5: Ruta /[sport]/matches/[id] renderiza detalle
- **Type**: `rule`
- **Given**: Partido semilla con id conocido
- **When**: Navegación a `/soccer/matches/<id>`
- **Then**: Se renderizan: nombres de equipos, marcador, fecha, lista de stats y botón "Analizar con IA"
- **Pass Condition**: SSR response 200 y presencia de selectores de UI
- **Evidence**: HTML snap + test de integración (playwright-like manual con browser tools)

### AC-6: Extensibilidad — nuevo deporte de prueba se registra sin tocar core
- **Type**: `rubric`
- **Dimension**: Facilidad de agregar un nuevo deporte (ej: `tennis` simulado)
- **Scale**: 1-5
- **Anchors**: 1 = requiere modificar 5+ archivos del core; 3 = modificar 2-3 archivos del core; 5 = solo agregar carpeta y agregar una línea en el registry
- **Pass Threshold**: >= 4
- **Evidence**: PR simulado: archivos tocados + diff

### AC-7: Quality Gate — TypeScript strict + ESLint pasan
- **Type**: `rule`
- **Given**: Todo el código de la v1 commiteado
- **When**: `npm run lint` + `tsc --noEmit`
- **Then**: 0 errores
- **Pass Condition**: Exit code 0 en ambos comandos
- **Evidence**: Salida de terminal

---

## Open Questions (Resueltas)
- [x] **Q1 LLM Default**: **OpenAI GPT-4o-mini** (confirmado por el usuario). Layer `LLMProvider` abstrae el proveedor para cambiar sin tocar servicios.
- [x] **Q2 Endpoint público API**: Postpuesto a v1.1. v1 solo UI via Server Components + Server Actions.
- [x] **Q3 Autenticación v1**: **Sin autenticación** (confirmado). Todo público. Autenticación se planifica para v1.1.
- [x] **Q4 Descubrimiento de módulos**: **Auto-descubrimiento dinámico** via `import.meta.glob('../sports/*/index.ts')`. Crear carpeta basta, no hay que editar registry.
- [x] **Q5 Nivel UI**: **MVP + visualizaciones SVG nativas** (sin librerías charts). Barras, sparklines, gauges/donuts en SVG puro.
