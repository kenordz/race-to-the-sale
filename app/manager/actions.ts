"use server";

// Manager dashboard data. Both RPCs are SECURITY DEFINER and re-check the
// caller's role server-side, so these wrappers stay thin.

import { createClient } from "@/lib/supabase/server";

export type TeamStatsRow = {
  profile_id: string;
  full_name: string;
  xp_today: number;
  activities_today: number;
  leads_claimed_today: number;
  emails_today: number;
  appointments_today: number;
  sales_today: number;
  steals_today: number;
  leads_lost_today: number;
  avg_response_seconds: number | null;
};

export type FunnelRow = { status: string; count: number };

export async function getTeamStats(): Promise<TeamStatsRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_team_stats");
  if (error) throw new Error(`getTeamStats: ${error.message}`);
  return (data ?? []) as TeamStatsRow[];
}

export async function getLeadFunnel(): Promise<FunnelRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_lead_funnel");
  if (error) throw new Error(`getLeadFunnel: ${error.message}`);
  return (data ?? []) as FunnelRow[];
}
