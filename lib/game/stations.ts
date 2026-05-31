// Interactive stations the player walks up to and triggers with SPACE.
// Positions are in world coordinates against the Office_Design_2 layout
// (512x544): top rows are cubicle desks, bottom-left is print/supply,
// bottom-right is an open meeting space.

export type StationType = "phone" | "computer" | "photo" | "leads";

export type Station = {
  id: string;
  type: StationType;
  x: number;
  y: number;
  label: string;
  icon: string;
  actionLabel: string;
  xpReward: number;
};

export const STATION_COLORS: Record<StationType, number> = {
  phone: 0x22c55e, // green
  computer: 0x3b82f6, // blue
  photo: 0xeab308, // yellow
  leads: 0xa855f7, // purple
};

export const STATIONS: ReadonlyArray<Station> = [
  // Phone Booth — in front of a left-side cubicle in the upper row.
  {
    id: "phone-1",
    type: "phone",
    x: 100,
    y: 165,
    label: "Phone Booth",
    icon: "📞",
    actionLabel: "Llamada hecha",
    xpReward: 10,
  },
  // Computer Desk — center cubicle in the upper row, the "main" workstation.
  {
    id: "computer-1",
    type: "computer",
    x: 256,
    y: 165,
    label: "Computer Desk",
    icon: "💻",
    actionLabel: "Email enviado",
    xpReward: 5,
  },
  // Photo Station — bottom-left print/supply area; quiet corner.
  {
    id: "photo-1",
    type: "photo",
    x: 130,
    y: 455,
    label: "Photo Station",
    icon: "📸",
    actionLabel: "Foto tomada",
    xpReward: 5,
  },
  // Lead Board — bottom-right meeting area near the wall poster, the spot
  // a real sales floor would post the day's hot leads.
  {
    id: "leads-1",
    type: "leads",
    x: 400,
    y: 455,
    label: "Leads Board",
    icon: "📋",
    actionLabel: "Lead capturado",
    xpReward: 20,
  },
];

export const PROXIMITY_RADIUS = 60;
export const INTERACTION_COOLDOWN_MS = 1000;
