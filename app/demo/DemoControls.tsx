"use client";

import { useState } from "react";
import {
  forceStealCheck,
  injectDemoLead,
  resetDemoDay,
  type DemoActionResult,
  type DemoSource,
} from "./actions";

// Big-thumb mobile buttons: Sergio drives this mid-pitch, one-handed.

const SOURCES: { value: DemoSource; label: string }[] = [
  { value: "website", label: "🌐 Website" },
  { value: "third_party", label: "🚗 CarGurus" },
  { value: "phone_up", label: "📞 Phone Up" },
  { value: "walk_in", label: "🚶 Walk-in" },
  { value: "text", label: "💬 Text" },
  { value: "social", label: "📱 Social" },
];

export default function DemoControls() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);

  const run = async (fn: () => Promise<DemoActionResult>) => {
    setBusy(true);
    try {
      const result = await fn();
      setLog((prev) =>
        [
          result.ok
            ? { ok: true, text: result.detail }
            : { ok: false, text: result.error },
          ...prev,
        ].slice(0, 8)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Inject lead ─────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">
          Inyectar lead
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              disabled={busy}
              onClick={() => run(() => injectDemoLead(s.value))}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-4 text-sm font-medium transition active:scale-95 disabled:opacity-40"
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          disabled={busy}
          onClick={() => run(() => injectDemoLead())}
          className="mt-2 w-full rounded-lg bg-white px-3 py-4 text-sm font-semibold text-black transition active:scale-95 disabled:opacity-40"
        >
          🎲 Lead aleatorio
        </button>
      </section>

      {/* ── Steal ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">
          Steal mechanic
        </h2>
        <button
          disabled={busy}
          onClick={() => run(forceStealCheck)}
          className="w-full rounded-lg border border-orange-500/50 bg-orange-500/15 px-3 py-4 text-sm font-semibold text-orange-300 transition active:scale-95 disabled:opacity-40"
        >
          😈 Abrir leads sin trabajar para robo
        </button>
        <p className="mt-1.5 text-xs text-white/35">
          Salta la espera de 20 min: todo lead claimed sin comunicación queda
          robable al instante.
        </p>
      </section>

      {/* ── Reset ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">
          Reset
        </h2>
        {confirmReset ? (
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => {
                setConfirmReset(false);
                void run(resetDemoDay);
              }}
              className="flex-1 rounded-lg bg-red-600 px-3 py-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
            >
              Sí, borrar todo
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="flex-1 rounded-lg border border-white/15 px-3 py-4 text-sm transition active:scale-95"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            disabled={busy}
            onClick={() => setConfirmReset(true)}
            className="w-full rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-4 text-sm font-semibold text-red-300 transition active:scale-95 disabled:opacity-40"
          >
            🧹 Resetear demo (borra leads + XP del dealership)
          </button>
        )}
      </section>

      {/* ── Activity log ────────────────────────────────────────────── */}
      {log.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">
            Últimas acciones
          </h2>
          <ul className="flex flex-col gap-1.5">
            {log.map((entry, i) => (
              <li
                key={i}
                className={`rounded border px-3 py-2 font-mono text-xs ${
                  entry.ok
                    ? "border-white/10 bg-white/5 text-white/70"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                {entry.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
