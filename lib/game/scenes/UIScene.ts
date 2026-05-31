import Phaser from "phaser";
import { GAME_WIDTH } from "@/lib/game/scenes/MainScene";
import type { Station } from "@/lib/game/stations";
import {
  STATION_TO_EVENT,
  XP_PER_EVENT,
  type EventType,
} from "@/lib/game/xp-events";
import { awardXP, getCurrentXP, type LeadRow } from "@/app/play/actions";
import { formatSourceLabel } from "@/lib/game/mock-data";

const TOAST_DURATION_MS = 1800;
const LEAD_TOAST_DURATION_MS = 3000;

type InteractPayload = { station: Station };

export class UIScene extends Phaser.Scene {
  private xp = 0;
  private xpText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Container;
  private toastTween?: Phaser.Tweens.Tween;
  private pending = 0;

  constructor() {
    super({ key: "UIScene" });
  }

  create() {
    // Default camera at zoom 1, no scroll — every object lives in canvas
    // pixel space, so there is no scrollFactor/zoom math to worry about.

    // ─── XP counter (top-left) ──────────────────────────────────────────
    const xpBg = this.add
      .rectangle(0, 0, 130, 32, 0x000000, 0.75)
      .setOrigin(0, 0);
    xpBg.setStrokeStyle(1, 0xffffff, 0.4);
    this.xpText = this.add
      .text(10, 7, this.formatXp(), {
        fontSize: "16px",
        fontFamily: "monospace",
        color: "#ffffff",
      })
      .setOrigin(0, 0);

    const xpContainer = this.add.container(16, 16, [xpBg, this.xpText]);
    xpContainer.setDepth(10);

    // ─── Toast (top-center, hidden until an interaction fires) ──────────
    const toastBg = this.add
      .rectangle(0, 0, 280, 40, 0x111111, 0.92)
      .setOrigin(0.5, 0.5);
    toastBg.setStrokeStyle(2, 0x22c55e, 0.9);
    const toastText = this.add
      .text(0, 0, "", {
        fontSize: "15px",
        fontFamily: "monospace",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0.5);
    this.toast = this.add.container(GAME_WIDTH / 2, 60, [toastBg, toastText]);
    this.toast.setDepth(20);
    this.toast.setAlpha(0);

    // Pull the initial total from Supabase so a fresh session shows whatever
    // the user has earned across devices.
    void this.loadInitialXp();

    // Wire the cross-scene event channel.
    const gameEvents = this.game.events;
    gameEvents.on("station:interact", this.handleInteract, this);
    gameEvents.on("lead:new", this.handleNewLead, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gameEvents.off("station:interact", this.handleInteract, this);
      gameEvents.off("lead:new", this.handleNewLead, this);
    });
  }

  private handleNewLead(lead: LeadRow) {
    const source = formatSourceLabel(lead.source);
    this.showToast(
      `🚨 NEW LEAD from ${source} — 5:00 to claim!`,
      0xef4444, // red border, urgent
      LEAD_TOAST_DURATION_MS
    );
    this.playLeadBeep();
  }

  private playLeadBeep() {
    // Ascending double-chime via Web Audio API. Created lazily per beep so
    // we do not have to manage a long-lived AudioContext. If the browser is
    // still suspended (no user gesture yet) the call is a silent no-op.
    try {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtor();
      const play = (freq: number, startOffset: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + startOffset;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
        osc.start(t0);
        osc.stop(t0 + duration);
      };
      play(1046, 0, 0.18); // C6
      play(1318, 0.11, 0.22); // E6
      setTimeout(() => {
        void ctx.close();
      }, 500);
    } catch (err) {
      // Some browsers throw before any user gesture; that is fine — the
      // visual toast already covers the alert path.
      console.warn("[lead beep] suppressed:", err);
    }
  }

  private async loadInitialXp() {
    try {
      const total = await getCurrentXP();
      this.xp = total;
      this.xpText.setText(this.formatXp());
    } catch (err) {
      // Failure here is non-fatal — HUD just stays at 0 until next interaction.
      console.error("[UIScene] failed to load initial XP:", err);
    }
  }

  private handleInteract(payload: InteractPayload) {
    const eventType: EventType = STATION_TO_EVENT[payload.station.type];
    const xpDelta = XP_PER_EVENT[eventType];

    // Optimistic update for snappy feedback. We reconcile with the server's
    // authoritative sum once the insert returns.
    this.pending += xpDelta;
    this.xp += xpDelta;
    this.xpText.setText(this.formatXp());
    this.showToast(
      `${payload.station.icon} ${payload.station.actionLabel}  +${xpDelta} XP`,
      this.borderColorFor(payload.station.type)
    );

    void this.persistInteract(eventType, xpDelta);
  }

  private async persistInteract(eventType: EventType, xpDelta: number) {
    try {
      const total = await awardXP({ eventType });
      this.pending -= xpDelta;
      // Reconcile with the server total, but only if no other inflight
      // requests are pending — otherwise we'd snap back to a stale value.
      if (this.pending === 0) {
        this.xp = total;
        this.xpText.setText(this.formatXp());
      }
    } catch (err) {
      // Roll back the optimistic bump so the HUD stays truthful.
      this.pending -= xpDelta;
      this.xp -= xpDelta;
      this.xpText.setText(this.formatXp());
      console.error("[UIScene] failed to persist XP:", err);
    }
  }

  private showToast(
    message: string,
    borderColor: number,
    duration: number = TOAST_DURATION_MS
  ) {
    const [bg, text] = this.toast.getAll() as [
      Phaser.GameObjects.Rectangle,
      Phaser.GameObjects.Text,
    ];
    text.setText(message);
    bg.setStrokeStyle(2, borderColor, 0.95);

    this.toastTween?.stop();
    this.toast.setAlpha(0);
    this.toast.setY(40);
    this.toastTween = this.tweens.add({
      targets: this.toast,
      alpha: { from: 0, to: 1 },
      y: { from: 40, to: 60 },
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.toastTween = this.tweens.add({
          targets: this.toast,
          alpha: 0,
          duration: 400,
          delay: Math.max(0, duration - 180 - 400),
          ease: "Quad.easeIn",
        });
      },
    });
  }

  private borderColorFor(type: Station["type"]): number {
    switch (type) {
      case "phone":
        return 0x22c55e;
      case "computer":
        return 0x3b82f6;
      case "photo":
        return 0xeab308;
      case "leads":
        return 0xa855f7;
    }
  }

  private formatXp(): string {
    return `✨ XP: ${this.xp}`;
  }
}
