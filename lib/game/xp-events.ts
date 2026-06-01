// Single source of truth for XP awards. The same event types live in the
// CHECK constraint on xp_events.event_type — keep them in sync when you add
// or rename a type.

import type { StationType } from "@/lib/game/stations";

export type EventType =
  | "lead_claimed_lightning"
  | "lead_claimed_fast"
  | "lead_claimed_ontime"
  | "lead_claimed_late"
  | "lead_claimed_stale"
  | "station_phone"
  | "station_computer"
  | "station_photo"
  | "station_leads"
  | "email_sent";

export const XP_PER_EVENT: Record<EventType, number> = {
  lead_claimed_lightning: 75,
  lead_claimed_fast: 50,
  lead_claimed_ontime: 30,
  lead_claimed_late: 15,
  lead_claimed_stale: 5,
  station_phone: 10,
  station_computer: 5,
  station_photo: 5,
  station_leads: 20,
  // Higher than station_computer because this is real outbound work (a
  // real email is sent, not just a counter bump).
  email_sent: 15,
};

export const STATION_TO_EVENT: Record<StationType, EventType> = {
  phone: "station_phone",
  computer: "station_computer",
  photo: "station_photo",
  leads: "station_leads",
};
