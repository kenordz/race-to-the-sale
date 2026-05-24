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
        backgroundColor: "#1a1a1a",
        physics: {
          default: "arcade",
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        pixelArt: true,
        roundPixels: true,
        scene: [MainScene],
        scale: {
          mode: PhaserLib.Scale.FIT,
          autoCenter: PhaserLib.Scale.CENTER_BOTH,
        },
        banner: false,
      });
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __phaserGame?: Phaser.Game }).__phaserGame =
          gameRef.current;
      }
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
      className="aspect-video w-full max-w-[1280px] overflow-hidden rounded-xl border border-white/10 shadow-2xl"
    />
  );
}
