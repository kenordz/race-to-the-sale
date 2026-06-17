"use client";

import { useState } from "react";

// Club-Penguin / Among-Us style action bar for the /office sandbox.
// The game floor is the social/presence layer; the WORK happens here in
// always-on buttons you click with the mouse — no walking to stations.
//
// Sandbox note: panels render representative (mock) content so the flow can
// be felt and shown. Wiring to real leads / SMS / email is the next step
// (email already works in the production /play game via Resend).

type Panel = "calls" | "chats" | "emails" | "leads" | "settings";

const BUTTONS: { key: Panel; icon: string; label: string; accent: string }[] = [
  { key: "leads", icon: "📋", label: "Leads", accent: "#38bdf8" },
  { key: "calls", icon: "📞", label: "Llamadas", accent: "#10b981" },
  { key: "chats", icon: "💬", label: "Chats", accent: "#a78bfa" },
  { key: "emails", icon: "✉️", label: "Correos", accent: "#f59e0b" },
  { key: "settings", icon: "⚙️", label: "Ajustes", accent: "#9ca3af" },
];

export default function OfficeHud() {
  const [open, setOpen] = useState<Panel | null>(null);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {open && (
        <div className="pointer-events-auto absolute bottom-28 left-1/2 w-[440px] max-w-[92vw] -translate-x-1/2">
          <PanelCard panel={open} onClose={() => setOpen(null)} />
        </div>
      )}

      <div className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-end gap-2 rounded-2xl border border-white/15 bg-zinc-900/90 px-3 py-2.5 shadow-2xl backdrop-blur-md">
        {BUTTONS.map((b) => {
          const active = open === b.key;
          return (
            <button
              key={b.key}
              onClick={() => setOpen(active ? null : b.key)}
              className="flex w-16 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition active:scale-95"
              style={{
                background: active ? `${b.accent}26` : "transparent",
              }}
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full border text-xl"
                style={{
                  borderColor: active ? b.accent : "rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                {b.icon}
              </span>
              <span
                className="font-mono text-[10px]"
                style={{ color: active ? b.accent : "rgba(255,255,255,0.6)" }}
              >
                {b.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PanelCard({ panel, onClose }: { panel: Panel; onClose: () => void }) {
  const meta: Record<Panel, { icon: string; title: string }> = {
    leads: { icon: "📋", title: "Mis leads" },
    calls: { icon: "📞", title: "Llamadas" },
    chats: { icon: "💬", title: "Chats" },
    emails: { icon: "✉️", title: "Correos" },
    settings: { icon: "⚙️", title: "Ajustes" },
  };
  const m = meta[panel];

  return (
    <div className="animate-fade-in-up rounded-2xl border border-white/15 bg-zinc-900/95 p-4 text-white shadow-2xl backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-lg">{m.icon}</span> {m.title}
        </p>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      {panel === "leads" && <LeadsPanel />}
      {panel === "calls" && <CallsPanel />}
      {panel === "chats" && <ChatsPanel />}
      {panel === "emails" && <EmailsPanel />}
      {panel === "settings" && <SettingsPanel />}
      <p className="mt-3 border-t border-white/10 pt-2 text-center text-[10px] text-white/30">
        Vista de muestra · se conecta a datos reales en el siguiente paso
      </p>
    </div>
  );
}

const MOCK_LEADS = [
  { name: "Ana López", car: "RAV4 2024", src: "CarGurus", status: "🔥 nuevo" },
  { name: "Luis Pérez", car: "Civic 2023", src: "Website", status: "claimed" },
  { name: "Marta Ríos", car: "F-150 2024", src: "Phone up", status: "⚠️ en riesgo" },
];

function LeadsPanel() {
  return (
    <ul className="flex flex-col gap-1.5">
      {MOCK_LEADS.map((l) => (
        <li
          key={l.name}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{l.name}</p>
            <p className="text-[11px] text-white/40">
              {l.car} · {l.src}
            </p>
          </div>
          <span className="font-mono text-[11px] text-amber-300">{l.status}</span>
        </li>
      ))}
    </ul>
  );
}

function CallsPanel() {
  return (
    <div className="flex flex-col gap-2">
      {MOCK_LEADS.slice(0, 2).map((l) => (
        <div
          key={l.name}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
        >
          <span>
            {l.name}
            <span className="ml-2 text-[11px] text-white/40">{l.car}</span>
          </span>
          <button className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 transition active:scale-95">
            📞 Llamar
          </button>
        </div>
      ))}
      <p className="text-center text-[11px] text-white/40">
        Click-to-call entra con Twilio Voice
      </p>
    </div>
  );
}

function ChatsPanel() {
  const [thread, setThread] = useState<{ mine: boolean; text: string }[]>([
    { mine: false, text: "Hola, ¿sigue disponible la RAV4?" },
  ]);
  const replies = [
    "¡Hola Ana! Sí, sigue disponible 🙌",
    "¿Te late pasar hoy a verla?",
    "Te mando fotos ahorita 📷",
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
        {thread.map((t, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
              t.mine
                ? "self-end bg-blue-500 text-white"
                : "self-start bg-white/10 text-white/85"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {replies.map((r) => (
          <button
            key={r}
            onClick={() => setThread((t) => [...t, { mine: true, text: r }])}
            className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] transition hover:bg-white/10 active:scale-95"
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmailsPanel() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <p className="text-[11px] text-white/40">Para: Ana López</p>
        <p className="mt-1 text-white/80">
          ¡Gracias por tu interés en la RAV4 2024! Soy tu asesor en Price…
        </p>
      </div>
      <button className="self-start rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 transition active:scale-95">
        ✉️ Enviar (+50 XP)
      </button>
      <p className="text-center text-[11px] text-white/40">
        El envío real ya funciona en el juego de producción
      </p>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        Sonido <input type="checkbox" defaultChecked />
      </label>
      <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        Música <input type="checkbox" />
      </label>
      <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        Mostrar nombres del equipo <input type="checkbox" defaultChecked />
      </label>
    </div>
  );
}
