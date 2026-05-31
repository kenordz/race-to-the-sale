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

export type ClaimResult =
  | {
      ok: true;
      leadId: string;
      source: string;
      eventType: EventType;
      xpEarned: number;
      responseSeconds: number;
      newTotalXP: number;
    }
  | { ok: false; reason: "no_leads" | "user_has_no_dealership" | "unknown"; message?: string };

export async function claimNextLead(): Promise<ClaimResult> {
  const supabase = await createClient();
  await getAuthedUserId(); // throws if not signed in

  // Single-call atomic claim: the SECURITY DEFINER function holds the row
  // lock the whole way through, so multiple players SPACE-mashing at once
  // can never get the same lead.
  const { data, error } = await supabase.rpc("claim_next_lead").single();

  if (error) {
    if (error.message.includes("no_leads_available")) {
      return { ok: false, reason: "no_leads" };
    }
    if (error.message.includes("user_has_no_dealership")) {
      return { ok: false, reason: "user_has_no_dealership" };
    }
    return { ok: false, reason: "unknown", message: error.message };
  }

  type ClaimRow = {
    lead_id: string;
    source: string;
    event_type: EventType;
    xp_earned: number;
    response_seconds: number;
    new_total_xp: number;
  };
  const row = data as ClaimRow;

  return {
    ok: true,
    leadId: row.lead_id,
    source: row.source,
    eventType: row.event_type,
    xpEarned: row.xp_earned,
    responseSeconds: row.response_seconds,
    newTotalXP: row.new_total_xp,
  };
}

export type TodayActivitySummary = {
  total: number;
  target: number;
  byCategory: {
    leads: number;
    calls: number;
    emails: number;
    media: number;
  };
};

const DAILY_TARGET = 90;

export async function getTodayActivities(): Promise<TodayActivitySummary> {
  const supabase = await createClient();
  const userId = await getAuthedUserId();

  // "Today" is approximated as the trailing 24 hours. A precise dealership-
  // local midnight cutoff needs per-tenant timezone config (todo: profile
  // or dealership setting). For the demo, last-24h is timezone-agnostic
  // and matches the "you have one shift to hit your number" framing.
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("xp_events")
    .select("event_type")
    .eq("profile_id", userId)
    .gte("created_at", twentyFourHoursAgo.toISOString());

  if (error) throw new Error(`getTodayActivities: ${error.message}`);

  const rows = data ?? [];
  const summary: TodayActivitySummary = {
    total: rows.length,
    target: DAILY_TARGET,
    byCategory: { leads: 0, calls: 0, emails: 0, media: 0 },
  };
  for (const row of rows) {
    const t = row.event_type as string;
    if (t.startsWith("lead_claimed_")) summary.byCategory.leads += 1;
    else if (t === "station_phone") summary.byCategory.calls += 1;
    else if (t === "station_computer") summary.byCategory.emails += 1;
    else if (t === "station_photo") summary.byCategory.media += 1;
  }
  return summary;
}
