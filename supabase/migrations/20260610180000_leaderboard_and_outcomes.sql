-- Race to the Sale — Session 8 (Fable)
-- 1) Leaderboard: dealership-wide read access on xp_events.
-- 2) Lead outcomes: appointment_set / sold with validated transitions and
--    server-side XP, completing the daily loop (claim → work → cita → venta).

-- =============================================================================
-- 1. Leaderboard RLS
-- =============================================================================
-- The original policy was own-events-only, which made a leaderboard
-- impossible. Competition requires seeing teammates' scores — that is the
-- whole game. Scoping: same dealership only.

drop policy if exists "users can view their own xp events" on public.xp_events;

create policy "users can view xp events in same dealership"
  on public.xp_events
  for select
  to authenticated
  using (
    profile_id in (
      select id from public.profiles
      where dealership_id = public.current_user_dealership_id()
    )
  );

-- =============================================================================
-- 2. Event types for outcomes
-- =============================================================================
-- appointment_set: the playbook's gold metric (2+ per day per rep).
-- lead_sold: the point of the whole exercise.
-- Values are placeholders until point_configs makes them per-dealership.

alter table public.xp_events drop constraint if exists xp_events_event_type_check;
alter table public.xp_events add constraint xp_events_event_type_check check (event_type in (
  'lead_claimed_lightning',
  'lead_claimed_fast',
  'lead_claimed_ontime',
  'lead_claimed_late',
  'lead_claimed_stale',
  'lead_stolen',
  'appointment_set',
  'lead_sold',
  'station_phone',
  'station_computer',
  'station_photo',
  'station_leads',
  'email_sent'
));

-- =============================================================================
-- 3. mark_lead_outcome — validated transition + XP, atomically
-- =============================================================================
-- Why a SECURITY DEFINER function instead of an UPDATE from the client:
--   * transition validation lives next to the data (no client can mark a
--     dead lead as sold, or sell the same lead twice for double XP);
--   * the status change and the XP insert happen in one transaction;
--   * double-award is impossible: we check for an existing xp_event of the
--     same type for that lead before inserting.
--
-- Allowed transitions:
--   claimed | contacted | stealable  -> appointment_set   (+60 XP)
--   claimed | contacted | stealable | appointment_set -> sold (+150 XP)
--
-- Caveat (honest): appointments/sales are self-reported milestones. The
-- backstop is social, not technical — they are public on the leaderboard
-- and managers inspect them daily (core rule #5 of the playbook).

create or replace function public.mark_lead_outcome(
  p_lead_id uuid,
  p_outcome text
)
returns table (
  lead_id      uuid,
  new_status   text,
  event_type   text,
  xp_earned    int,
  new_total_xp bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead        public.leads%rowtype;
  v_event_type  text;
  v_xp_amount   int;
  v_new_status  text;
  v_new_total   bigint;
begin
  if p_outcome not in ('appointment_set', 'sold') then
    raise exception 'invalid_outcome';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'lead_not_found';
  end if;
  if v_lead.claimed_by is distinct from auth.uid() then
    raise exception 'not_your_lead';
  end if;

  if p_outcome = 'appointment_set' then
    if v_lead.status not in ('claimed', 'contacted', 'stealable') then
      raise exception 'invalid_transition';
    end if;
    v_new_status := 'appointment_set';
    v_event_type := 'appointment_set';
    v_xp_amount  := 60;
  else -- sold
    if v_lead.status not in ('claimed', 'contacted', 'stealable', 'appointment_set') then
      raise exception 'invalid_transition';
    end if;
    v_new_status := 'sold';
    v_event_type := 'lead_sold';
    v_xp_amount  := 150;
  end if;

  -- Double-award guard: one appointment XP and one sale XP per lead, ever.
  if exists (
    select 1 from public.xp_events xe
    where xe.lead_id = p_lead_id and xe.event_type = v_event_type
  ) then
    raise exception 'outcome_already_awarded';
  end if;

  update public.leads
  set status = v_new_status
  where id = p_lead_id;

  insert into public.xp_events (profile_id, event_type, xp_amount, lead_id)
  values (auth.uid(), v_event_type, v_xp_amount, p_lead_id);

  select coalesce(sum(xp_amount), 0) into v_new_total
  from public.xp_events
  where profile_id = auth.uid();

  return query select
    p_lead_id,
    v_new_status,
    v_event_type,
    v_xp_amount,
    v_new_total;
end;
$$;

revoke all on function public.mark_lead_outcome(uuid, text) from public;
grant execute on function public.mark_lead_outcome(uuid, text) to authenticated;

-- =============================================================================
-- 4. get_leaderboard — today's standings for the caller's dealership
-- =============================================================================
-- One round trip for the HUD panel. "Today" = trailing 24h, consistent with
-- getTodayActivities (per-dealership timezone cutoff is a known TODO).

create or replace function public.get_leaderboard()
returns table (
  profile_id    uuid,
  full_name     text,
  xp_today      bigint,
  xp_total      bigint,
  appointments_today bigint,
  sales_today   bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    coalesce(p.full_name, 'Sin nombre') as full_name,
    coalesce(sum(xe.xp_amount) filter (
      where xe.created_at >= now() - interval '24 hours'
    ), 0) as xp_today,
    coalesce(sum(xe.xp_amount), 0) as xp_total,
    count(*) filter (
      where xe.event_type = 'appointment_set'
        and xe.created_at >= now() - interval '24 hours'
    ) as appointments_today,
    count(*) filter (
      where xe.event_type = 'lead_sold'
        and xe.created_at >= now() - interval '24 hours'
    ) as sales_today
  from public.profiles p
  left join public.xp_events xe on xe.profile_id = p.id
  where p.dealership_id = public.current_user_dealership_id()
    and p.role in ('salesperson', 'manager', 'admin')
  group by p.id, p.full_name
  order by xp_today desc, xp_total desc;
$$;

revoke all on function public.get_leaderboard() from public;
grant execute on function public.get_leaderboard() to authenticated;
