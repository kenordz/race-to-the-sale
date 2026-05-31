-- Race to the Sale — Session 5 Phase 1
-- Leads pipeline + immutable XP event log.
-- Multi-tenant from day 1: leads scoped by dealership_id, xp_events scoped by profile_id.

-- =============================================================================
-- 1. TABLAS
-- =============================================================================

-- leads: cada registro es un lead que entró al pipeline del dealership.
-- source = de dónde vino (website, phone up, walk in, etc.)
-- status = estado en el funnel.
-- age_bucket = qué tan rancio está el lead (re-evaluado por job periódico futuro).
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  dealership_id     uuid not null references public.dealerships(id) on delete cascade,
  source            text not null
                      check (source in (
                        'website','phone_up','walk_in','text','chat','social',
                        'referral','third_party','service','previous_buyer'
                      )),
  status            text not null default 'new'
                      check (status in (
                        'new','claimed','contacted','appointment_set','sold','dead','orphan'
                      )),
  age_bucket        text not null default 'new'
                      check (age_bucket in (
                        'new','hot','aging_7_14','aging_15_30','aging_31_60','aging_61_90','dead_90_plus'
                      )),
  customer_name     text,
  vehicle_interest  text,
  created_at        timestamptz not null default now(),
  claimed_at        timestamptz,
  claimed_by        uuid references public.profiles(id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb
);

-- xp_events: append-only event log. Total XP = sum(xp_amount) por profile.
-- Inmutable: solo INSERT y SELECT. UPDATE/DELETE bloqueados por RLS.
create table if not exists public.xp_events (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  event_type  text not null
                check (event_type in (
                  'lead_claimed_lightning',
                  'lead_claimed_fast',
                  'lead_claimed_ontime',
                  'lead_claimed_late',
                  'lead_claimed_stale',
                  'station_phone',
                  'station_computer',
                  'station_photo',
                  'station_leads'
                )),
  xp_amount   integer not null check (xp_amount >= 0),
  lead_id     uuid references public.leads(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- 2. ÍNDICES
-- =============================================================================

-- "Mi XP del día / mi historial reciente": query por profile + orden por tiempo.
create index if not exists xp_events_profile_id_created_at_idx
  on public.xp_events (profile_id, created_at desc);

-- Lead Board futuro: filtrar leads por dealership + status + age_bucket.
create index if not exists leads_dealership_status_age_idx
  on public.leads (dealership_id, status, age_bucket);

-- "Mis leads" (los que ya tomé): partial index, solo cuando claimed_by no es null.
create index if not exists leads_claimed_by_idx
  on public.leads (claimed_by)
  where claimed_by is not null;

-- =============================================================================
-- 3. RLS — habilitar antes de las policies
-- =============================================================================

alter table public.leads      enable row level security;
alter table public.xp_events  enable row level security;

-- =============================================================================
-- 4. POLICIES — leads
-- =============================================================================

-- Ver: todos los leads del mismo dealership que el user.
create policy "users can view leads in same dealership"
  on public.leads
  for select
  to authenticated
  using (dealership_id = public.current_user_dealership_id());

-- Insertar: cualquier authenticated user puede insertar un lead a SU dealership.
-- (Por ahora abierto para el mock generator. En el futuro lo restringimos a un service_role
-- o a un edge function que valide el origen.)
create policy "users can insert leads into their dealership"
  on public.leads
  for insert
  to authenticated
  with check (dealership_id = public.current_user_dealership_id());

-- Actualizar:
--  - USING: solo veo para update leads de mi dealership que sean MI lead O estén libres ('new').
--  - WITH CHECK: después del update, el lead debe quedar asignado a MÍ (no le puedo pasar el
--    lead a otro user). Esto cubre ambos casos: claimar uno libre, o actualizar uno mío.
create policy "users can claim or update their own leads"
  on public.leads
  for update
  to authenticated
  using (
    dealership_id = public.current_user_dealership_id()
    and (claimed_by = auth.uid() or status = 'new')
  )
  with check (
    dealership_id = public.current_user_dealership_id()
    and claimed_by = auth.uid()
  );

-- Delete: sin policy = bloqueado. Solo service_role puede borrar (limpieza administrativa).

-- =============================================================================
-- 5. POLICIES — xp_events (inmutable: solo SELECT propio + INSERT propio)
-- =============================================================================

-- Ver: solo mis propios eventos.
create policy "users can view their own xp events"
  on public.xp_events
  for select
  to authenticated
  using (profile_id = auth.uid());

-- Insertar: solo eventos donde yo soy el profile_id.
create policy "users can insert their own xp events"
  on public.xp_events
  for insert
  to authenticated
  with check (profile_id = auth.uid());

-- Update/Delete: sin policy = bloqueado. Event log es append-only.
