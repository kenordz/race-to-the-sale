-- Race to the Sale — Session 5 Phase 3
-- Atomic claim flow as a SECURITY DEFINER function. Doing this in one
-- transaction with FOR UPDATE SKIP LOCKED is the only way to make multi-
-- player safe: two players pressing SPACE at the same instant can never
-- both walk away with the same lead.
--
-- The XP scale (75/50/30/15/5) mirrors lib/game/xp-events.ts XP_PER_EVENT
-- exactly. If you change one, change the other.

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

  -- Atomically grab the oldest unclaimed lead from the user's dealership.
  -- SKIP LOCKED is what makes this safe under contention: if another
  -- transaction already holds a row lock on the oldest lead, we silently
  -- pass it over and try the next one.
  select * into v_lead
  from public.leads
  where dealership_id = v_dealership_id
    and status = 'new'
  order by created_at asc
  limit 1
  for update skip locked;

  if v_lead.id is null then
    raise exception 'no_leads_available';
  end if;

  v_response_seconds := extract(epoch from (now() - v_lead.created_at))::int;

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

-- Only the authenticated role can call this; service_role can too but that
-- is implicit and not granted explicitly.
revoke all on function public.claim_next_lead() from public;
grant execute on function public.claim_next_lead() to authenticated;
