-- Race to the Sale — Session 8 (Fable), part 2
-- Manager dashboard data layer. One RPC returns everything the manager
-- screen needs: per-rep stats, the lead funnel snapshot, and untouched
-- leads. Manager/admin only (this is THE accountability view — core rule
-- #5: "Managers inspect activity daily").

-- =============================================================================
-- get_team_stats — per-rep rollup, trailing 24h
-- =============================================================================
-- avg_response_seconds: avg(claimed_at - created_at) over leads claimed in
-- the window. Stolen leads reset claimed_at, slightly inflating the thief's
-- avg — acceptable; stealing late IS a slow first touch for the customer.

create or replace function public.get_team_stats()
returns table (
  profile_id           uuid,
  full_name            text,
  xp_today             bigint,
  activities_today     bigint,
  leads_claimed_today  bigint,
  emails_today         bigint,
  appointments_today   bigint,
  sales_today          bigint,
  steals_today         bigint,
  leads_lost_today     bigint,
  avg_response_seconds int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_dealership_id uuid;
begin
  select p.role, p.dealership_id into v_caller_role, v_dealership_id
  from public.profiles p
  where p.id = auth.uid();

  if v_dealership_id is null then
    raise exception 'user_has_no_dealership';
  end if;
  if v_caller_role not in ('manager', 'admin') then
    raise exception 'managers_only';
  end if;

  return query
  select
    p.id as profile_id,
    coalesce(p.full_name, 'Sin nombre') as full_name,
    coalesce(sum(xe.xp_amount), 0)::bigint as xp_today,
    count(xe.id)::bigint as activities_today,
    count(xe.id) filter (where xe.event_type like 'lead_claimed_%')::bigint
      as leads_claimed_today,
    count(xe.id) filter (where xe.event_type = 'email_sent')::bigint
      as emails_today,
    count(xe.id) filter (where xe.event_type = 'appointment_set')::bigint
      as appointments_today,
    count(xe.id) filter (where xe.event_type = 'lead_sold')::bigint
      as sales_today,
    count(xe.id) filter (where xe.event_type = 'lead_stolen')::bigint
      as steals_today,
    (
      select count(*) from public.leads ll
      where ll.metadata->>'stolen_from' = p.id::text
        and (ll.metadata->>'stolen_at')::timestamptz >= now() - interval '24 hours'
    )::bigint as leads_lost_today,
    (
      select avg(extract(epoch from (l.claimed_at - l.created_at)))::int
      from public.leads l
      where l.claimed_by = p.id
        and l.claimed_at >= now() - interval '24 hours'
        and l.metadata->>'stolen_at' is null
    ) as avg_response_seconds
  from public.profiles p
  left join public.xp_events xe
    on xe.profile_id = p.id
    and xe.created_at >= now() - interval '24 hours'
  where p.dealership_id = v_dealership_id
    and p.role in ('salesperson', 'manager', 'admin')
  group by p.id, p.full_name
  order by xp_today desc;
end;
$$;

revoke all on function public.get_team_stats() from public;
grant execute on function public.get_team_stats() to authenticated;

-- =============================================================================
-- get_lead_funnel — current snapshot + untouched leads
-- =============================================================================

create or replace function public.get_lead_funnel()
returns table (
  status text,
  count  bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_dealership_id uuid;
begin
  select p.role, p.dealership_id into v_caller_role, v_dealership_id
  from public.profiles p
  where p.id = auth.uid();

  if v_dealership_id is null then
    raise exception 'user_has_no_dealership';
  end if;
  if v_caller_role not in ('manager', 'admin') then
    raise exception 'managers_only';
  end if;

  return query
  select l.status, count(*)::bigint
  from public.leads l
  where l.dealership_id = v_dealership_id
  group by l.status;
end;
$$;

revoke all on function public.get_lead_funnel() from public;
grant execute on function public.get_lead_funnel() to authenticated;
