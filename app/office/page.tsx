"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import OfficeHud from "@/components/OfficeHud";

// Sandbox preview of the new illustrated-office art direction. Public (no
// login) so it's trivial to open and show. The production game lives at
// /play and is untouched.

const OfficeCanvas = dynamic(() => import("@/components/OfficeCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a]">
      <p className="animate-pulse font-mono text-sm text-white/40">
        Cargando la oficina…
      </p>
    </div>
  ),
});

export default function OfficePage() {
  return (
    <main className="relative flex flex-1 bg-black text-white">
      <OfficeCanvas />
      <OfficeHud />
      <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/15 bg-black/60 px-3 py-2 font-mono text-xs text-white/70 backdrop-blur">
        <p className="text-amber-300">🏁 Office sandbox</p>
        <p className="mt-1 text-white/50">Muévete con flechas o WASD</p>
        <p className="text-white/40">(personaje provisional)</p>
      </div>
      <Link
        href="/play"
        className="absolute right-4 top-4 z-20 rounded-lg border border-white/20 bg-black/70 px-3 py-2 font-mono text-xs text-white/70 backdrop-blur transition hover:bg-black/90"
      >
        ← Versión vieja (pixel)
      </Link>
    </main>
  );
}
