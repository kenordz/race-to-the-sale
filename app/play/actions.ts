"use server";

import { createClient } from "@/lib/supabase/server";
import { XP_PER_EVENT, type EventType } from "@/lib/game/xp-events";
import {
  MOCK_CUSTOMER_NAMES,
  MOCK_LEAD_SOURCES,
  MOCK_VEHICLE_INTERESTS,
  pickRandom,
} from "@/lib/game/mock-data";

export type LeadRow = {
  id: string;
  dealership_id: string;
  source: string;
  status: string;
  age_bucket: string;
  customer_name: string | null;
  vehicle_interest: string | null;
  created_at: string;
  claimed_at: string | null;
  claimed_by: string | null;
};

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

export async function getMyDealershipId(): Promise<string | null> {
  const supabase = await createClient();
  const userId = await getAuthedUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("dealership_id")
    .eq("id", userId)
    .single();
  if (error) throw new Error(`getMyDealershipId: ${error.message}`);
  return data?.dealership_id ?? null;
}

export async function getPendingLeads(): Promise<LeadRow[]> {
  const supabase = await createClient();
  // RLS already constrains to the user's dealership, but we filter on status
  // server-side anyway so the response is small.
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("status", "new")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getPendingLeads: ${error.message}`);
  return (data ?? []) as LeadRow[];
}

export async function generateMockLead(): Promise<LeadRow> {
  const supabase = await createClient();
  const userId = await getAuthedUserId();

  // We need to read the user's dealership_id ourselves rather than relying on
  // a default — RLS will block the insert otherwise. If the profile has no
  // dealership_id, fail loudly so the caller knows to assign one (this is a
  // demo-time setup gap, not a runtime user error).
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("dealership_id")
    .eq("id", userId)
    .single();
  if (profileErr) throw new Error(`generateMockLead: ${profileErr.message}`);
  if (!profile?.dealership_id) {
    throw new Error("generateMockLead: user has no dealership assigned");
  }

  const source = pickRandom(MOCK_LEAD_SOURCES);
  const customer_name = pickRandom(MOCK_CUSTOMER_NAMES);
  const vehicle_interest = pickRandom(MOCK_VEHICLE_INTERESTS);

  const { data, error } = await supabase
    .from("leads")
    .insert({
      dealership_id: profile.dealership_id,
      source,
      customer_name,
      vehicle_interest,
    })
    .select()
    .single();

  if (error) throw new Error(`generateMockLead: ${error.message}`);
  return data as LeadRow;
}
