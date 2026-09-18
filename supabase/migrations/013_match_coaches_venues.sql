-- Additive fixture-context cache. No existing rows are changed or backfilled.
begin;

create table if not exists public.coaches (
  id text primary key,
  provider text not null check (btrim(provider) <> ''),
  external_id text not null check (btrim(external_id) <> ''),
  full_name text not null,
  image_url text,
  image_is_placeholder boolean not null default false,
  nationality_id text,
  nationality_name text,
  date_of_birth date,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coaches_canonical_id_check check (
    btrim(id) <> '' and id = provider || ':coach:' || external_id
  ),
  unique (provider, external_id)
);

create table if not exists public.venues (
  id text primary key,
  provider text not null check (btrim(provider) <> ''),
  external_id text not null check (btrim(external_id) <> ''),
  name text not null,
  city text,
  address text,
  capacity integer check (capacity is null or capacity >= 0),
  surface text,
  image_url text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  last_synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_canonical_id_check check (
    btrim(id) <> '' and id = provider || ':venue:' || external_id
  ),
  unique (provider, external_id)
);

create table if not exists public.match_coaches (
  id text primary key,
  match_id text not null references public.matches(id) on delete cascade,
  team_id text not null references public.teams(id) on delete restrict,
  coach_id text not null references public.coaches(id) on delete restrict,
  location text not null check (location in ('home','away')),
  provider text not null,
  provider_fixture_id text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, team_id, provider),
  constraint match_coaches_location_provider_unique unique (match_id, location, provider)
);

alter table public.match_metadata add column if not exists venue_id text references public.venues(id) on delete set null;
comment on column public.match_metadata.venue_id is
  'Canonical normalized venue reference. Applications should prefer public.venues data when this reference resolves; legacy match_metadata venue_* columns remain provider snapshot compatibility fields.';
create index if not exists idx_match_coaches_match on public.match_coaches(match_id);
create index if not exists idx_match_coaches_coach on public.match_coaches(coach_id);
create index if not exists idx_match_coaches_team on public.match_coaches(team_id);
create index if not exists idx_match_coaches_provider_fixture on public.match_coaches(provider_fixture_id);
create index if not exists idx_match_metadata_venue on public.match_metadata(venue_id);

alter table public.coaches enable row level security;
alter table public.venues enable row level security;
alter table public.match_coaches enable row level security;
drop policy if exists "coaches_public_read" on public.coaches;
drop policy if exists "venues_public_read" on public.venues;
drop policy if exists "match_coaches_public_read" on public.match_coaches;
create policy "coaches_public_read" on public.coaches for select to anon, authenticated using (true);
create policy "venues_public_read" on public.venues for select to anon, authenticated using (true);
create policy "match_coaches_public_read" on public.match_coaches for select to anon, authenticated using (true);
revoke all on public.coaches, public.venues, public.match_coaches from anon, authenticated;
grant select on public.coaches, public.venues, public.match_coaches to anon, authenticated;
revoke delete on public.coaches, public.venues, public.match_coaches from service_role;
grant select, insert, update on public.coaches, public.venues, public.match_coaches to service_role;

commit;
