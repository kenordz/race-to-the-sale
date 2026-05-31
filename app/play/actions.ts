"use server";

import { createClient } from "@/lib/supabase/server";
import { XP_PER_EVENT, type EventType } from "@/lib/game/xp-events";

async function getAuthedUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function getCurrentXP(): Promise<number> {
  const supabase = await createClient();
  const userId = await getAuthedUserId();

  const { data, error } = await supabase
    .from("xp_events")
    .select("xp_amount")
    .eq("profile_id", userId);

  if (error) throw new Error(`getCurrentXP: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + row.xp_amount, 0);
}

export async function awardXP(args: {
  eventType: EventType;
  leadId?: string | null;
}): Promise<number> {
  const supabase = await createClient();
  const userId = await getAuthedUserId();
  const xpAmount = XP_PER_EVENT[args.eventType];

  const { error } = await supabase.from("xp_events").insert({
    profile_id: userId,
    event_type: args.eventType,
    xp_amount: xpAmount,
    lead_id: args.leadId ?? null,
  });

  if (error) throw new Error(`awardXP: ${error.message}`);

  // Re-sum in the same request so the caller can update the HUD without a
  // second roundtrip. Two queries for now — fine at our volume; revisit if
  // it ever hot-paths.
  return getCurrentXP();
}
