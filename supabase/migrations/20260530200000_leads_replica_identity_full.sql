-- Race to the Sale — Session 5 Phase 2
-- Required for Supabase Realtime UPDATE/DELETE events on leads to include
-- previous-row values, which Phase 3 (claim mechanic) will rely on when
-- a UPDATE flips status from 'new' to 'claimed'. Without REPLICA IDENTITY
-- FULL, the WAL only ships the changed columns, and clients can't tell
-- which row was claimed.
-- Also helps stabilize Realtime filters on the table generally.
alter table public.leads replica identity full;
