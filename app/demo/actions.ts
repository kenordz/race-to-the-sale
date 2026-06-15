"use server";

// Demo control panel actions. These exist so Sergio can DIRECT a demo from
// his phone while the prospect watches the game screen: drop a lead on cue,
// force the steal window open, wipe the slate between back-to-back demos.
//
// Access: manager/admin only. The destructive/cheaty ones are double-gated —
// here AND inside the SECURITY DEFINER functions (reset_demo_day,
// release_stale_claims with a short window both check the caller's role).

import { createClient } from "@/lib/supabase/server";
import { generateMockLead, type LeadRow } from "@/app/play/actions";
import { MOCK_LEAD_SOURCES } from "@/lib/game/mock-data";

export type DemoSource = (typeof MOCK_LEAD_SOURCES)[number];

async function assertManager(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (error) throw new Error(`assertManager: ${error.message}`);
  if (profile.role !== "manager" && profile.role !== "admin") {
    throw new Error("Demo controls are manager-only");
  }
}

export type DemoActionResult =
  | { ok: true; detail: string }
  | { ok: false; error: string };

export async function injectDemoLead(
  source?: DemoSource
): Promise<DemoActionResult> {
  try {
    await assertManager();
    const lead: LeadRow = await generateMockLead(source);
    return {
      ok: true,
      detail: `Lead inyectado: ${lead.customer_name} (${lead.source}) — ${lead.vehicle_interest}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function forceStealCheck(): Promise<DemoActionResult> {
  try {
    await assertManager();
    const supabase = await createClient();
    // Window of 0: every claimed lead with no communication flips to
    // stealable RIGHT NOW. This is the "watch what happens when a rep sits
    // on a lead" demo beat without waiting 20 real minutes.
    const { data, error } = await supabase.rpc("release_stale_claims", {
      p_window: "0 seconds",
    });
    if (error) throw new Error(error.message);
    const count = (data as number) ?? 0;
    return {
      ok: true,
      detail:
        count === 0
          ? "No hay claims sin trabajar — nada que abrir"
          : `${count} lead(s) abiertos para robo 😈`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function seedDemoDay(): Promise<DemoActionResult> {
  try {
    await assertManager();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("seed_demo_day");
    if (error) throw new Error(error.message);
    return {
      ok: true,
      detail: `${(data as number) ?? 0} leads sembrados: floor con vida (nuevos, urgentes, claims, citas, venta)`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resetDemoDay(): Promise<DemoActionResult> {
  try {
    await assertManager();
    const supabase = await createClient();
    const { error } = await supabase.rpc("reset_demo_day");
    if (error) throw new Error(error.message);
    return { ok: true, detail: "Demo reseteado: leads, XP y comunicaciones en cero" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
