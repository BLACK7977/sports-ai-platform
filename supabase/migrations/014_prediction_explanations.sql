-- ============================================================================
-- Sports AI Platform - 014: prediction_explanations (Gemini Explanations Phase 1)
-- ============================================================================
-- Phase: Gemini Explanations Phase 1 (persisted model-owned explanations).
-- Depends on: 004/005/006 (predictions is the immutable canonical source).
--
-- Additive, append-only cache of ONE reusable structured explanation per
-- canonical (prediction, prompt_schema, prompt_version, language), generated
-- by an LLM provider and validated server-side BEFORE persistence.
--
-- DESIGN CONTRACTS (do not break):
-- 1. predictions / prediction_evaluations are NOT modified (no ALTER, no UPDATE,
--    no DELETE); the only coupling is the FK usage below.
-- 2. Append-only: no UPDATE, no DELETE for anon, authenticated AND service_role.
-- 3. Idempotency: a canonical explanation is unique ONLY for status='generated'
--    via a PARTIAL UNIQUE INDEX. Failed attempts do NOT belong to that unique
--    space: they never permanently block a later controlled retry for the same
--    prediction/prompt version (multiple 'failed' rows are allowed).
-- 4. payload stores ONLY the validated structured output (summary, key_factors,
--    model_reading). NEVER store raw prompts, API keys, raw provider responses
--    or secrets.
-- 5. CHECK constraints keep generated/failed rows mutually exclusive and
--    self-consistent: generated -> payload NOT NULL + error_class NULL;
--    failed -> payload NULL (error_class optional).
--
-- Defensive/transactional style follows 005/013. Single transaction: any
-- failure rolls back everything. NO application in Cloud without human review.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Guard: FK target must exist; abort cleanly instead of failing mid-apply.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_tables
    where schemaname = 'public' and tablename = 'predictions'
  ) then
    raise exception
      'Migration 014 bloqueada: la tabla public.predictions no existe (dependencia FK de las migrations 004/005/006 ausente).';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
create table if not exists public.prediction_explanations (
  id bigserial primary key,

  -- Canonical prediction this explanation explains (immutable link).
  prediction_id bigint not null references public.predictions(id) on delete restrict,

  -- Provenance of the explanation itself (provider + model + prompt versioning).
  provider text not null check (btrim(provider) <> ''),
  model_name text not null check (btrim(model_name) <> ''),
  prompt_schema text not null check (btrim(prompt_schema) <> ''),
  prompt_version integer not null check (prompt_version >= 1),
  language text not null default 'es' check (btrim(language) <> ''),

  -- Validated structured output (summary, key_factors, model_reading).
  -- NULL only when the generation attempt failed.
  payload jsonb,

  -- 'generated' | 'failed' (see consistency CHECK below).
  status text not null check (status in ('generated', 'failed')),

  -- SHA-256 hash of the frozen canonical inputs used for this generation.
  -- Auditability / regeneration decisions. Never the prompt contents.
  input_fingerprint text,

  -- Classification of the failure (timeout, validation, provider, quota, ...).
  -- Column present for 'failed' rows; MUST be NULL on 'generated' rows.
  error_class text,

  generated_at timestamptz not null default now(),

  -- Cross-field consistency: generated rows MUST carry a payload and no error;
  -- failed rows MUST NOT carry a payload (raw text is never persisted).
  constraint prediction_explanations_payload_status_check check (
    (status = 'generated' and payload is not null and error_class is null)
    or
    (status = 'failed' and payload is null)
  )
);

comment on table public.prediction_explanations is
  'Persisted structured LLM explanations for canonical SPORTS AI predictions. Append-only. One reusable explanation per (prediction, prompt_schema, prompt_version, language) once generated; failed attempts never block controlled retries (partial unique index only on status=generated).';

comment on column public.prediction_explanations.payload is
  'Zod-validated structured output ONLY ({summary, key_factors, model_reading}). Never stores raw prompts, API keys, raw provider responses or secrets.';

-- ----------------------------------------------------------------------------
-- 2. Idempotency: one CANONICAL explanation per generated (prediction, schema,
--    version, language). FAILED rows never collide with the unique space, so a
--    later controlled retry can always insert a fresh attempt. No table-level
--    UNIQUE constraint: that would permanently block retries after any failure.
-- ----------------------------------------------------------------------------
create unique index if not exists uq_prediction_explanations_generated
  on public.prediction_explanations (prediction_id, prompt_schema, prompt_version, language)
  where status = 'generated';

-- Fast lookup by canonical prediction (single indexed SELECT for SSR).
create index if not exists idx_prediction_explanations_prediction
  on public.prediction_explanations (prediction_id);

-- ----------------------------------------------------------------------------
-- 3. RLS + grants. Append-only for every role. Public SELECT is acceptable:
--    explanations contain only public prediction-derived content.
-- ----------------------------------------------------------------------------
alter table public.prediction_explanations enable row level security;

drop policy if exists "prediction_explanations_public_read" on public.prediction_explanations;
create policy "prediction_explanations_public_read"
  on public.prediction_explanations
  for select to anon, authenticated
  using (true);

-- anon / authenticated: SELECT only (never INSERT/UPDATE/DELETE).
revoke all on public.prediction_explanations from anon, authenticated;
grant select on public.prediction_explanations to anon, authenticated;

-- service_role: SELECT + INSERT only. Explicit REVOKE UPDATE/DELETE even if a
-- future grant attempts to re-add them.
revoke all on public.prediction_explanations from service_role;
grant select, insert on public.prediction_explanations to service_role;
revoke update, delete on public.prediction_explanations from service_role;

-- Sequence: service_role needs USAGE/SELECT to drive the BIGSERIAL on INSERT
-- (mirrors 004 for predictions/prediction_evaluations).
grant usage, select on sequence public.prediction_explanations_id_seq to service_role;

commit;