// Lead feed service: owns the Supabase Realtime subscription for the
// `leads` table and mirrors it into the game store. Extracted from
// MainScene so that Phaser is a pure renderer — the feed keeps working
// even if no scene is mounted (e.g. a future dashboard-only view).
//
// It tracks two live collections:
//   pendingLeads   — status 'new', racing to be claimed
//   stealableLeads — status 'stealable', claimed but unworked for 20 min,
//                    open for any teammate to take (Sergio's killer rule)
//
// Lifecycle is owned by the React layer (GameCanvas): call startLeadFeed()
// on mount, call the returned stop() on unmount.

import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  getMyDealershipId,
  getPendingLeads,
  getStealableLeads,
  type LeadRow,
} from "@/app/play/actions";
import { gameStore } from "@/lib/game/store";
import { playLeadBeep, playStealAlert } from "@/lib/game/audio";
import { formatSourceLabel } from "@/lib/game/mock-data";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

const LEAD_TOAST_DURATION_MS = 3000;
const STEAL_TOAST_DURATION_MS = 4000;

export type LeadFeedHandle = {
  stop: () => void;
};

export function startLeadFeed(): LeadFeedHandle {
  let supabaseClient: SupabaseClient | null = null;
  let channel: RealtimeChannel | null = null;
  let stopped = false;

  void (async () => {
    try {
      // Create the Supabase client *first* so its Realtime WebSocket can
      // start connecting in the background while we await the server
      // actions below. If we create it just before subscribing, the first
      // postgres_changes binding races with the WS handshake and delivery
      // silently fails — even though state reports "joined" and the
      // subscribe callback fires "SUBSCRIBED". The awaits below give the
      // WS the ~100-300ms it needs to settle.
      supabaseClient = createBrowserSupabaseClient();

      // Who am I? Needed to tell "I stole a lead" apart from "MY lead got
      // stolen" on the same UPDATE event.
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      const myUserId = user?.id ?? null;
      // Share it with the store so UI (leaderboard highlight, My Leads) can
      // tell "me" apart without an extra auth round trip.
      gameStore.getState().setMyProfileId(myUserId);

      const dealershipId = await getMyDealershipId();
      if (!dealershipId) {
        console.warn("[lead feed] no dealership_id on profile, skipping");
        return;
      }

      // Hydrate both live collections so countdowns/steal lists are
      // accurate after a refresh (created_at/claimed_at are server truth).
      const [pending, stealable] = await Promise.all([
        getPendingLeads(),
        getStealableLeads(),
      ]);
      if (stopped) return;
      gameStore.getState().hydratePendingLeads(pending);
      gameStore.getState().hydrateStealableLeads(stealable);

      // Two non-obvious things to know about this subscription:
      // 1. Channel names must be unique per page load. Re-using a name like
      //    "leads-feed" across hot reloads silently breaks delivery — the
      //    server-side config from the first mount sticks and later mounts
      //    join but never receive events. We tag the name with a timestamp.
      // 2. postgres_changes filters on UUID columns are unreliable. The
      //    filter `dealership_id=eq.{uuid}` matches nothing even when the
      //    value is correct. We subscribe unfiltered and discriminate in
      //    the callback. RLS keeps cross-dealership data out of selects;
      //    Realtime broadcasts everything to subscribers, so the JS-side
      //    check is what isolates tenants on the live feed.
      const channelName = `leads-feed-${Date.now()}`;
      channel = supabaseClient
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "leads" },
          (payload) => {
            const lead = payload.new as LeadRow;
            if (lead.dealership_id !== dealershipId) return;
            handleNewLead(lead);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "leads" },
          (payload) => {
            const lead = payload.new as LeadRow;
            // `old` carries the full previous row thanks to REPLICA
            // IDENTITY FULL on leads (migration 20260530200000).
            const prev = payload.old as Partial<LeadRow>;
            if (lead.dealership_id !== dealershipId) return;
            handleLeadUpdate(lead, prev, myUserId);
          }
        )
        .subscribe();
    } catch (err) {
      console.error("[lead feed] setup failed:", err);
    }
  })();

  return {
    stop: () => {
      stopped = true;
      if (channel && supabaseClient) {
        void supabaseClient.removeChannel(channel);
      }
      channel = null;
      supabaseClient = null;
    },
  };
}

function handleNewLead(lead: LeadRow) {
  const store = gameStore.getState();
  if (store.pendingLeads.has(lead.id)) return; // de-dupe
  store.upsertPendingLead(lead);
  store.pushToast({
    message: `🚨 NEW LEAD from ${formatSourceLabel(lead.source)} — 5:00 to claim!`,
    accent: "#ef4444",
    durationMs: LEAD_TOAST_DURATION_MS,
  });
  playLeadBeep();
}

function handleLeadUpdate(
  lead: LeadRow,
  prev: Partial<LeadRow>,
  myUserId: string | null
) {
  const store = gameStore.getState();

  // Leaving the pending feed: any transition away from 'new' (claim by me
  // or a teammate).
  if (lead.status !== "new") {
    store.removePendingLead(lead.id);
  }

  // Entering the steal board: cron flipped an unworked claim.
  if (lead.status === "stealable") {
    const isMine = lead.claimed_by === myUserId;
    if (!store.stealableLeads.has(lead.id)) {
      store.upsertStealableLead(lead);
      store.pushToast(
        isMine
          ? {
              message: `⚠️ YOUR lead (${formatSourceLabel(lead.source)}) is up for grabs — work it NOW!`,
              accent: "#f97316",
              durationMs: STEAL_TOAST_DURATION_MS,
            }
          : {
              message: `😈 STEAL OPPORTUNITY — unworked ${formatSourceLabel(lead.source)} lead on the board!`,
              accent: "#f97316",
              durationMs: STEAL_TOAST_DURATION_MS,
            }
      );
      playStealAlert();
    }
    return;
  }

  // Leaving the steal board: stolen by someone, or saved by its owner.
  if (prev.status === "stealable" || store.stealableLeads.has(lead.id)) {
    store.removeStealableLead(lead.id);

    // The sting: it was MY lead and now it belongs to someone else.
    // (My own steal/claim toasts are handled by the claim flow itself.)
    if (
      myUserId &&
      prev.claimed_by === myUserId &&
      lead.claimed_by !== myUserId
    ) {
      store.pushToast({
        message: `💀 Your ${formatSourceLabel(lead.source)} lead was STOLEN by a teammate`,
        accent: "#dc2626",
        durationMs: STEAL_TOAST_DURATION_MS,
      });
    }
  }
}
