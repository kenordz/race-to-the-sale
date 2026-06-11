-- Race to the Sale — Session 7 (Fable)
-- THE STEAL MECHANIC — the killer rule from Sergio's playbook:
--   "Si un lead entra y el vendedor asignado no responde en 20 minutos,
--    el lead queda abierto para que otro lo tome."
--
-- Flow:
--   1. A cron job (every minute) flips claimed leads with no outbound
--      communication from their owner within 20 min → status 'stealable'.
--   2. Realtime broadcasts the UPDATE; every client shows the orange
--      "STEAL!" alert on the Lead Board.
--   3. Any teammate who claims at the board takes the lead away from the
--      original owner (+40 XP, event 'lead_stolen'). The original owner
--      keeps nothing — losing leads has to hurt or the urgency is fake.
--   4. The owner can SAVE their lead by communicating before anyone steals
--      it (sendLeadEmail flips stealable → contacted, handled app-side).

-- =============================================================================
-- 1. Status + event type extensions
-- =============================================================================

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'new','claimed','stealable','contacted','appointment_set','sold','dead','orphan'
));

alter table public.xp_events drop constraint if exists xp_events_event_type_check;
alter table public.xp_events add constraint xp_events_event_type_check check (event_type in (
  'lead_claimed_lightning',
  'lead_claimed_fast',
  'lead_claimed_ontime',
  'lead_claimed_late',
  'lead_claimed_stale',
  'lead_stolen',
  -- legacy station_* types: still readable, never written since the
  -- verified-XP cleanup (no client-driven XP).
  'station_phone',
  'station_computer',
  'station_photo',
  'station_leads',
  'email_sent'
));

-- =============================================================================
-- 2. release_stale_claims — flips unworked claims to 'stealable'
-- =============================================================================
-- A claim is "stale" when the owner has sent NO communication on the lead
-- since claiming it, within the window. Communications are the proof of
-- work (lead_communications is append-only), so this can't be gamed by
-- just sitting on the lead.
--
-- p_window: callable with a shorter window for demos ("force steal check"),
-- but only managers/admins may shrink it below the playbook's 20 minutes.
-- Cron runs as postgres (auth.uid() is null) and always uses the default.

create or replace function public.release_stale_claims(
  p_window interval default interval '20 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_count integer;
begin
  if p_window < interval '20 minutes' then
    -- Shorter-than-playbook windows are a demo/admin tool. auth.uid() is
    -- null when called by cron/service_role; real users need manager+.
    if auth.uid() is not null then
      select role into v_caller_role from public.profiles where id = auth.uid();
      if v_caller_role not in ('manager', 'admin') then
        raise exception 'only_managers_can_force_steal';
      end if;
    end if;
  end if;

  with flipped as (
    update public.leads l
    set status = 'stealable'
    where l.status = 'claimed'
      and l.claimed_at < now() - p_window
      and not exists (
        select 1 from public.lead_communications lc
        where lc.lead_id = l.id
          and lc.profile_id = l.claimed_by
          and lc.sent_at >= l.claimed_at
      )
    returning l.id
  )
  select count(*) into v_count from flipped;

  return v_count;
end;
$$;

revoke all on function public.release_stale_claims(interval) from public;
grant execute on function public.release_stale_claims(interval) to authenticated;

-- =============================================================================
-- 3. claim_next_lead v2 — now also steals
-- =============================================================================
-- Priority: a fresh 'new' lead first (response speed is the core metric);
-- if none, the oldest 'stealable' lead NOT owned by the caller. Same atomic
-- FOR UPDATE SKIP LOCKED pattern — two players mashing SPACE can never get
-- the same lead.
--
-- Steal XP is a flat +40 ('lead_stolen'): the response clock vs created_at
-- already ran out, so time-tiering it would always award the stale floor.
-- 40 sits between 'fast' (50) and 'ontime' (30) — hustle pays, but less
-- than answering your own leads on time.
--
-- Return shape is unchanged (clients key off event_type = 'lead_stolen').

create or replace function public.claim_next_lead()
returns table (
  lead_id           uuid,
  source            text,
  event_type        text,
  xp_earned         int,
  response_seconds  int,
  new_total_xp      bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealership_id   uuid;
  v_lead            public.leads%rowtype;
  v_is_steal        boolean := false;
  v_response_seconds int;
  v_event_type      text;
  v_xp_amount       int;
  v_new_total       bigint;
begin
  -- Caller must be authenticated and assigned to a dealership.
  select dealership_id into v_dealership_id
  from public.profiles
  where id = auth.uid();
  if v_dealership_id is null then
    raise exception 'user_has_no_dealership';
  end if;

  -- 1st choice: oldest unclaimed lead.
  select * into v_lead
  from public.leads
  where dealership_id = v_dealership_id
    and status = 'new'
  order by created_at asc
  limit 1
  for update skip locked;

  -- 2nd choice: oldest stealable lead owned by someone else.
  if v_lead.id is null then
    select * into v_lead
    from public.leads
    where dealership_id = v_dealership_id
      and status = 'stealable'
      and claimed_by is distinct from auth.uid()
    order by claimed_at asc
    limit 1
    for update skip locked;
    if v_lead.id is not null then
      v_is_steal := true;
    end if;
  end if;

  if v_lead.id is null then
    raise exception 'no_leads_available';
  end if;

  v_response_seconds := extract(epoch from (now() - v_lead.created_at))::int;

  if v_is_steal then
    v_event_type := 'lead_stolen';
    v_xp_amount  := 40;

    update public.leads
    set status = 'claimed',
        claimed_at = now(),
        claimed_by = auth.uid(),
        metadata = metadata || jsonb_build_object(
          'stolen_from', v_lead.claimed_by,
          'stolen_at', now()
        )
    where id = v_lead.id;
  else
    if v_response_seconds < 30 then
      v_event_type := 'lead_claimed_lightning';
      v_xp_amount  := 75;
    elsif v_response_seconds < 120 then
      v_event_type := 'lead_claimed_fast';
      v_xp_amount  := 50;
    elsif v_response_seconds < 300 then
      v_event_type := 'lead_claimed_ontime';
      v_xp_amount  := 30;
    elsif v_response_seconds < 3600 then
      v_event_type := 'lead_claimed_late';
      v_xp_amount  := 15;
    else
      v_event_type := 'lead_claimed_stale';
      v_xp_amount  := 5;
    end if;

    update public.leads
    set status = 'claimed',
        claimed_at = now(),
        claimed_by = auth.uid()
    where id = v_lead.id;
  end if;

  insert into public.xp_events (profile_id, event_type, xp_amount, lead_id)
  values (auth.uid(), v_event_type, v_xp_amount, v_lead.id);

  select coalesce(sum(xp_amount), 0) into v_new_total
  from public.xp_events
  where profile_id = auth.uid();

  return query select
    v_lead.id,
    v_lead.source,
    v_event_type,
    v_xp_amount,
    v_response_seconds,
    v_new_total;
end;
$$;

revoke all on function public.claim_next_lead() from public;
grant execute on function public.claim_next_lead() to authenticated;

-- =============================================================================
-- 4. reset_demo_day — demo control panel "reset" button
-- =============================================================================
-- Wipes the caller's dealership game data (communications, XP, leads) so
-- Sergio can run back-to-back demos from a clean slate. Manager/admin only.

create or replace function public.reset_demo_day()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealership_id uuid;
  v_caller_role text;
begin
  select dealership_id, role into v_dealership_id, v_caller_role
  from public.profiles
  where id = auth.uid();

  if v_dealership_id is null then
    raise exception 'user_has_no_dealership';
  end if;
  if v_caller_role not in ('manager', 'admin') then
    raise exception 'only_managers_can_reset';
  end if;

  delete from public.lead_communications lc
  using public.leads l
  where lc.lead_id = l.id
    and l.dealership_id = v_dealership_id;

  delete from public.xp_events xe
  using public.profiles p
  where xe.profile_id = p.id
    and p.dealership_id = v_dealership_id;

  delete from public.leads
  where dealership_id = v_dealership_id;
end;
$$;

revoke all on function public.reset_demo_day() from public;
grant execute on function public.reset_demo_day() to authenticated;

-- =============================================================================
-- 5. pg_cron — run the steal check every minute
-- =============================================================================
-- Guarded so the migration still applies on environments without pg_cron
-- (e.g. local supabase start without the extension); hosted Supabase has it.

do $$
begin
  create extension if not exists pg_cron;

  -- Re-schedule idempotently.
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'release-stale-claims';

  perform cron.schedule(
    'release-stale-claims',
    '* * * * *',
    $cron$ select public.release_stale_claims(); $cron$
  );
exception
  when others then
    raise notice 'pg_cron unavailable, skipping schedule: %', sqlerrm;
end;
$$;
