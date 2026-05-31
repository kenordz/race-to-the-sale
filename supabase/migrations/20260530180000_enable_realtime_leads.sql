-- Race to the Sale — Session 5 Phase 2
-- Enable Supabase Realtime broadcast on leads so the client can subscribe to
-- INSERT events instead of polling. Without this, channel().on('postgres_changes')
-- silently never fires for the leads table.
alter publication supabase_realtime add table public.leads;
