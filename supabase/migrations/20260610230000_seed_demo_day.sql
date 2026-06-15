-- Race to the Sale — Session 8 (Fable), part 3
-- seed_demo_day(): one button in the Demo Director fills the dealership
-- with a realistic mid-morning state so demos and screenshots never start
-- from an empty floor:
--
--   * 3 fresh 'new' leads (1-4 min old — claimable at good XP tiers)
--   * 2 'new' leads already past the 5-min window (urgency on the board)
--   * 2 'claimed' leads owned by the caller (one fresh, one ~25 min old so
--     the next cron pass — or "force steal" — opens it for stealing)
--   * 2 'contacted' + 1 'appointment_set' + 1 'sold' for funnel depth
--
-- Manager/admin only. Demo data is tagged metadata.seeded=true; running it
-- again first clears previously seeded rows (idempotent-ish for demos).

create or replace function public.seed_demo_day()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealership_id uuid;
  v_caller_role text;
  v_caller uuid := auth.uid();
  v_count integer := 0;
  v_names text[] := array[
    'Maria Garcia','John Smith','Carlos Rodriguez','Sarah Johnson',
    'David Chen','Jessica Martinez','Linda Nguyen','Robert Wilson',
    'Emily Lopez','Daniel Patel','Gabriela Ramos','Marcus King'
  ];
  v_vehicles text[] := array[
    '2024 Ford F-150 XLT','2023 Honda Civic','Toyota RAV4 Hybrid',
    'Chevrolet Silverado 1500','Ford Bronco','Jeep Wrangler',
    'Toyota Camry','Hyundai Tucson','Mazda CX-5','Ram 1500',
    'Kia Telluride','Subaru Outback'
  ];
  v_sources text[] := array[
    'website','third_party','phone_up','text','chat','social'
  ];
  i integer;
  pick_name text;
  pick_vehicle text;
  pick_source text;
begin
  select p.dealership_id, p.role into v_dealership_id, v_caller_role
  from public.profiles p
  where p.id = v_caller;

  if v_dealership_id is null then
    raise exception 'user_has_no_dealership';
  end if;
  if v_caller_role not in ('manager', 'admin') then
    raise exception 'only_managers_can_seed';
  end if;

  -- Clear previous seed so repeated demos do not pile up.
  delete from public.lead_communications lc
  using public.leads l
  where lc.lead_id = l.id
    and l.dealership_id = v_dealership_id
    and l.metadata->>'seeded' = 'true';
  delete from public.xp_events xe
  using public.leads l
  where xe.lead_id = l.id
    and l.dealership_id = v_dealership_id
    and l.metadata->>'seeded' = 'true';
  delete from public.leads
  where dealership_id = v_dealership_id
    and metadata->>'seeded' = 'true';

  -- Helper-ish loop: rows defined as (status, created_min_ago, claimed_min_ago or null)
  for i in 1..11 loop
    pick_name := v_names[1 + floor(random() * array_length(v_names, 1))::int % array_length(v_names, 1)];
    pick_vehicle := v_vehicles[1 + floor(random() * array_length(v_vehicles, 1))::int % array_length(v_vehicles, 1)];
    pick_source := v_sources[1 + floor(random() * array_length(v_sources, 1))::int % array_length(v_sources, 1)];

    if i <= 3 then
      -- fresh new leads (1-4 min): claimable now at decent tiers
      insert into public.leads (dealership_id, source, status, customer_name, customer_email, vehicle_interest, created_at, metadata)
      values (
        v_dealership_id, pick_source, 'new', pick_name,
        lower(replace(pick_name, ' ', '.')) || '@example.com',
        pick_vehicle,
        now() - make_interval(mins => 1 + i),
        '{"seeded": true}'::jsonb
      );
    elsif i <= 5 then
      -- aging new leads (12-25 min): URGENT on the board
      insert into public.leads (dealership_id, source, status, customer_name, customer_email, vehicle_interest, created_at, metadata)
      values (
        v_dealership_id, pick_source, 'new', pick_name,
        lower(replace(pick_name, ' ', '.')) || '@example.com',
        pick_vehicle,
        now() - make_interval(mins => 12 + (i - 4) * 13),
        '{"seeded": true}'::jsonb
      );
    elsif i = 6 then
      -- caller's fresh claim (safe)
      insert into public.leads (dealership_id, source, status, customer_name, customer_email, vehicle_interest, created_at, claimed_at, claimed_by, metadata)
      values (
        v_dealership_id, pick_source, 'claimed', pick_name,
        lower(replace(pick_name, ' ', '.')) || '@example.com',
        pick_vehicle,
        now() - interval '8 minutes', now() - interval '5 minutes', v_caller,
        '{"seeded": true}'::jsonb
      );
    elsif i = 7 then
      -- caller's stale claim (~25 min, no comms): next steal check opens it
      insert into public.leads (dealership_id, source, status, customer_name, customer_email, vehicle_interest, created_at, claimed_at, claimed_by, metadata)
      values (
        v_dealership_id, pick_source, 'claimed', pick_name,
        lower(replace(pick_name, ' ', '.')) || '@example.com',
        pick_vehicle,
        now() - interval '30 minutes', now() - interval '25 minutes', v_caller,
        '{"seeded": true}'::jsonb
      );
    elsif i <= 9 then
      -- contacted: worked leads for funnel depth
      insert into public.leads (dealership_id, source, status, customer_name, customer_email, vehicle_interest, created_at, claimed_at, claimed_by, metadata)
      values (
        v_dealership_id, pick_source, 'contacted', pick_name,
        lower(replace(pick_name, ' ', '.')) || '@example.com',
        pick_vehicle,
        now() - make_interval(hours => 2 + i), now() - make_interval(hours => 2 + i) + interval '3 minutes', v_caller,
        '{"seeded": true}'::jsonb
      );
    elsif i = 10 then
      insert into public.leads (dealership_id, source, status, customer_name, customer_email, vehicle_interest, created_at, claimed_at, claimed_by, metadata)
      values (
        v_dealership_id, pick_source, 'appointment_set', pick_name,
        lower(replace(pick_name, ' ', '.')) || '@example.com',
        pick_vehicle,
        now() - interval '5 hours', now() - interval '4 hours 57 minutes', v_caller,
        '{"seeded": true}'::jsonb
      );
    else
      insert into public.leads (dealership_id, source, status, customer_name, customer_email, vehicle_interest, created_at, claimed_at, claimed_by, metadata)
      values (
        v_dealership_id, pick_source, 'sold', pick_name,
        lower(replace(pick_name, ' ', '.')) || '@example.com',
        pick_vehicle,
        now() - interval '7 hours', now() - interval '6 hours 58 minutes', v_caller,
        '{"seeded": true}'::jsonb
      );
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.seed_demo_day() from public;
grant execute on function public.seed_demo_day() to authenticated;
