-- Race to the Sale — Session 6
-- Real email station with Resend. Tracks every outbound message in
-- lead_communications so the lead history is auditable and the foundation
-- is in place for SMS/calls/video/notes in later sessions.

-- 1) Allow email_sent as a valid XP event type.
alter table public.xp_events drop constraint if exists xp_events_event_type_check;
alter table public.xp_events add constraint xp_events_event_type_check check (event_type in (
  'lead_claimed_lightning',
  'lead_claimed_fast',
  'lead_claimed_ontime',
  'lead_claimed_late',
  'lead_claimed_stale',
  'station_phone',
  'station_computer',
  'station_photo',
  'station_leads',
  'email_sent'
));

-- 2) Customer email on leads. Nullable because legacy rows have none.
alter table public.leads add column if not exists customer_email text;

-- 3) lead_communications: one row per outbound message of any kind.
create table if not exists public.lead_communications (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  type          text not null check (type in ('email','sms','call','video','note')),
  template_used text,
  subject       text,
  content       text not null,
  recipient     text not null,
  status        text not null default 'sent'
                  check (status in ('sent','delivered','bounced','failed','opened')),
  external_id   text,
  metadata      jsonb not null default '{}'::jsonb,
  sent_at       timestamptz not null default now()
);

create index if not exists lead_communications_lead_idx
  on public.lead_communications (lead_id, sent_at desc);
create index if not exists lead_communications_profile_idx
  on public.lead_communications (profile_id, sent_at desc);

alter table public.lead_communications enable row level security;

-- Read your dealership's history. RLS on leads scopes by dealership_id;
-- joining through it covers tenancy correctly.
create policy "users can view communications for their dealership leads"
  on public.lead_communications
  for select to authenticated
  using (
    exists (
      select 1 from public.leads
      where leads.id = lead_communications.lead_id
        and leads.dealership_id = public.current_user_dealership_id()
    )
  );

-- Write only your own. The lead-ownership check (claimed_by = auth.uid()) is
-- enforced in the server action, not here, because RLS WITH CHECK can only
-- look at the row being inserted, not joined tables.
create policy "users can insert their own communications"
  on public.lead_communications
  for insert to authenticated
  with check (profile_id = auth.uid());

-- No UPDATE/DELETE policies on purpose. Communication history is append-only.
