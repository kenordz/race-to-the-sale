"use client";

import { useEffect, useRef } from "react";
import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/lib/game/scenes/MainScene";

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!containerRef.current) return;
    if (gameRef.current) return;

    let cancelled = false;

    (async () => {
      const [{ default: PhaserLib }, { MainScene }] = await Promise.all([
        import("phaser"),
        import("@/lib/game/scenes/MainScene"),
      ]);

      if (cancelled || !containerRef.current) return;

      gameRef.current = new PhaserLib.Game({
        type: PhaserLib.AUTO,
        parent: containerRef.current,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: "#f3f4f6",
        scene: [MainScene],
        scale: {
          mode: PhaserLib.Scale.NONE,
          autoCenter: PhaserLib.Scale.CENTER_BOTH,
        },
        banner: false,
      });
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-white/10 shadow-2xl"
      style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
    />
  );
}
