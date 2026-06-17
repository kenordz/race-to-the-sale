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
  stealable: "⚠️ Robables",
  contacted: "Contactados",
  appointment_set: "📅 Citas",
  sold: "🚗 Vendidos",
  dead: "Muertos",
  orphan: "Huérfanos",
};

const FUNNEL_COLORS: Record<string, string> = {
  new: "#38bdf8",
  claimed: "#6366f1",
  stealable: "#fb7314",
  contacted: "#10b981",
  appointment_set: "#a78bfa",
  sold: "#facc15",
  dead: "#52525b",
  orphan: "#52525b",
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

  // ── Aggregate KPIs for the hero row (what the dealer reads first) ──────
  const breaches = untouched.filter((l) => minutesWaiting(l.created_at) >= 5)
    .length;
  const totalAppointments = team.reduce((a, r) => a + r.appointments_today, 0);
  const totalSales = team.reduce((a, r) => a + r.sales_today, 0);
  const respValues = team
    .map((r) => r.avg_response_seconds)
    .filter((s): s is number => s !== null);
  const avgResponse =
    respValues.length > 0
      ? Math.round(respValues.reduce((a, b) => a + b, 0) / respValues.length)
      : null;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Hero KPIs: the dealer's first read ────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Leads sin tocar"
          value={String(untouched.length)}
          accent={breaches > 0 ? "#ef4444" : "#10b981"}
          sub={breaches > 0 ? `${breaches} pasaron 5 min ⚠️` : "todo al día ✅"}
          delay={0}
        />
        <KpiCard
          label="Resp. promedio"
          value={avgResponse === null ? "—" : fmtResponse(avgResponse)}
          accent={avgResponse !== null && avgResponse > 300 ? "#ef4444" : "#facc15"}
          sub="meta < 5 min"
          delay={60}
        />
        <KpiCard
          label="Citas hoy"
          value={String(totalAppointments)}
          accent="#a78bfa"
          sub="📅 del equipo"
          delay={120}
        />
        <KpiCard
          label="Ventas hoy"
          value={String(totalSales)}
          accent="#facc15"
          sub="🚗 del equipo"
          delay={180}
        />
      </section>

      {/* ── Untouched leads: the fire ─────────────────────────────────── */}
      <section className="animate-fade-in-up">
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
                      ? "animate-urgent-pulse border-red-500/40 bg-red-500/10"
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
      <section className="animate-fade-in-up">
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
                <th className="px-3 py-2.5 text-right">⚠️ Robos</th>
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
      <section className="animate-fade-in-up">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">
          Funnel actual
        </h2>
        <div className="flex flex-col gap-1.5">
          {(() => {
            const counts = FUNNEL_ORDER.map(
              (status) => funnel.find((f) => f.status === status)?.count ?? 0
            );
            const max = Math.max(1, ...counts);
            return FUNNEL_ORDER.map((status, i) => {
              const count = counts[i];
              const pct = Math.round((count / max) * 100);
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-right text-xs text-white/55">
                    {FUNNEL_LABELS[status] ?? status}
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-white/[0.04]">
                    <div
                      className="h-full rounded transition-all duration-700"
                      style={{
                        width: `${Math.max(pct, count > 0 ? 4 : 0)}%`,
                        backgroundColor: FUNNEL_COLORS[status] ?? "#52525b",
                      }}
                    />
                    <span className="absolute inset-y-0 left-2 flex items-center font-mono text-xs font-semibold text-white">
                      {count}
                    </span>
                  </div>
                </div>
              );
            });
          })()}
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

function KpiCard({
  label,
  value,
  accent,
  sub,
  delay,
}: {
  label: string;
  value: string;
  accent: string;
  sub: string;
  delay: number;
}) {
  return (
    <div
      className="animate-kpi card-glass relative overflow-hidden rounded-xl px-4 py-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ backgroundColor: accent }}
      />
      <p className="text-[11px] uppercase tracking-wide text-white/40">
        {label}
      </p>
      <p
        className="mt-1 font-mono text-3xl font-bold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-white/45">{sub}</p>
    </div>
  );
}
