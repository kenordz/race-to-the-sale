"use client";

// DOM HUD rendered as an absolute overlay on top of the Phaser canvas.
// Replaces the old UIScene: crisper text than canvas-rasterized fonts,
// faster to iterate (Tailwind vs Phaser text styles), and reusable in any
// future non-game view since it reads from the shared game store.
//
// Only *in-world* UI stays inside Phaser (station badges, the countdown
// list above the Lead Board, the PRESS SPACE prompt).

import { useEffect } from "react";
import { gameStore, useGameStore, type Toast } from "@/lib/game/store";
import { getLeaderboard } from "@/app/play/actions";

const LEADERBOARD_POLL_MS = 30_000;

export default function HudOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-4 top-4 flex flex-col gap-1.5">
        <XpCounter />
        <DailyCounter />
      </div>
      <LeaderboardPanel />
      <ToastStack />
    </div>
  );
}

function LeaderboardPanel() {
  const rows = useGameStore((s) => s.leaderboard);
  const myProfileId = useGameStore((s) => s.myProfileId);
  // Refetch whenever my own XP changes (claims/emails/outcomes) so my row
  // moves immediately; poll covers teammates' progress.
  const xp = useGameStore((s) => s.xp);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const data = await getLeaderboard();
        if (!cancelled) gameStore.getState().setLeaderboard(data);
      } catch (err) {
        console.error("[leaderboard] refresh failed:", err);
      }
    };
    void refresh();
    const id = setInterval(refresh, LEADERBOARD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [xp]);

  if (rows.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 w-60 rounded border border-white/30 bg-black/75 px-3 py-2 font-mono text-white">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">
        🏆 Leaderboard · hoy
      </p>
      <ol className="flex flex-col gap-1">
        {rows.slice(0, 5).map((row, i) => {
          const isMe = row.profile_id === myProfileId;
          return (
            <li
              key={row.profile_id}
              className={`flex items-center gap-2 text-xs ${
                isMe ? "text-amber-300" : "text-white/85"
              }`}
            >
              <span className="w-4 text-white/40">{i + 1}.</span>
              <span className="flex-1 truncate">
                {row.full_name}
                {isMe ? " (tú)" : ""}
              </span>
              {row.appointments_today > 0 && (
                <span title="Citas hoy">📅{row.appointments_today}</span>
              )}
              {row.sales_today > 0 && (
                <span title="Ventas hoy">🚗{row.sales_today}</span>
              )}
              <span className="tabular-nums">{row.xp_today}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-[10px] text-white/30">M = mis leads</p>
    </div>
  );
}

function XpCounter() {
  const xp = useGameStore((s) => s.xp);
  return (
    <div className="w-fit rounded border border-white/40 bg-black/75 px-2.5 py-1.5 font-mono text-base text-white">
      ✨ XP: {xp}
    </div>
  );
}

function DailyCounter() {
  const total = useGameStore((s) => s.dailyTotal);
  const target = useGameStore((s) => s.dailyTarget);

  // Same tier colors the old UIScene used: red → yellow → light green →
  // bright green at/above target.
  const color =
    total >= target
      ? "#10b981"
      : total >= 60
        ? "#86efac"
        : total >= 30
          ? "#eab308"
          : "#ef4444";

  return (
    <div
      className="w-fit rounded border border-white/40 bg-black/75 px-2.5 py-1 font-mono text-sm"
      style={{ color }}
    >
      Today: {total} / {target}
      {total >= target ? "  ✨" : ""}
    </div>
  );
}

function ToastStack() {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <div className="absolute left-1/2 top-6 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismissToast = useGameStore((s) => s.dismissToast);

  useEffect(() => {
    const id = setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => clearTimeout(id);
  }, [toast.id, toast.durationMs, dismissToast]);

  return (
    <div
      className="animate-toast-in rounded border-2 bg-[#111111]/95 px-4 py-2 font-mono text-[15px] text-white shadow-lg"
      style={{ borderColor: toast.accent }}
    >
      {toast.message}
    </div>
  );
}
