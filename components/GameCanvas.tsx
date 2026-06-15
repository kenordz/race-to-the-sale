"use client";

import { useCallback, useEffect, useRef } from "react";
import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "@/lib/game/scenes/MainScene";
import {
  generateMockLead,
  getCurrentXP,
  getTodayActivities,
  type SendEmailResult,
} from "@/app/play/actions";
import { gameStore, useGameStore } from "@/lib/game/store";
import { startLeadFeed } from "@/lib/game/lead-feed";
import { XP_PER_EVENT } from "@/lib/game/xp-events";
import EmailComposerModal from "@/components/EmailComposerModal";
import MyLeadsModal from "@/components/MyLeadsModal";
import HudOverlay from "@/components/hud/HudOverlay";
import TutorialOverlay from "@/components/TutorialOverlay";

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
  const emailOpen = useGameStore((s) => s.emailComposerOpen);
  const myLeadsOpen = useGameStore((s) => s.myLeadsOpen);

  // ─── Phaser boot ───────────────────────────────────────────────────────
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

  // ─── Store hydration + lead feed ──────────────────────────────────────
  // The Realtime subscription lives in lead-feed.ts and writes straight to
  // the store; Phaser and the React HUD both just render store state.
  useEffect(() => {
    const feed = startLeadFeed();

    void getCurrentXP()
      .then((total) => gameStore.getState().setXp(total))
      .catch((err) => console.error("[hud] initial XP load failed:", err));
    void getTodayActivities()
      .then((summary) => gameStore.getState().setDaily(summary))
      .catch((err) => console.error("[hud] initial daily load failed:", err));

    return () => feed.stop();
  }, []);

  // ─── Mock lead generator ──────────────────────────────────────────────
  // Stand-in for the DriveCentric ADF feed that will drive production.
  // Lives on the client because each user's browser independently triggers
  // leads for demo purposes; in production the server (or an edge function
  // on a cron) would own this.
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

  const resumeScene = useCallback(() => {
    const game = gameRef.current;
    if (game) {
      const main = game.scene.getScene("MainScene");
      if (main && main.scene.isPaused()) main.scene.resume();
    }
  }, []);

  const closeEmail = useCallback(() => {
    gameStore.getState().setEmailComposerOpen(false);
    resumeScene();
  }, [resumeScene]);

  const closeMyLeads = useCallback(() => {
    gameStore.getState().setMyLeadsOpen(false);
    resumeScene();
  }, [resumeScene]);

  const onEmailSent = useCallback(
    (result: Extract<SendEmailResult, { ok: true }>) => {
      const store = gameStore.getState();
      store.setXp(result.newTotalXP);
      store.bumpDaily(1);
      // The +XP toast is implied by the XP counter jumping; the toast slot
      // confirms where the email actually went, which matters for the demo
      // ("look, it went to YOUR inbox, not a fake one").
      store.pushToast({
        message: `✉️  Email sent to ${result.recipient}  +${XP_PER_EVENT.email_sent} XP`,
        accent: "#10b981",
        durationMs: 2500,
      });
      void getTodayActivities()
        .then((summary) => gameStore.getState().setDaily(summary))
        .catch(() => {});
    },
    []
  );

  return (
    <>
      <div className="relative w-full max-w-[1280px]">
        <div
          ref={containerRef}
          className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 shadow-2xl"
        />
        <HudOverlay />
        <TutorialOverlay />
      </div>
      {/* key remounts the modal on every open/close flip so its internal
          stage/error state resets via useState initials (avoids setState-
          in-effect reset patterns). */}
      <EmailComposerModal
        key={emailOpen ? "email-open" : "email-closed"}
        open={emailOpen}
        onClose={closeEmail}
        onSent={onEmailSent}
      />
      <MyLeadsModal
        key={myLeadsOpen ? "leads-open" : "leads-closed"}
        open={myLeadsOpen}
        onClose={closeMyLeads}
      />
    </>
  );
}
