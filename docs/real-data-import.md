# Importación de datos reales

## Estado preparado

La aplicación ya tiene el flujo `proveedor → payload normalizado → mapper → upsert → frontend`.
Cada payload de partido debe traer un `external_id` estable; equipos y jugadores también. El servicio rechaza una importación sin esas identidades, para evitar duplicados accidentales.

La primera competencia objetivo está definida, sin datos ni llamadas externas: Liga Profesional Argentina, con ids internos `argentina-primera-profesional` y `argentina-primera-profesional-2026`.

Al importar la temporada elegida, su `sport_specific` debe incluir `active_priority: 100`. La resolución central usa primero esa prioridad y luego la fecha de inicio entre temporadas actuales, por lo que el seed demo permanece intacto pero deja de dominar la interfaz al activar una competición real.

## Proveniencia e idempotencia

Las tablas `leagues`, `teams`, `players` y `matches` ya tienen `external_id`. `seasons` y `player_match_stats` no lo tienen. Ninguna tabla tiene columnas dedicadas `provider` o `last_synced_at`.

Por ahora, la procedencia normalizada se guarda bajo `sport_specific.source` con `provider`, `external_id` y `last_synced_at`; no requiere migración y preserva el esquema actual. Los ids externos deben estar siempre prefijados por proveedor, por ejemplo `provider:team:123`.

Antes de hacer sincronizaciones recurrentes conviene aprobar esta migración aditiva (no se ejecutó ni se incluye como cambio aplicado): columnas `provider` y `last_synced_at` para las entidades importadas, `external_id` para `seasons` y una restricción única `(match_id, player_id)` para estadísticas. No borra ni transforma datos existentes y hace que la garantía de idempotencia sea verificable directamente en PostgreSQL.

## Datos mínimos que debe entregar el proveedor

- Identificador de competición y temporada, nombre, país, fechas y marca de temporada actual.
- Equipos con identificador, nombre, abreviatura y escudo si existe.
- Planteles con identificador, posición, dorsal y nacionalidad cuando estén disponibles.
- Partidos con identificador, fecha/hora, estado, local/visitante y marcador.
- Estadísticas por jugador y partido: minutos, goles, asistencias, tarjetas, tiros y pases solo cuando el proveedor los publique.

El adaptador no debe completar campos ausentes ni estimar estadísticas.
