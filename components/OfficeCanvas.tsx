"use client";

import { useEffect, useRef } from "react";
import type Phaser from "phaser";

// Standalone canvas for the new illustrated-office sandbox (/office).
// Isolated from the production game: no Supabase, no leads — just the map +
// a walkable placeholder character so we can validate the new art direction.

export default function OfficeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!containerRef.current) return;
    if (gameRef.current) return;

    let cancelled = false;

    (async () => {
      const [{ default: PhaserLib }, { OfficeScene }] = await Promise.all([
        import("phaser"),
        import("@/lib/game/scenes/OfficeScene"),
      ]);

      if (cancelled || !containerRef.current) return;

      gameRef.current = new PhaserLib.Game({
        type: PhaserLib.AUTO,
        parent: containerRef.current,
        backgroundColor: "#0a0a0a",
        physics: {
          default: "arcade",
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        pixelArt: false,
        scene: [OfficeScene],
        scale: {
          mode: PhaserLib.Scale.RESIZE,
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

  return <div ref={containerRef} className="h-full w-full" />;
}
