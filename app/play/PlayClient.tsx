"use client";

import dynamic from "next/dynamic";

const GameCanvas = dynamic(() => import("@/components/GameCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-[#1a1a1a]">
      <p className="animate-pulse font-mono text-sm text-white/40">
        Cargando la oficina…
      </p>
    </div>
  ),
});

export default function PlayClient() {
  return <GameCanvas />;
}
