// Inbound ADF/XML lead webhook — REAL leads into the game.
//
// Setup: an inbound-email service (CloudMailin, Mailgun Routes, SES) gets
// added as an extra recipient in the dealership's lead routing. That
// service POSTs the email here; we find the ADF document, parse it, and
// insert the lead. Supabase Realtime does the rest — the lead appears on
// every rep's screen with the alarm, exactly like a mock lead.
//
// Provider-agnostic on purpose: we accept raw XML, or any JSON payload and
// search its string fields for the <adf> document. No per-provider SDKs.
//
// Auth: shared secret (header `x-adf-secret` or `?secret=`), plus the
// target dealership id in `?dealership=`. Uses the service-role key because
// webhooks have no user session (RLS would block the insert).
//
// Required env:
//   ADF_INBOUND_SECRET   — long random string, also configured in the
//                          inbound-email service's webhook URL
//   SUPABASE_SECRET_KEY  — service-role key (Dashboard → Settings → API)

import { createClient } from "@supabase/supabase-js";
import { extractAdfXml, parseAdf } from "@/lib/server/adf";

export const dynamic = "force-dynamic";

function findAdfInJson(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === "string") return extractAdfXml(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAdfInJson(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) {
      const found = findAdfInJson(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────
  const secret = process.env.ADF_INBOUND_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "ADF_INBOUND_SECRET not configured" },
      { status: 503 }
    );
  }
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-adf-secret") ?? url.searchParams.get("secret");
  if (provided !== secret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dealershipId = url.searchParams.get("dealership");
  if (!dealershipId) {
    return Response.json(
      { ok: false, error: "missing ?dealership=<uuid>" },
      { status: 400 }
    );
  }

  // ── Locate the ADF document ─────────────────────────────────────────
  const rawBody = await request.text();
  let adfXml = extractAdfXml(rawBody);
  if (!adfXml) {
    try {
      adfXml = findAdfInJson(JSON.parse(rawBody));
    } catch {
      // not JSON — fall through
    }
  }
  if (!adfXml) {
    return Response.json(
      { ok: false, error: "no <adf> document found in payload" },
      { status: 422 }
    );
  }

  const parsed = parseAdf(adfXml);
  if (!parsed) {
    return Response.json(
      { ok: false, error: "ADF document could not be parsed" },
      { status: 422 }
    );
  }

  // ── Insert with service role (webhooks have no user session) ────────
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return Response.json(
      { ok: false, error: "SUPABASE_SECRET_KEY not configured" },
      { status: 503 }
    );
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validate the dealership exists before inserting (typo in the webhook
  // URL should 404, not create orphan rows).
  const { data: dealership, error: dealershipErr } = await admin
    .from("dealerships")
    .select("id")
    .eq("id", dealershipId)
    .single();
  if (dealershipErr || !dealership) {
    return Response.json(
      { ok: false, error: "unknown dealership" },
      { status: 404 }
    );
  }

  const { data: lead, error: insertErr } = await admin
    .from("leads")
    .insert({
      dealership_id: dealershipId,
      source: parsed.source,
      customer_name: parsed.customerName,
      customer_email: parsed.customerEmail,
      vehicle_interest: parsed.vehicleInterest,
      metadata: {
        adf: true,
        provider: parsed.providerName,
        customer_phone: parsed.customerPhone,
        comments: parsed.comments,
        raw_adf: adfXml.slice(0, 10_000),
      },
    })
    .select("id, source, customer_name")
    .single();

  if (insertErr) {
    console.error("[adf] insert failed:", insertErr.message);
    return Response.json(
      { ok: false, error: "insert failed" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, lead });
}
