"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/lib/game/scenes/MainScene";
import {
  generateMockLead,
  type SendEmailResult,
} from "@/app/play/actions";
import EmailComposerModal from "@/components/EmailComposerModal";

// Random delay in milliseconds for the next mock lead. Range tuned so the
// demo feels lively but not spammy — 30-90s.
const LEAD_INTERVAL_MIN_MS = 30_000;
const LEAD_INTERVAL_MAX_MS = 90_000;
const pickNextDelay = () =>
  LEAD_INTERVAL_MIN_MS +
  Math.floor(Math.random() * (LEAD_INTERVAL_MAX_MS - LEAD_INTERVAL_MIN_MS));

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!containerRef.current) return;
    if (gameRef.current) return;

    let cancelled = false;

    (async () => {
      const [{ default: PhaserLib }, { MainScene }, { UIScene }] =
        await Promise.all([
          import("phaser"),
          import("@/lib/game/scenes/MainScene"),
          import("@/lib/game/scenes/UIScene"),
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
        scene: [MainScene, UIScene],
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
      // Bridge: MainScene emits "open:email-composer" when the player
      // SPACE's on the Computer Desk. React owns the modal; Phaser is
      // paused while it's up to avoid bleeding keystrokes into other
      // stations.
      gameRef.current.events.on("open:email-composer", () => {
        setEmailOpen(true);
      });
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Mock lead generator. This is a stand-in for the DriveCentric ADF feed
  // that will drive production. Lives on the client because each user's
  // browser independently triggers leads for demo purposes; in production
  // the server (or an edge function on a cron) would own this.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      const delay = pickNextDelay();
      timeoutId = setTimeout(async () => {
        if (cancelled) return;
        try {
          await generateMockLead();
        } catch (err) {
          // Swallow — the user might not have a dealership yet, or the
          // network might be flaky. We try again next tick.
          console.error("[mock lead] generation failed:", err);
        }
        if (!cancelled) scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const closeEmail = useCallback(() => {
    setEmailOpen(false);
    // Resume the Phaser scene so input + animations pick back up.
    const game = gameRef.current;
    if (game) {
      const main = game.scene.getScene("MainScene");
      if (main && main.scene.isPaused()) main.scene.resume();
    }
  }, []);

  const onEmailSent = useCallback(
    (result: Extract<SendEmailResult, { ok: true }>) => {
      // Hand the new XP total back into the UIScene so the HUD picks up
      // immediately without a getCurrentXP roundtrip.
      const game = gameRef.current;
      game?.events.emit("xp:set", { total: result.newTotalXP });
      game?.events.emit("email:sent-toast", { recipient: result.recipient });
    },
    []
  );

  return (
    <>
      <div
        ref={containerRef}
        className="aspect-video w-full max-w-[1280px] overflow-hidden rounded-xl border border-white/10 shadow-2xl"
      />
      <EmailComposerModal
        open={emailOpen}
        onClose={closeEmail}
        onSent={onEmailSent}
      />
    </>
  );
}
