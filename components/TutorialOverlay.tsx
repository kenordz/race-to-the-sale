"use client";

// First-visit tutorial: 30 seconds from "what is this" to playing. Shown
// once per browser (localStorage flag); reps can reopen it with the ?
// button if we add one later. Kept to ONE screen on purpose — if a game
// needs a manual, the game is wrong.

import { useEffect, useState } from "react";

const STORAGE_KEY = "rts_tutorial_seen_v1";

export default function TutorialOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Deferred a frame: localStorage is client-only and the lint rule
    // (correctly) dislikes synchronous setState inside effects.
    const id = requestAnimationFrame(() => {
      try {
        if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
      } catch {
        // storage blocked — skip the tutorial rather than break the game
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-zinc-950 p-6 text-white shadow-2xl">
        <p className="text-xs uppercase tracking-widest text-white/40">
          Bienvenido al floor
        </p>
        <h2 className="mt-1 text-2xl font-bold">🏁 Race to the Sale</h2>
        <p className="mt-2 text-sm text-white/60">
          Tus leads reales, convertidos en juego. Velocidad de respuesta gana
          ventas — y XP.
        </p>

        <ul className="mt-5 flex flex-col gap-3 text-sm">
          <li className="flex items-center gap-3">
            <span className="rounded border border-white/20 bg-white/5 px-2 py-1 font-mono text-xs">
              ← ↑ ↓ →
            </span>
            <span>Muévete por la oficina</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="rounded border border-white/20 bg-white/5 px-2 py-1 font-mono text-xs">
              SPACE
            </span>
            <span>
              Interactúa: claimea leads en el 📋 Lead Board, manda emails en el
              💻 Computer Desk
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="rounded border border-white/20 bg-white/5 px-2 py-1 font-mono text-xs">
              M
            </span>
            <span>Tu cartera: marca 📅 citas y 🚗 ventas</span>
          </li>
        </ul>

        <div className="mt-5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2.5 text-xs text-orange-200/90">
          ⚠️ Regla de oro: si claimeas un lead y no lo trabajas en 20 minutos,
          queda abierto para que un compañero te lo ROBE. Aquí se corre.
        </div>

        <button
          onClick={dismiss}
          className="mt-5 w-full rounded-lg bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-white/90 active:scale-95"
        >
          ¡A vender! 🏃💨
        </button>
      </div>
    </div>
  );
}
