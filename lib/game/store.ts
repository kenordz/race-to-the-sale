// Single client-side source of truth for game state.
//
// Architecture rule this store enforces: Phaser scenes are RENDERERS, not
// owners of state. Data flows one way:
//
//   Supabase (Realtime + server actions) ──> store ──> { Phaser render, React HUD }
//
// React components consume it as a hook (`useGameStore(selector)`).
// Phaser scenes consume it imperatively (`useGameStore.getState()` /
// `useGameStore.subscribe(listener)`) — zustand stores work outside React.
//
// Why this matters strategically: the game layer must stay a *skin* over the
// activity engine. If pendingLeads/XP/daily live here instead of inside a
// Scene, we can ship a non-game view (manager dashboard, "fast mode") on the
// same state without touching Phaser.

import { createStore, useStore } from "zustand";
import type {
  LeadRow,
  LeaderboardRow,
  TodayActivitySummary,
} from "@/app/play/actions";

export type Toast = {
  id: number;
  message: string;
  /** Tailwind-compatible CSS color for the border accent, e.g. "#22c55e". */
  accent: string;
  durationMs: number;
};

export type GameState = {
  // ── Identity ──────────────────────────────────────────────────────────
  /** The signed-in user's profile id (set by the lead feed on boot). */
  myProfileId: string | null;

  // ── XP ────────────────────────────────────────────────────────────────
  /** Authoritative lifetime XP total (server-confirmed). */
  xp: number;

  // ── Daily activity ────────────────────────────────────────────────────
  dailyTotal: number;
  dailyTarget: number;

  // ── Lead feed ─────────────────────────────────────────────────────────
  /** All leads with status='new' for the user's dealership, keyed by id. */
  pendingLeads: Map<string, LeadRow>;
  /**
   * Claimed leads whose owner blew the 20-min response window — open for
   * anyone on the floor to steal at the Lead Board.
   */
  stealableLeads: Map<string, LeadRow>;

  // ── Leaderboard ───────────────────────────────────────────────────────
  /** Today's dealership standings, ordered by XP today. */
  leaderboard: LeaderboardRow[];

  // ── UI ────────────────────────────────────────────────────────────────
  toasts: Toast[];
  emailComposerOpen: boolean;
  myLeadsOpen: boolean;

  // ── Actions ───────────────────────────────────────────────────────────
  setXp: (total: number) => void;
  setDaily: (summary: TodayActivitySummary) => void;
  bumpDaily: (delta: number) => void;
  upsertPendingLead: (lead: LeadRow) => void;
  removePendingLead: (id: string) => void;
  hydratePendingLeads: (leads: LeadRow[]) => void;
  upsertStealableLead: (lead: LeadRow) => void;
  removeStealableLead: (id: string) => void;
  hydrateStealableLeads: (leads: LeadRow[]) => void;
  setMyProfileId: (id: string | null) => void;
  setLeaderboard: (rows: LeaderboardRow[]) => void;
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  setEmailComposerOpen: (open: boolean) => void;
  setMyLeadsOpen: (open: boolean) => void;
};

let toastSeq = 0;

export const gameStore = createStore<GameState>()((set) => ({
  myProfileId: null,
  xp: 0,
  dailyTotal: 0,
  dailyTarget: 90,
  pendingLeads: new Map(),
  stealableLeads: new Map(),
  leaderboard: [],
  toasts: [],
  emailComposerOpen: false,
  myLeadsOpen: false,

  setXp: (total) => set({ xp: total }),

  setDaily: (summary) =>
    set({ dailyTotal: summary.total, dailyTarget: summary.target }),

  bumpDaily: (delta) =>
    set((s) => ({ dailyTotal: Math.max(0, s.dailyTotal + delta) })),

  upsertPendingLead: (lead) =>
    set((s) => {
      const next = new Map(s.pendingLeads);
      next.set(lead.id, lead);
      return { pendingLeads: next };
    }),

  removePendingLead: (id) =>
    set((s) => {
      if (!s.pendingLeads.has(id)) return s;
      const next = new Map(s.pendingLeads);
      next.delete(id);
      return { pendingLeads: next };
    }),

  hydratePendingLeads: (leads) =>
    set(() => ({ pendingLeads: new Map(leads.map((l) => [l.id, l])) })),

  upsertStealableLead: (lead) =>
    set((s) => {
      const next = new Map(s.stealableLeads);
      next.set(lead.id, lead);
      return { stealableLeads: next };
    }),

  removeStealableLead: (id) =>
    set((s) => {
      if (!s.stealableLeads.has(id)) return s;
      const next = new Map(s.stealableLeads);
      next.delete(id);
      return { stealableLeads: next };
    }),

  hydrateStealableLeads: (leads) =>
    set(() => ({ stealableLeads: new Map(leads.map((l) => [l.id, l])) })),

  pushToast: (toast) =>
    set((s) => {
      const id = ++toastSeq;
      return { toasts: [...s.toasts, { ...toast, id }] };
    }),

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setEmailComposerOpen: (open) => set({ emailComposerOpen: open }),

  setMyLeadsOpen: (open) => set({ myLeadsOpen: open }),

  setMyProfileId: (id) => set({ myProfileId: id }),

  setLeaderboard: (rows) => set({ leaderboard: rows }),
}));

/** React hook — `const xp = useGameStore((s) => s.xp)` */
export function useGameStore<T>(selector: (state: GameState) => T): T {
  return useStore(gameStore, selector);
}
