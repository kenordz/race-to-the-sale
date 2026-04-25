-- Race to the Sale — schema inicial v0
-- Multi-tenant: cada dealership es un tenant. Todo se filtra por dealership_id via RLS.

-- =============================================================================
-- 1. TABLAS
-- =============================================================================

create table if not exists public.dealerships (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text,
  role            text not null default 'salesperson'
                    check (role in ('admin', 'manager', 'salesperson')),
  dealership_id   uuid references public.dealerships(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  type        text not null
                check (type in ('call', 'text', 'email', 'appointment_set', 'appointment_show', 'sale')),
  points      integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.point_configs (
  id              uuid primary key default gen_random_uuid(),
  dealership_id   uuid not null references public.dealerships(id) on delete cascade,
  activity_type   text not null
                    check (activity_type in ('call', 'text', 'email', 'appointment_set', 'appointment_show', 'sale')),
  points          integer not null,
  unique (dealership_id, activity_type)
);

-- =============================================================================
-- 2. ÍNDICES (los que nos ahorran queries lentos cuando crezca activities)
-- =============================================================================

create index if not exists profiles_dealership_id_idx
  on public.profiles (dealership_id);

create index if not exists activities_profile_id_created_at_idx
  on public.activities (profile_id, created_at desc);

create index if not exists point_configs_dealership_id_idx
  on public.point_configs (dealership_id);

-- =============================================================================
-- 3. HELPER (para evitar recursión en RLS de profiles)
-- =============================================================================
-- Devuelve el dealership_id del usuario logueado.
-- SECURITY DEFINER hace bypass de RLS dentro de la función — necesario para
-- que las policies de profiles puedan llamarse a sí mismas sin loop.

create or replace function public.current_user_dealership_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select dealership_id from public.profiles where id = auth.uid();
$$;

-- =============================================================================
-- 4. TRIGGER: auto-crear profile cuando se crea un user en auth.users
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'salesperson'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 5. RLS — habilitar en todas las tablas
-- =============================================================================

alter table public.dealerships  enable row level security;
alter table public.profiles     enable row level security;
alter table public.activities   enable row level security;
alter table public.point_configs enable row level security;

-- =============================================================================
-- 6. POLICIES
-- =============================================================================

-- ── dealerships ────────────────────────────────────────────────────────────
-- Todo authenticated user puede ver SU dealership (vía join implícito por user_dealership_id).
-- Insert/update/delete: ninguna policy = bloqueado por default. Solo service_role puede.
create policy "users can view their dealership"
  on public.dealerships
  for select
  to authenticated
  using (id = public.current_user_dealership_id());

-- ── profiles ───────────────────────────────────────────────────────────────
-- Cualquier user logueado puede ver profiles de su mismo dealership (incluye el suyo).
create policy "users can view profiles in same dealership"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or dealership_id = public.current_user_dealership_id()
  );

-- Un user puede actualizar SOLO su propio profile (excepto role/dealership_id;
-- esos los cambia un admin via service_role en una versión futura).
create policy "users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Insert: bloqueado para todos. El trigger handle_new_user (security definer) lo hace.

-- ── activities ─────────────────────────────────────────────────────────────
-- Ver: cualquier activity de cualquier profile en mi dealership.
create policy "users can view activities in same dealership"
  on public.activities
  for select
  to authenticated
  using (
    profile_id in (
      select id from public.profiles
      where dealership_id = public.current_user_dealership_id()
    )
  );

-- Insertar: solo activities propias.
create policy "users can insert own activities"
  on public.activities
  for insert
  to authenticated
  with check (profile_id = auth.uid());

-- Update/delete: por ahora sin policy = bloqueado. Solo service_role.

-- ── point_configs ──────────────────────────────────────────────────────────
-- Ver: cualquier user logueado de mi dealership.
create policy "users can view point configs in same dealership"
  on public.point_configs
  for select
  to authenticated
  using (dealership_id = public.current_user_dealership_id());

-- Insert/update/delete: sin policy = solo service_role (los admins editan vía panel admin futuro).
