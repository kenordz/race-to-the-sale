"use client";

// DOM HUD rendered as an absolute overlay on top of the Phaser canvas.
// Replaces the old UIScene: crisper text than canvas-rasterized fonts,
// faster to iterate (Tailwind vs Phaser text styles), and reusable in any
// future non-game view since it reads from the shared game store.
//
// Only *in-world* UI stays inside Phaser (station badges, the countdown
// list above the Lead Board, the PRESS SPACE prompt).

import { useEffect } from "react";
import { useGameStore, type Toast } from "@/lib/game/store";

export default function HudOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-4 top-4 flex flex-col gap-1.5">
        <XpCounter />
        <DailyCounter />
      </div>
      <ToastStack />
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
