-- Sports AI Platform - Demo Soccer Seed
-- Mirrors fixtures from in-memory-store.ts for consistency.
-- Validates AC-3: Águilas FC ends with 3 wins = 9 points (1st place Liga Demo Apertura).

BEGIN;

-- 1 Sport ---------------------------------------------------
INSERT INTO sports (id, name, display_name, emoji, sport_specific) VALUES
  ('soccer','soccer','Fútbol','⚽', '{"ball":"round","duration_minutes":90}')
ON CONFLICT (id) DO NOTHING;

-- 2 Leagues ------------------------------------------------
INSERT INTO leagues (id, sport_id, name, country, external_id, sport_specific) VALUES
  ('demo-liga-1','soccer','Liga Demo Apertura','DemoLand','ext-liga-1','{"tier":1,"type":"round_robin"}'),
  ('demo-liga-2','soccer','Copa Demo','DemoLand',NULL,'{"tier":2,"type":"knockout"}')
ON CONFLICT (id) DO NOTHING;

-- 2 Seasons ------------------------------------------------
INSERT INTO seasons (id, league_id, name, start_date, end_date, is_current, sport_specific) VALUES
  ('season-2026-1',    'demo-liga-1','Temporada 2026',       '2026-02-01','2026-12-15',TRUE,'{}'),
  ('season-2026-copa', 'demo-liga-2','Copa 2026',            '2026-06-01','2026-09-30',TRUE,'{}')
ON CONFLICT (id) DO NOTHING;

-- 10 Teams -------------------------------------------------
INSERT INTO teams (id, sport_id, league_id, name, short_name, sport_specific) VALUES
  ('aguilas-fc',     'soccer','demo-liga-1','Águilas FC',     'AGU','{"stadium":"Estadio Águilas FC","capacity":50000}'),
  ('leones-united',  'soccer','demo-liga-1','Leones United',  'LEO','{"stadium":"Estadio Leones United","capacity":40000}'),
  ('dragones-cf',    'soccer','demo-liga-1','Dragones CF',    'DRA','{"stadium":"Estadio Dragones CF","capacity":30000}'),
  ('halcones-sc',    'soccer','demo-liga-1','Halcones SC',    'HAL','{"stadium":"Estadio Halcones SC","capacity":25000}'),
  ('tiburones-ac',   'soccer','demo-liga-1','Tiburones AC',   'TIB','{"stadium":"Estadio Tiburones AC","capacity":22000}'),
  ('toros-fc',       'soccer','demo-liga-2','Toros FC',       'TOR','{"stadium":"Estadio Toros FC","capacity":35000}'),
  ('lobos-cd',       'soccer','demo-liga-2','Lobos CD',       'LOB','{"stadium":"Estadio Lobos CD","capacity":20000}'),
  ('gavilanes-ad',   'soccer','demo-liga-2','Gavilanes AD',   'GAV','{"stadium":"Estadio Gavilanes AD","capacity":18000}'),
  ('pumas-sd',       'soccer','demo-liga-2','Pumas SD',       'PUM','{"stadium":"Estadio Pumas SD","capacity":28000}'),
  ('zorros-cf',      'soccer','demo-liga-2','Zorros CF',      'ZOR','{"stadium":"Estadio Zorros CF","capacity":21000}')
ON CONFLICT (id) DO NOTHING;

-- 20 Matches (10 Liga1 + 10 Liga2) -- fixtures exactos AC-3
INSERT INTO matches (id, sport_id, league_id, season_id, home_team_id, away_team_id, match_date, status, home_score, away_score, external_id, sport_specific) VALUES
  -- LIGA DEMO APERTURA (round-robin simple, 5 teams, 10 matches)
  ('m-l1-1',  'soccer','demo-liga-1','season-2026-1','aguilas-fc',   'tiburones-ac',   '2026-02-07 18:00:00+00','finished',2,0,'ext-m-l1-1', '{"round":1,"referee":"Ref 1","attendance":15000}'),
  ('m-l1-2',  'soccer','demo-liga-1','season-2026-1','leones-united','halcones-sc',    '2026-02-08 20:00:00+00','finished',1,1,'ext-m-l1-2', '{"round":1,"referee":"Ref 2","attendance":12000}'),
  ('m-l1-3',  'soccer','demo-liga-1','season-2026-1','dragones-cf',  'tiburones-ac',   '2026-02-14 18:00:00+00','finished',3,1,'ext-m-l1-3', '{"round":2,"referee":"Ref 3","attendance":11000}'),
  ('m-l1-4',  'soccer','demo-liga-1','season-2026-1','halcones-sc',  'aguilas-fc',     '2026-02-15 20:00:00+00','finished',0,1,'ext-m-l1-4', '{"round":2,"referee":"Ref 4","attendance":18000}'),
  ('m-l1-5',  'soccer','demo-liga-1','season-2026-1','leones-united','dragones-cf',    '2026-02-21 18:00:00+00','finished',2,0,'ext-m-l1-5', '{"round":3,"referee":"Ref 5","attendance":20000}'),
  ('m-l1-6',  'soccer','demo-liga-1','season-2026-1','tiburones-ac', 'halcones-sc',    '2026-02-22 20:00:00+00','finished',0,2,'ext-m-l1-6', '{"round":3,"referee":"Ref 6","attendance":9000}'),
  ('m-l1-7',  'soccer','demo-liga-1','season-2026-1','aguilas-fc',   'dragones-cf',    '2026-02-28 18:00:00+00','finished',3,1,'ext-m-l1-7', '{"round":4,"referee":"Ref 7","attendance":25000}'),
  ('m-l1-8',  'soccer','demo-liga-1','season-2026-1','leones-united','aguilas-fc',     '2026-03-01 20:00:00+00','finished',2,1,'ext-m-l1-8', '{"round":4,"referee":"Ref 8","attendance":30000}'),
  ('m-l1-9',  'soccer','demo-liga-1','season-2026-1','dragones-cf',  'halcones-sc',    '2026-03-07 18:00:00+00','finished',2,1,'ext-m-l1-9', '{"round":5,"referee":"Ref 9","attendance":14000}'),
  ('m-l1-10', 'soccer','demo-liga-1','season-2026-1','tiburones-ac', 'leones-united',  '2026-03-08 20:00:00+00','finished',0,1,'ext-m-l1-10','{"round":5,"referee":"Ref 10","attendance":10000}'),
  -- COPA DEMO
  ('m-l2-1',  'soccer','demo-liga-2','season-2026-copa','toros-fc',    'zorros-cf',    '2026-06-07 18:00:00+00','finished',2,1,'ext-m-l2-1', '{"round":1}'),
  ('m-l2-2',  'soccer','demo-liga-2','season-2026-copa','lobos-cd',    'pumas-sd',     '2026-06-08 20:00:00+00','finished',3,0,'ext-m-l2-2', '{"round":1}'),
  ('m-l2-3',  'soccer','demo-liga-2','season-2026-copa','gavilanes-ad','zorros-cf',    '2026-06-14 18:00:00+00','finished',1,1,'ext-m-l2-3', '{"round":2}'),
  ('m-l2-4',  'soccer','demo-liga-2','season-2026-copa','pumas-sd',    'toros-fc',     '2026-06-15 20:00:00+00','finished',0,2,'ext-m-l2-4', '{"round":2}'),
  ('m-l2-5',  'soccer','demo-liga-2','season-2026-copa','lobos-cd',    'gavilanes-ad', '2026-06-21 18:00:00+00','finished',1,2,'ext-m-l2-5', '{"round":3}'),
  ('m-l2-6',  'soccer','demo-liga-2','season-2026-copa','zorros-cf',   'pumas-sd',     '2026-06-22 20:00:00+00','finished',2,0,'ext-m-l2-6', '{"round":3}'),
  ('m-l2-7',  'soccer','demo-liga-2','season-2026-copa','toros-fc',    'gavilanes-ad', '2026-06-28 18:00:00+00','finished',3,2,'ext-m-l2-7', '{"round":4}'),
  ('m-l2-8',  'soccer','demo-liga-2','season-2026-copa','lobos-cd',    'zorros-cf',    '2026-06-29 20:00:00+00','finished',0,0,'ext-m-l2-8', '{"round":4}'),
  ('m-l2-9',  'soccer','demo-liga-2','season-2026-copa','gavilanes-ad','pumas-sd',     '2026-07-05 18:00:00+00','finished',4,1,'ext-m-l2-9', '{"round":5}'),
  ('m-l2-10', 'soccer','demo-liga-2','season-2026-copa','toros-fc',    'lobos-cd',     '2026-07-06 20:00:00+00','finished',1,1,'ext-m-l2-10','{"round":5}')
ON CONFLICT (id) DO NOTHING;

-- 30 Players (3 por equipo, demo sample)
INSERT INTO players (id, sport_id, team_id, full_name, short_name, position, jersey_number, nationality, sport_specific) VALUES
  -- Águilas FC
  ('p-aguilas-fc-1','soccer','aguilas-fc','Juan Gómez','J. Gómez','Portero',1,'ARG','{"preferred_foot":"right","height_cm":188}'),
  ('p-aguilas-fc-2','soccer','aguilas-fc','Carlos Pérez','C. Pérez','Defensa',2,'ARG','{"preferred_foot":"right","height_cm":182}'),
  ('p-aguilas-fc-3','soccer','aguilas-fc','Martín López','M. López','Delantero',10,'ARG','{"preferred_foot":"left","height_cm":178}'),
  -- Leones United
  ('p-leones-united-1','soccer','leones-united','Diego Rodríguez','D. Rodríguez','Portero',1,'BRA','{"preferred_foot":"right","height_cm":190}'),
  ('p-leones-united-2','soccer','leones-united','Pedro Martínez','P. Martínez','Defensa',4,'BRA','{"preferred_foot":"right","height_cm":185}'),
  ('p-leones-united-3','soccer','leones-united','Pablo García','P. García','Delantero',9,'BRA','{"preferred_foot":"right","height_cm":183}'),
  -- Dragones CF
  ('p-dragones-cf-1','soccer','dragones-cf','Javier Sánchez','J. Sánchez','Portero',1,'ESP','{"preferred_foot":"right","height_cm":187}'),
  ('p-dragones-cf-2','soccer','dragones-cf','Marco Torres','M. Torres','Mediocampista',8,'ESP','{"preferred_foot":"left","height_cm":176}'),
  ('p-dragones-cf-3','soccer','dragones-cf','Ale Ramírez','A. Ramírez','Delantero',11,'ESP','{"preferred_foot":"right","height_cm":180}'),
  -- Halcones SC
  ('p-halcones-sc-1','soccer','halcones-sc','Mati Álvarez','M. Álvarez','Portero',1,'ARG','{"preferred_foot":"right","height_cm":189}'),
  ('p-halcones-sc-2','soccer','halcones-sc','Nico Castro','N. Castro','Mediocampista',6,'ARG','{"preferred_foot":"right","height_cm":174}'),
  ('p-halcones-sc-3','soccer','halcones-sc','Santi Ruíz','S. Ruíz','Delantero',7,'ARG','{"preferred_foot":"left","height_cm":175}'),
  -- Tiburones AC
  ('p-tiburones-ac-1','soccer','tiburones-ac','Fran Hernández','F. Hernández','Portero',1,'BRA','{"preferred_foot":"right","height_cm":186}'),
  ('p-tiburones-ac-2','soccer','tiburones-ac','Lucas Fernández','L. Fernández','Defensa',3,'BRA','{"preferred_foot":"left","height_cm":184}'),
  ('p-tiburones-ac-3','soccer','tiburones-ac','Tomás Jiménez','T. Jiménez','Mediocampista',5,'BRA','{"preferred_foot":"right","height_cm":179}'),
  -- Toros FC
  ('p-toros-fc-1','soccer','toros-fc','Agustín Vega','A. Vega','Portero',1,'ESP','{"preferred_foot":"right","height_cm":191}'),
  ('p-toros-fc-2','soccer','toros-fc','Joaquín Romero','J. Romero','Defensa',4,'ESP','{"preferred_foot":"right","height_cm":183}'),
  ('p-toros-fc-3','soccer','toros-fc','Ezequiel Morales','E. Morales','Delantero',9,'ESP','{"preferred_foot":"right","height_cm":182}'),
  -- Resto (Liga2)
  ('p-lobos-cd-1','soccer','lobos-cd','Thiago Silva','T. Silva','Portero',1,'BRA','{"preferred_foot":"right","height_cm":188}'),
  ('p-lobos-cd-2','soccer','lobos-cd','Juan Santos','J. Santos','Defensa',4,'BRA','{"preferred_foot":"right","height_cm":183}'),
  ('p-gavilanes-ad-1','soccer','gavilanes-ad','Carlos Oliveira','C. Oliveira','Portero',1,'BRA','{"preferred_foot":"right","height_cm":186}'),
  ('p-gavilanes-ad-2','soccer','gavilanes-ad','Diego Costa','D. Costa','Mediocampista',8,'BRA','{"preferred_foot":"left","height_cm":177}'),
  ('p-pumas-sd-1','soccer','pumas-sd','Pedro López','P. López','Portero',1,'ESP','{"preferred_foot":"right","height_cm":187}'),
  ('p-pumas-sd-2','soccer','pumas-sd','Pablo Ruiz','P. Ruiz','Mediocampista',6,'ESP','{"preferred_foot":"right","height_cm":177}'),
  ('p-zorros-cf-1','soccer','zorros-cf','Javier Pérez','J. Pérez','Portero',1,'ARG','{"preferred_foot":"right","height_cm":188}'),
  ('p-zorros-cf-2','soccer','zorros-cf','Marco Gómez','M. Gómez','Delantero',9,'ARG','{"preferred_foot":"left","height_cm":179}'),
  ('p-lobos-cd-3','soccer','lobos-cd','Lucas Pereira','L. Pereira','Delantero',9,'BRA','{"preferred_foot":"right","height_cm":181}'),
  ('p-gavilanes-ad-3','soccer','gavilanes-ad','Lucas Melo','L. Melo','Delantero',10,'BRA','{"preferred_foot":"right","height_cm":180}'),
  ('p-pumas-sd-3','soccer','pumas-sd','Diego García','D. García','Delantero',10,'ESP','{"preferred_foot":"right","height_cm":178}'),
  ('p-zorros-cf-3','soccer','zorros-cf','Santi Rodríguez','S. Rodríguez','Mediocampista',8,'ARG','{"preferred_foot":"right","height_cm":176}')
ON CONFLICT (id) DO NOTHING;

-- Completa las plantillas demo a 20 jugadores por equipo (200 en total).
-- Las 30 fichas nominales anteriores se preservan; estas filas sólo agregan las faltantes.
INSERT INTO players (
  id, sport_id, team_id, full_name, short_name, position,
  jersey_number, nationality, sport_specific
)
SELECT
  format('p-%s-%s', t.id, n),
  'soccer',
  t.id,
  format('Jugador %s %s', initcap(replace(t.id, '-', ' ')), n),
  format('J. %s', n),
  CASE
    WHEN n <= 2 THEN 'Portero'
    WHEN n <= 8 THEN 'Defensa'
    WHEN n <= 14 THEN 'Mediocampista'
    ELSE 'Delantero'
  END,
  n,
  CASE n % 3 WHEN 0 THEN 'ARG' WHEN 1 THEN 'BRA' ELSE 'ESP' END,
  jsonb_build_object(
    'preferred_foot', CASE WHEN n % 2 = 0 THEN 'right' ELSE 'left' END,
    'height_cm', 170 + ((n * 7) % 30)
  )
FROM teams t
CROSS JOIN generate_series(1, 20) AS n
WHERE t.id IN (
  'aguilas-fc','leones-united','dragones-cf','halcones-sc','tiburones-ac',
  'toros-fc','lobos-cd','gavilanes-ad','pumas-sd','zorros-cf'
)
ON CONFLICT (id) DO NOTHING;

-- 30 fixtures futuros de Copa Demo: 20 existentes + 30 programados = 50 partidos.
WITH extra_fixtures (n, home_team_id, away_team_id) AS (
  VALUES
    (1,'toros-fc','lobos-cd'), (2,'toros-fc','gavilanes-ad'), (3,'toros-fc','pumas-sd'), (4,'toros-fc','zorros-cf'),
    (5,'lobos-cd','gavilanes-ad'), (6,'lobos-cd','pumas-sd'), (7,'lobos-cd','zorros-cf'),
    (8,'gavilanes-ad','pumas-sd'), (9,'gavilanes-ad','zorros-cf'), (10,'pumas-sd','zorros-cf'),
    (11,'lobos-cd','toros-fc'), (12,'gavilanes-ad','toros-fc'), (13,'pumas-sd','toros-fc'), (14,'zorros-cf','toros-fc'),
    (15,'gavilanes-ad','lobos-cd'), (16,'pumas-sd','lobos-cd'), (17,'zorros-cf','lobos-cd'),
    (18,'pumas-sd','gavilanes-ad'), (19,'zorros-cf','gavilanes-ad'), (20,'zorros-cf','pumas-sd'),
    (21,'toros-fc','lobos-cd'), (22,'toros-fc','gavilanes-ad'), (23,'toros-fc','pumas-sd'), (24,'toros-fc','zorros-cf'),
    (25,'lobos-cd','gavilanes-ad'), (26,'lobos-cd','pumas-sd'), (27,'lobos-cd','zorros-cf'),
    (28,'gavilanes-ad','pumas-sd'), (29,'gavilanes-ad','zorros-cf'), (30,'pumas-sd','zorros-cf')
)
INSERT INTO matches (
  id, sport_id, league_id, season_id, home_team_id, away_team_id,
  match_date, status, external_id, sport_specific
)
SELECT
  format('m-extra-%s', n),
  'soccer', 'demo-liga-2', 'season-2026-copa', home_team_id, away_team_id,
  ('2026-08-01 19:00:00+00'::timestamptz + ((n - 1) * interval '1 day')),
  'scheduled', format('ext-m-extra-%s', n), jsonb_build_object('round', n)
FROM extra_fixtures
ON CONFLICT (id) DO NOTHING;

-- Estadísticas de los 20 partidos finalizados: 11 jugadores por equipo = 440 filas.
INSERT INTO player_match_stats (
  id, match_id, player_id, team_id, minutes_played, sport_specific
)
SELECT
  format('s-%s-%s', m.id, p.id),
  m.id,
  p.id,
  p.team_id,
  CASE WHEN p.jersey_number = 1 THEN 90 ELSE 50 + ((p.jersey_number * 7) % 45) END,
  jsonb_build_object(
    'goals', CASE WHEN p.position = 'Delantero' AND p.jersey_number % 7 = 0 THEN 1 ELSE 0 END,
    'assists', CASE WHEN p.jersey_number % 11 = 0 THEN 1 ELSE 0 END,
    'yellow_cards', CASE WHEN p.jersey_number % 19 = 0 THEN 1 ELSE 0 END,
    'red_cards', 0,
    'shots', (p.jersey_number * 3) % 5,
    'passes', 20 + ((p.jersey_number * 5) % 60),
    'pass_accuracy_pct', 65 + ((p.jersey_number * 7) % 33),
    'side', CASE WHEN p.team_id = m.home_team_id THEN 'home' ELSE 'away' END
  )
FROM matches m
JOIN players p ON p.team_id IN (m.home_team_id, m.away_team_id)
WHERE m.status IN ('finished', 'in_progress')
  AND p.jersey_number BETWEEN 1 AND 11
ON CONFLICT (id) DO NOTHING;

COMMIT;
