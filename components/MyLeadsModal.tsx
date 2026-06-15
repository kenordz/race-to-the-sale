"use client";

// My Leads panel (M key): the rep's book of business. Shows every lead they
// own that can still move through the funnel, with the two outcome actions
// that complete the daily loop: 📅 Cita agendada and 🚗 Vendido.
//
// Outcomes are validated + awarded server-side by mark_lead_outcome (one
// transaction, no double XP). The panel just renders results.

import { useEffect, useState } from "react";
import {
  getMyActiveLeads,
  markLeadOutcome,
  type LeadOutcome,
  type LeadRow,
} from "@/app/play/actions";
import { gameStore } from "@/lib/game/store";
import { formatSourceLabel } from "@/lib/game/mock-data";

type Props = {
  open: boolean;
  onClose: () => void;
};

const STATUS_CHIPS: Record<string, { label: string; cls: string }> = {
  claimed: { label: "CLAIMED", cls: "bg-blue-500/20 text-blue-300" },
  contacted: { label: "CONTACTED", cls: "bg-emerald-500/20 text-emerald-300" },
  stealable: { label: "⚠️ EN RIESGO", cls: "bg-orange-500/20 text-orange-300" },
  appointment_set: { label: "📅 CITA", cls: "bg-violet-500/20 text-violet-300" },
};

function timeSince(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
}

export default function MyLeadsModal({ open, onClose }: Props) {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await getMyActiveLeads();
        if (!cancelled) setLeads(rows);
      } catch (err) {
        if (!cancelled)
          setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const handleOutcome = async (lead: LeadRow, outcome: LeadOutcome) => {
    setBusyLeadId(lead.id);
    setErrorMsg(null);
    try {
      const result = await markLeadOutcome({ leadId: lead.id, outcome });
      if (!result.ok) {
        setErrorMsg(`No se pudo: ${result.reason}`);
        return;
      }
      const store = gameStore.getState();
      store.setXp(result.newTotalXP);
      store.bumpDaily(1);
      store.removeStealableLead(lead.id); // saving an at-risk lead clears it
      store.pushToast(
        outcome === "sold"
          ? {
              message: `🚗💨 SOLD! ${lead.customer_name ?? ""}  +${result.xpEarned} XP`,
              accent: "#facc15",
              durationMs: 3500,
            }
          : {
              message: `📅 Cita agendada con ${lead.customer_name ?? "cliente"}  +${result.xpEarned} XP`,
              accent: "#a78bfa",
              durationMs: 2500,
            }
      );
      // Refresh the list in place: sold leads drop off, appointments re-chip.
      const rows = await getMyActiveLeads();
      setLeads(rows);
    } finally {
      setBusyLeadId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busyLeadId) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-zinc-950 p-6 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              Mi cartera
            </p>
            <h2 className="text-xl font-bold">📋 My Leads</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            ESC
          </button>
        </div>

        {errorMsg && (
          <p className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {errorMsg}
          </p>
        )}

        {leads === null ? (
          <p className="py-10 text-center text-white/50">Cargando tus leads…</p>
        ) : leads.length === 0 ? (
          <p className="py-10 text-center text-white/50">
            No tienes leads activos — corre al Lead Board 🏃
          </p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-y-auto pr-1">
            {leads.map((lead) => {
              const chip = STATUS_CHIPS[lead.status] ?? {
                label: lead.status.toUpperCase(),
                cls: "bg-white/10 text-white/60",
              };
              const busy = busyLeadId === lead.id;
              const canAppoint = ["claimed", "contacted", "stealable"].includes(
                lead.status
              );
              return (
                <li
                  key={lead.id}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {lead.customer_name ?? "Sin nombre"}
                      <span className="ml-2 text-xs text-white/40">
                        {lead.vehicle_interest ?? ""}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-white/40">
                      <span>{formatSourceLabel(lead.source)}</span>
                      <span>· hace {timeSince(lead.claimed_at)}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono ${chip.cls}`}
                      >
                        {chip.label}
                      </span>
                    </p>
                  </div>
                  {canAppoint && (
                    <button
                      disabled={busy}
                      onClick={() => void handleOutcome(lead, "appointment_set")}
                      className="rounded border border-violet-400/40 bg-violet-500/15 px-2.5 py-1.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/25 active:scale-95 disabled:opacity-40"
                    >
                      📅 Cita
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => void handleOutcome(lead, "sold")}
                    className="rounded border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/25 active:scale-95 disabled:opacity-40"
                  >
                    🚗 Vendido
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
