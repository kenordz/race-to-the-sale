"use server";

import { createClient } from "@/lib/supabase/server";
import { XP_PER_EVENT, type EventType } from "@/lib/game/xp-events";
import {
  MOCK_CUSTOMER_NAMES,
  MOCK_LEAD_SOURCES,
  MOCK_VEHICLE_INTERESTS,
  mockEmailFor,
  pickRandom,
} from "@/lib/game/mock-data";

export type LeadRow = {
  id: string;
  dealership_id: string;
  source: string;
  status: string;
  age_bucket: string;
  customer_name: string | null;
  customer_email: string | null;
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

// NOTE: there is intentionally no client-callable awardXP action anymore.
// XP is only written by code paths that VERIFY the underlying work happened:
// the claim_next_lead stored procedure (response-time-tiered claim XP) and
// sendLeadEmail below (a real email left the building). A generic
// "insert whatever event_type the client sends" action let anyone farm XP
// and fake daily activity counts from devtools — which poisons the exact
// accountability data the product sells to managers.

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

export async function getStealableLeads(): Promise<LeadRow[]> {
  const supabase = await createClient();
  // Leads whose owner sat on them past the 20-min playbook window (flipped
  // by release_stale_claims). Oldest claim first = most steal-urgent.
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("status", "stealable")
    .order("claimed_at", { ascending: true });
  if (error) throw new Error(`getStealableLeads: ${error.message}`);
  return (data ?? []) as LeadRow[];
}

export async function generateMockLead(
  // Optional: the demo control panel injects leads with a chosen source so
  // Sergio can narrate ("watch — a CarGurus lead just came in").
  sourceOverride?: (typeof MOCK_LEAD_SOURCES)[number]
): Promise<LeadRow> {
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

  const source = sourceOverride ?? pickRandom(MOCK_LEAD_SOURCES);
  const customer_name = pickRandom(MOCK_CUSTOMER_NAMES);
  const vehicle_interest = pickRandom(MOCK_VEHICLE_INTERESTS);
  const customer_email = mockEmailFor(customer_name);

  const { data, error } = await supabase
    .from("leads")
    .insert({
      dealership_id: profile.dealership_id,
      source,
      customer_name,
      customer_email,
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
    else if (t === "email_sent") summary.byCategory.emails += 1;
    else if (t === "station_photo") summary.byCategory.media += 1;
  }
  return summary;
}

export type LeaderboardRow = {
  profile_id: string;
  full_name: string;
  xp_today: number;
  xp_total: number;
  appointments_today: number;
  sales_today: number;
};

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  await getAuthedUserId();
  // Single round trip via SQL function: today's XP, lifetime XP,
  // appointments and sales per teammate, ordered by today's XP.
  const { data, error } = await supabase.rpc("get_leaderboard");
  if (error) throw new Error(`getLeaderboard: ${error.message}`);
  return (data ?? []) as LeaderboardRow[];
}

export type LeadOutcome = "appointment_set" | "sold";

export type MarkOutcomeResult =
  | {
      ok: true;
      leadId: string;
      newStatus: string;
      eventType: EventType;
      xpEarned: number;
      newTotalXP: number;
    }
  | {
      ok: false;
      reason:
        | "not_your_lead"
        | "invalid_transition"
        | "outcome_already_awarded"
        | "lead_not_found"
        | "unknown";
      message?: string;
    };

export async function markLeadOutcome(args: {
  leadId: string;
  outcome: LeadOutcome;
}): Promise<MarkOutcomeResult> {
  const supabase = await createClient();
  await getAuthedUserId();

  // SECURITY DEFINER function validates ownership + transition and writes
  // status + XP in one transaction (no double-award possible).
  const { data, error } = await supabase
    .rpc("mark_lead_outcome", {
      p_lead_id: args.leadId,
      p_outcome: args.outcome,
    })
    .single();

  if (error) {
    const known = [
      "not_your_lead",
      "invalid_transition",
      "outcome_already_awarded",
      "lead_not_found",
    ] as const;
    const reason = known.find((k) => error.message.includes(k));
    return reason
      ? { ok: false, reason }
      : { ok: false, reason: "unknown", message: error.message };
  }

  type OutcomeRow = {
    lead_id: string;
    new_status: string;
    event_type: EventType;
    xp_earned: number;
    new_total_xp: number;
  };
  const row = data as OutcomeRow;

  return {
    ok: true,
    leadId: row.lead_id,
    newStatus: row.new_status,
    eventType: row.event_type,
    xpEarned: row.xp_earned,
    newTotalXP: row.new_total_xp,
  };
}

export async function getMyActiveLeads(): Promise<LeadRow[]> {
  const supabase = await createClient();
  const userId = await getAuthedUserId();
  // The My Leads panel: everything the rep currently owns and can still
  // move through the funnel (claim → contact → cita → venta). 'stealable'
  // included on purpose — those are the ones to save FIRST.
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("claimed_by", userId)
    .in("status", ["claimed", "contacted", "stealable", "appointment_set"])
    .order("claimed_at", { ascending: false });
  if (error) throw new Error(`getMyActiveLeads: ${error.message}`);
  return (data ?? []) as LeadRow[];
}

export async function getMyClaimedLeads(): Promise<LeadRow[]> {
  const supabase = await createClient();
  const userId = await getAuthedUserId();
  // The Email Composer needs the player's own leads that are still in the
  // top of the funnel — claimed (just grabbed) or contacted (already
  // emailed once). Anything sold/dead/etc. is hidden so the dropdown stays
  // short and on-task.
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("claimed_by", userId)
    .in("status", ["claimed", "contacted"])
    .order("claimed_at", { ascending: false });
  if (error) throw new Error(`getMyClaimedLeads: ${error.message}`);
  return (data ?? []) as LeadRow[];
}

export type SendEmailResult =
  | {
      ok: true;
      communicationId: string;
      externalId: string;
      newTotalXP: number;
      recipient: string;
    }
  | {
      ok: false;
      reason:
        | "not_claimed_by_user"
        | "lead_not_found"
        | "user_has_no_dealership"
        | "send_failed";
      message?: string;
    };

export async function sendLeadEmail(args: {
  leadId: string;
  template: import("@/lib/server/email-templates").EmailTemplateName;
}): Promise<SendEmailResult> {
  // Imports kept inline so the file does not pull the Resend SDK into the
  // bundle for every action.
  const { renderTemplate } = await import("@/lib/server/email-templates");
  const { sendEmail } = await import("@/lib/server/email");

  const supabase = await createClient();
  const userId = await getAuthedUserId();

  // Pull the lead + the user's profile + dealership name in three calls.
  // We do them sequentially because each enforces a different invariant.
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", args.leadId)
    .single();
  if (leadErr || !lead) {
    return { ok: false, reason: "lead_not_found", message: leadErr?.message };
  }
  if (lead.claimed_by !== userId) {
    return { ok: false, reason: "not_claimed_by_user" };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("full_name, dealership_id")
    .eq("id", userId)
    .single();
  if (profileErr || !profile?.dealership_id) {
    return { ok: false, reason: "user_has_no_dealership", message: profileErr?.message };
  }

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("name")
    .eq("id", profile.dealership_id)
    .single();

  const rendered = renderTemplate(args.template, {
    customerName: lead.customer_name ?? "there",
    vehicleInterest: lead.vehicle_interest ?? "your vehicle",
    dealershipName: dealership?.name ?? "the dealership",
    salespersonName: profile.full_name ?? "Your sales contact",
  });

  // Prototype routing: every outbound email goes to EMAIL_TEST_RECIPIENT so
  // we never spam real @example.com inboxes during dev. The customer_email
  // is still recorded on the comm row so the path to production routing is
  // a single config flip.
  const recipientForSend = process.env.EMAIL_TEST_RECIPIENT;
  if (!recipientForSend) {
    return {
      ok: false,
      reason: "send_failed",
      message: "EMAIL_TEST_RECIPIENT is not set",
    };
  }

  let externalId: string;
  try {
    const result = await sendEmail({
      to: recipientForSend,
      subject: rendered.subject,
      html: rendered.html,
    });
    externalId = result.id;
  } catch (err) {
    return {
      ok: false,
      reason: "send_failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // Log the communication, the XP event, and bump the lead status. Three
  // INSERT/UPDATEs that are not in one transaction — acceptable here because
  // they are all best-effort writes after the email already shipped; if
  // any of them fail the user will see the toast but the inbox proof is
  // already on its way.
  const { data: commRow, error: commErr } = await supabase
    .from("lead_communications")
    .insert({
      lead_id: lead.id,
      profile_id: userId,
      type: "email",
      template_used: args.template,
      subject: rendered.subject,
      content: rendered.html,
      recipient: lead.customer_email ?? recipientForSend,
      external_id: externalId,
      metadata: { actual_recipient: recipientForSend },
    })
    .select("id")
    .single();
  if (commErr || !commRow) {
    return {
      ok: false,
      reason: "send_failed",
      message: `comm log failed: ${commErr?.message ?? "no row"}`,
    };
  }

  const { error: xpErr } = await supabase.from("xp_events").insert({
    profile_id: userId,
    event_type: "email_sent",
    xp_amount: XP_PER_EVENT.email_sent,
    lead_id: lead.id,
  });
  if (xpErr) {
    return { ok: false, reason: "send_failed", message: `xp log failed: ${xpErr.message}` };
  }

  // A first email graduates the lead from claimed → contacted. It also
  // SAVES a stealable lead: communicating is the proof of work that takes
  // it off the steal board before a teammate grabs it.
  if (lead.status === "claimed" || lead.status === "stealable") {
    await supabase.from("leads").update({ status: "contacted" }).eq("id", lead.id);
  }

  const newTotalXP = await getCurrentXP();

  return {
    ok: true,
    communicationId: commRow.id,
    externalId,
    newTotalXP,
    recipient: recipientForSend,
  };
}
