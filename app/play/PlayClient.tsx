"use client";

import dynamic from "next/dynamic";

const GameCanvas = dynamic(() => import("@/components/GameCanvas"), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] w-[800px] animate-pulse rounded-xl border border-white/10 bg-white/[0.02]" />
  ),
});

export default function PlayClient() {
  return <GameCanvas />;
}
