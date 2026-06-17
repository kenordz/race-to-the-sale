// Interactive stations the player walks up to and triggers with SPACE.
// Positions are in world coordinates against the Office_Design_2 layout
// (512x544): top rows are cubicle desks, bottom-left is print/supply,
// bottom-right is an open meeting space.
//
// Stations no longer carry XP values: XP is awarded exclusively by
// server-verified actions (lead claims, real emails/SMS), never by
// proximity + SPACE. `placeholder: true` marks stations whose real
// integration has not shipped yet — they show a "coming soon" toast.

export type StationType = "phone" | "computer" | "sms" | "leads";

export type Station = {
  id: string;
  type: StationType;
  x: number;
  y: number;
  label: string;
  icon: string;
  /** True until the station triggers a real integration (Twilio, video…). */
  placeholder?: boolean;
};

export const STATION_COLORS: Record<StationType, number> = {
  phone: 0x22c55e, // green
  computer: 0x3b82f6, // blue
  sms: 0x06b6d4, // cyan
  leads: 0xa855f7, // purple
};

export const STATIONS: ReadonlyArray<Station> = [
  // Phone Booth — in front of a left-side cubicle in the upper row.
  // Placeholder until Twilio SMS/voice lands (Session 7).
  {
    id: "phone-1",
    type: "phone",
    x: 100,
    y: 165,
    label: "Phone Booth",
    icon: "📞",
    placeholder: true,
  },
  // Computer Desk — center cubicle in the upper row, the "main" workstation.
  // REAL: opens the Email Composer (Resend).
  {
    id: "computer-1",
    type: "computer",
    x: 256,
    y: 165,
    label: "Computer Desk",
    icon: "💻",
  },
  // SMS Station — bottom-left corner; the texting desk.
  // Placeholder until Twilio SMS lands (A2P 10DLC in progress).
  {
    id: "sms-1",
    type: "sms",
    x: 130,
    y: 455,
    label: "SMS Station",
    icon: "💬",
    placeholder: true,
  },
  // Lead Board — bottom-right meeting area near the wall poster, the spot
  // a real sales floor would post the day's hot leads.
  // REAL: atomic claim via claim_next_lead.
  {
    id: "leads-1",
    type: "leads",
    x: 400,
    y: 455,
    label: "Leads Board",
    icon: "📋",
  },
];

export const PROXIMITY_RADIUS = 60;
export const INTERACTION_COOLDOWN_MS = 1000;
