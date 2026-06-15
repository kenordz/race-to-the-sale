"use client";

// Live, read-only team view. Polls every 30s — managers leave this open on
// a second monitor. Three blocks:
//   1. Untouched leads (the fire: response speed wins deals)
//   2. Team table (activity + outcomes + avg response time per rep)
//   3. Funnel snapshot
//
// "Hoy" = últimas 24h (same definition as the game HUD; per-dealership
// timezone cutoff is a roadmap item).

import { useEffect, useState } from "react";
import {
  getLeadFunnel,
  getTeamStats,
  type FunnelRow,
  type TeamStatsRow,
} from "./actions";
import { getPendingLeads, type LeadRow } from "@/app/play/actions";
import { formatSourceLabel } from "@/lib/game/mock-data";

const POLL_MS = 30_000;
const DAILY_TARGET = 90;

const FUNNEL_ORDER = [
  "new",
  "claimed",
  "stealable",
  "contacted",
  "appointment_set",
  "sold",
  "dead",
] as const;

const FUNNEL_LABELS: Record<string, string> = {
  new: "Nuevos",
  claimed: "Claimed",
  stealable: "😈 Robables",
  contacted: "Contactados",
  appointment_set: "📅 Citas",
  sold: "🚗 Vendidos",
  dead: "Muertos",
  orphan: "Huérfanos",
};

function fmtResponse(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function minutesWaiting(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

export default function ManagerDashboard() {
  const [team, setTeam] = useState<TeamStatsRow[] | null>(null);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [untouched, setUntouched] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [teamRows, funnelRows, pendingRows] = await Promise.all([
          getTeamStats(),
          getLeadFunnel(),
          getPendingLeads(),
        ]);
        if (cancelled) return;
        setTeam(teamRows);
        setFunnel(funnelRows);
        setUntouched(pendingRows);
        setUpdatedAt(new Date());
        setError(null);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <p className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {error}
      </p>
    );
  }
  if (team === null) {
    return <p className="py-16 text-center text-white/40">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Untouched leads: the fire ─────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">
          🚨 Leads sin tocar ({untouched.length})
        </h2>
        {untouched.length === 0 ? (
          <p className="rounded border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300/80">
            Cero leads esperando — el floor está al día. ✅
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {untouched.map((lead) => {
              const mins = minutesWaiting(lead.created_at);
              const breach = mins >= 5; // playbook: first response < 5 min
              return (
                <li
                  key={lead.id}
                  className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
                    breach
                      ? "border-red-500/40 bg-red-500/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <span>
                    {lead.customer_name ?? "Sin nombre"}
                    <span className="ml-2 text-xs text-white/40">
                      {formatSourceLabel(lead.source)} ·{" "}
                      {lead.vehicle_interest ?? ""}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-xs ${
                      breach ? "font-bold text-red-300" : "text-white/50"
                    }`}
                  >
                    {mins} min {breach ? "⚠️" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Team table ────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">
          Equipo · hoy
        </h2>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/40">
              <tr>
                <th className="px-3 py-2.5">Vendedor</th>
                <th className="px-3 py-2.5 text-right">Actividades</th>
                <th className="px-3 py-2.5 text-right">Leads</th>
                <th className="px-3 py-2.5 text-right">Emails</th>
                <th className="px-3 py-2.5 text-right">📅 Citas</th>
                <th className="px-3 py-2.5 text-right">🚗 Ventas</th>
                <th className="px-3 py-2.5 text-right">😈 Robos</th>
                <th className="px-3 py-2.5 text-right">💀 Perdidos</th>
                <th className="px-3 py-2.5 text-right">Avg respuesta</th>
                <th className="px-3 py-2.5 text-right">XP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {team.map((row) => {
                const slow =
                  row.avg_response_seconds !== null &&
                  row.avg_response_seconds > 300;
                return (
                  <tr key={row.profile_id}>
                    <td className="px-3 py-2.5 font-medium">{row.full_name}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <span
                        className={
                          row.activities_today >= DAILY_TARGET
                            ? "text-emerald-300"
                            : row.activities_today >= DAILY_TARGET / 2
                              ? "text-yellow-300"
                              : "text-red-300"
                        }
                      >
                        {row.activities_today}
                      </span>
                      <span className="text-white/30">/{DAILY_TARGET}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.leads_claimed_today}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.emails_today}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.appointments_today}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.sales_today}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.steals_today}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <span
                        className={
                          row.leads_lost_today > 0 ? "text-red-300" : ""
                        }
                      >
                        {row.leads_lost_today}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <span className={slow ? "text-red-300" : ""}>
                        {fmtResponse(row.avg_response_seconds)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-white/70">
                      {row.xp_today}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Funnel snapshot ───────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">
          Funnel actual
        </h2>
        <div className="flex flex-wrap gap-2">
          {FUNNEL_ORDER.map((status) => {
            const row = funnel.find((f) => f.status === status);
            const count = row?.count ?? 0;
            return (
              <div
                key={status}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center"
              >
                <p className="font-mono text-xl">{count}</p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  {FUNNEL_LABELS[status] ?? status}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {updatedAt && (
        <p className="text-right text-[11px] text-white/25">
          Actualizado {updatedAt.toLocaleTimeString()} · refresca cada 30s
        </p>
      )}
    </div>
  );
}
