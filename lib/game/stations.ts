// Interactive stations the player walks up to and triggers with SPACE.
// Positions are in world coordinates (the Museum_room_2 background is
// 512x1056). Distributed across the three vertical levels so the player
// has a reason to traverse the map.

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
  {
    id: "phone-1",
    type: "phone",
    x: 140,
    y: 200,
    label: "Phone Booth",
    icon: "📞",
    actionLabel: "Llamada hecha",
    xpReward: 10,
  },
  {
    id: "computer-1",
    type: "computer",
    x: 360,
    y: 200,
    label: "Computer Desk",
    icon: "💻",
    actionLabel: "Email enviado",
    xpReward: 5,
  },
  {
    id: "photo-1",
    type: "photo",
    x: 256,
    y: 580,
    label: "Photo Station",
    icon: "📸",
    actionLabel: "Foto tomada",
    xpReward: 5,
  },
  {
    id: "leads-1",
    type: "leads",
    x: 256,
    y: 900,
    label: "Leads Board",
    icon: "📋",
    actionLabel: "Lead capturado",
    xpReward: 20,
  },
];

export const PROXIMITY_RADIUS = 60;
export const INTERACTION_COOLDOWN_MS = 1000;
