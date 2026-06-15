// Single source of truth for XP awards on the client/server-action side.
//
// Design rule: every event type here corresponds to VERIFIED real work —
// a lead claim (atomic, server-timed) or an outbound communication that
// actually shipped. There are deliberately no "I pressed SPACE at a
// station" events: placeholder stations award nothing until their real
// integrations (Twilio SMS/voice, video) land, so the daily activity
// counter never contains fiction.
//
// The claim tier values (75/50/30/15/5) also live in the
// claim_next_lead stored procedure — keep them in sync until point
// values move into a per-dealership config table (planned: resurrect
// point_configs).
//
// The xp_events.event_type CHECK constraint still accepts legacy
// station_* rows recorded before this cleanup; they are read (and bucketed
// by getTodayActivities) but never written anymore.

export type EventType =
  | "lead_claimed_lightning"
  | "lead_claimed_fast"
  | "lead_claimed_ontime"
  | "lead_claimed_late"
  | "lead_claimed_stale"
  | "lead_stolen"
  | "appointment_set"
  | "lead_sold"
  | "email_sent";

export const XP_PER_EVENT: Record<EventType, number> = {
  lead_claimed_lightning: 75,
  lead_claimed_fast: 50,
  lead_claimed_ontime: 30,
  lead_claimed_late: 15,
  lead_claimed_stale: 5,
  // Stealing an unworked teammate lead (20-min rule). Flat value: the
  // created_at response clock already ran out, so time-tiering would always
  // hit the stale floor. Sits between fast (50) and ontime (30) — hustle
  // pays, but less than answering your own leads on time.
  lead_stolen: 40,
  // The playbook's gold metric (2+ per rep per day). Self-reported, but
  // public on the leaderboard and inspected daily by managers.
  appointment_set: 60,
  // The point of the whole exercise.
  lead_sold: 150,
  // Real outbound work — an actual email is sent, not just a counter bump.
  email_sent: 15,
};
