import Phaser from "phaser";
import {
  STATIONS,
  STATION_COLORS,
  PROXIMITY_RADIUS,
  INTERACTION_COOLDOWN_MS,
  type Station,
} from "@/lib/game/stations";
import { claimNextLead, getTodayActivities } from "@/app/play/actions";
import { gameStore } from "@/lib/game/store";
import { formatSourceLabel } from "@/lib/game/mock-data";
import type { EventType } from "@/lib/game/xp-events";

// MainScene is a RENDERER. It owns no game state: pending leads, XP and
// daily totals live in lib/game/store.ts (fed by lib/game/lead-feed.ts and
// server actions). The scene reads the store every frame for the in-world
// lead HUD and subscribes for "new lead" pulses. The only writes it does
// are the results of *player actions* (claiming a lead), and even those go
// straight back into the store for React + Phaser to render.

type StationView = {
  data: Station;
  container: Phaser.GameObjects.Container;
  circle: Phaser.GameObjects.Arc;
  pulseTween: Phaser.Tweens.Tween;
  active: boolean;
};

// A lead stays "claimable" for 5 minutes from creation. After that the
// countdown shows "UNGRABBED" (still in DB as 'new', but claiming it awards
// less XP).
const LEAD_CLAIM_WINDOW_MS = 5 * 60 * 1000;
const LEAD_HUD_REFRESH_MS = 1000;

// Toast styling per claim tier — color is the toast border accent.
// Bigger reward = warmer color.
const CLAIM_STYLES: Partial<Record<EventType, { label: string; accent: string }>> = {
  lead_claimed_lightning: { label: "⚡ LIGHTNING RESPONSE!", accent: "#facc15" },
  lead_claimed_fast: { label: "🔥 Fast Response", accent: "#f97316" },
  lead_claimed_ontime: { label: "✓ On-Time", accent: "#22c55e" },
  lead_claimed_late: { label: "Caught Late", accent: "#3b82f6" },
  lead_claimed_stale: { label: "Stale Lead", accent: "#9ca3af" },
  lead_stolen: { label: "😈 LEAD STOLEN!", accent: "#f97316" },
};
const CLAIM_TOAST_DURATION_MS = 2500;
const NONE_TOAST_DURATION_MS = 1500;
const PLACEHOLDER_TOAST_DURATION_MS = 1800;

// Scene-v3: LimeZu "Modern Office Revamped" Office_Design_2 — a 512x544
// open sales floor. Top rows are sales cubicles, bottom-left is a print/
// supply area, bottom-right is an open meeting space. Fits the dealership
// pitch better than the museum it replaced.
const WORLD_WIDTH = 512;
const WORLD_HEIGHT = 544;
const ZOOM = 2;
// 16:9 widescreen canvas. Camera viewport is wider than the world, so the
// world renders centered with dark void on both sides — gives a "vertical
// slice in a larger universe" feel.
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Minimap (top-right HUD): a fixed view of the full world at a fraction of
// the main camera's zoom. Scaled so the world's height fits the minimap.
const MINIMAP_PADDING = 16;
const MINIMAP_W = 180;
const MINIMAP_H = 260;
const MINIMAP_X = GAME_WIDTH - MINIMAP_W - MINIMAP_PADDING;
const MINIMAP_Y = MINIMAP_PADDING;
const MINIMAP_ZOOM = MINIMAP_H / WORLD_HEIGHT;

const PLAYER_SPEED = 130;

// LimeZu Premade_Character_32x32 sheet: 1792x1312, frames are 32 wide x 64 tall
// (a "tile" worth of legs, plus a tile worth of head/hair on top). The bottom
// 32px of the PNG is empty padding, leaving a clean 56 cols x 20 rows grid.
// Row 0 holds 3 preview thumbnails; animation rows start at row 1.
// Each animation row is laid out as: cells 0-5 right, 6-11 up, 12-17 left,
// 18-23 down (6 frames per direction, 4 directions). The mapping looks
// rotated vs typical RPG sheets — verified empirically by pressing each
// arrow key and matching the rendered direction.
const CHAR_COLS = 56;
const FRAME_W = 32;
const FRAME_H = 64;
const IDLE_ROW = 1;
const WALK_ROW = 2;
const DIR_OFFSET = { right: 0, up: 6, left: 12, down: 18 } as const;
const FRAMES_PER_DIR = 6;
const frame = (col: number, row: number) => row * CHAR_COLS + col;

type Direction = keyof typeof DIR_OFFSET;
const DIRECTIONS: Direction[] = ["down", "right", "up", "left"];

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private facing: Direction = "down";
  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private stations: StationView[] = [];
  private activeStation: StationView | null = null;
  private prompt!: Phaser.GameObjects.Container;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private lastInteractAt = new Map<string, number>();

  // In-world lead HUD (floats above the Lead Board). Data comes from the
  // store; these are just the Phaser text objects that render it.
  private leadHud!: Phaser.GameObjects.Container;
  private leadHudHeader!: Phaser.GameObjects.Text;
  private leadHudLines = new Map<string, Phaser.GameObjects.Text>();
  private leadHudLastRefresh = 0;
  private unsubscribeStore: (() => void) | null = null;

  constructor() {
    super({ key: "MainScene" });
  }

  preload() {
    this.load.spritesheet("character", "/game/characters/character-01.png", {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
    });
    this.load.image("scene-bg", "/game/backgrounds/office-v3.png");
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // ─── Background ─────────────────────────────────────────────────────
    this.add.image(0, 0, "scene-bg").setOrigin(0, 0);

    // No furniture colliders for this iteration — the only physics constraint
    // is the world boundary (setCollideWorldBounds on the player). The user
    // explicitly prefers "walk over a couch" to "invisible barrier surprises".

    // ─── Stations ───────────────────────────────────────────────────────
    // Each station is a small pulsing badge anchored at its world position.
    // Built before the player sprite so the player renders on top when
    // walking over them.
    this.createStations();

    // ─── Animations ──────────────────────────────────────────────────────
    for (const dir of DIRECTIONS) {
      const startCol = DIR_OFFSET[dir];
      const endCol = startCol + FRAMES_PER_DIR - 1;

      if (!this.anims.exists(`idle-${dir}`)) {
        this.anims.create({
          key: `idle-${dir}`,
          frames: this.anims.generateFrameNumbers("character", {
            start: frame(startCol, IDLE_ROW),
            end: frame(endCol, IDLE_ROW),
          }),
          frameRate: 4,
          repeat: -1,
        });
      }

      if (!this.anims.exists(`walk-${dir}`)) {
        this.anims.create({
          key: `walk-${dir}`,
          frames: this.anims.generateFrameNumbers("character", {
            start: frame(startCol, WALK_ROW),
            end: frame(endCol, WALK_ROW),
          }),
          frameRate: 10,
          repeat: -1,
        });
      }
    }

    // ─── Player ──────────────────────────────────────────────────────────
    // Anchor at the feet (origin 0.5, 1) so the sprite's "ground" lines up
    // with the collision body and the head extends upward into the cell
    // above. Body covers only the feet/legs so the head can pass in front
    // of walls and decor without colliding.
    // Spawn the player in the central walkway between the second cubicle
    // row and the divider — clear floor, equidistant from all four stations.
    this.player = this.physics.add.sprite(
      WORLD_WIDTH / 2,
      330,
      "character",
      frame(DIR_OFFSET.down, IDLE_ROW)
    );
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(20, 20);
    body.setOffset(6, FRAME_H - 22);

    // ─── Main camera: follow player around the world ─────────────────────
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.setZoom(ZOOM);
    cam.startFollow(this.player, true, 0.1, 0.1);
    cam.setRoundPixels(true);

    // ─── Minimap: fixed view of the entire world, top-right ─────────────
    this.minimap = this.cameras.add(MINIMAP_X, MINIMAP_Y, MINIMAP_W, MINIMAP_H);
    this.minimap.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.minimap.setZoom(MINIMAP_ZOOM);
    this.minimap.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.minimap.setBackgroundColor(0x0a0a0a);
    this.minimap.setRoundPixels(true);

    // Minimap border, rendered only by the main camera. Because the main
    // camera applies ZOOM to everything (including scrollFactor-0 objects),
    // the border's position and size are pre-divided by ZOOM so it lands at
    // the intended canvas pixel coordinates.
    const borderCx = (MINIMAP_X + MINIMAP_W / 2) / ZOOM;
    const borderCy = (MINIMAP_Y + MINIMAP_H / 2) / ZOOM;
    const border = this.add.rectangle(
      borderCx,
      borderCy,
      MINIMAP_W / ZOOM,
      MINIMAP_H / ZOOM
    );
    border.setStrokeStyle(2 / ZOOM, 0xffffff, 0.85);
    border.setScrollFactor(0);
    this.minimap.ignore(border);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    this.spaceKey.on("down", this.tryInteract, this);
    this.player.anims.play(`idle-${this.facing}`);

    // ─── Store wiring ────────────────────────────────────────────────────
    // The lead feed (Realtime subscription) is owned by React (GameCanvas →
    // startLeadFeed). Here we only *react* to the store: when a new pending
    // lead appears, pulse the Lead Board badge.
    this.setupLeadHud();
    this.unsubscribeStore = gameStore.subscribe((state, prev) => {
      if (state.pendingLeads.size > prev.pendingLeads.size) {
        this.pulseLeadStation(0xef4444); // red: fresh lead, race!
      } else if (state.stealableLeads.size > prev.stealableLeads.size) {
        this.pulseLeadStation(0xf97316); // orange: steal opportunity
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeStore?.();
      this.unsubscribeStore = null;
    });
  }

  private setupLeadHud() {
    // HUD floats just above the Lead Board station (the purple one), in
    // world coords so it scrolls with the camera. The header line is always
    // present; per-lead lines are added/removed as leads stream in.
    const leadStation = STATIONS.find((s) => s.type === "leads");
    if (!leadStation) return;

    this.leadHud = this.add.container(leadStation.x, leadStation.y - 80);
    this.leadHud.setDepth(50);

    this.leadHudHeader = this.add
      .text(0, 0, "Leads pendientes: 0", {
        fontSize: "11px",
        fontFamily: "monospace",
        color: "#ffffff",
        backgroundColor: "#000000cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1);
    this.leadHud.add(this.leadHudHeader);
  }

  private pulseLeadStation(color: number) {
    // Visual: colored pulse on the Lead Board station, 3 bumps over ~600ms.
    // Red = new lead landed; orange = a claimed lead opened up for stealing.
    const leadStation = this.stations.find((s) => s.data.type === "leads");
    if (!leadStation) return;
    const circle = leadStation.circle;
    circle.setFillStyle(color, 1);
    this.tweens.add({
      targets: circle,
      scale: 1.3,
      duration: 100,
      ease: "Quad.easeOut",
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        circle.setFillStyle(STATION_COLORS[leadStation.data.type], 0.95);
      },
    });
    // Force a HUD redraw on the next tick so the new lead shows immediately.
    this.leadHudLastRefresh = 0;
  }

  private updateLeadHud(timeMs: number) {
    if (timeMs - this.leadHudLastRefresh < LEAD_HUD_REFRESH_MS) return;
    this.leadHudLastRefresh = timeMs;
    if (!this.leadHud) return;

    const { pendingLeads, stealableLeads } = gameStore.getState();

    const headerParts = [`Leads pendientes: ${pendingLeads.size}`];
    if (stealableLeads.size > 0) {
      headerParts.push(`😈 ${stealableLeads.size} para robar`);
    }
    this.leadHudHeader.setText(headerParts.join("   "));

    // Drop any line whose lead left both live collections (claimed, stolen,
    // or saved — the store mirrors Realtime either way).
    for (const [id, lineText] of this.leadHudLines) {
      if (!pendingLeads.has(id) && !stealableLeads.has(id)) {
        lineText.destroy();
        this.leadHudLines.delete(id);
      }
    }

    const ensureLine = (id: string) => {
      let line = this.leadHudLines.get(id);
      if (!line) {
        line = this.add
          .text(0, 0, "", {
            fontSize: "10px",
            fontFamily: "monospace",
            color: "#ffffff",
            backgroundColor: "#000000cc",
            padding: { x: 6, y: 2 },
          })
          .setOrigin(0.5, 0);
        this.leadHud.add(line);
        this.leadHudLines.set(id, line);
      }
      return line;
    };

    const now = Date.now();
    let y = 4;

    // Pending leads first, oldest first so the most urgent (closest to
    // ungrabbed) sits at the top of the list.
    const sortedPending = [...pendingLeads.values()].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const lead of sortedPending) {
      const line = ensureLine(lead.id);

      const createdAt = new Date(lead.created_at).getTime();
      const msLeft = createdAt + LEAD_CLAIM_WINDOW_MS - now;

      let color: string;
      let body: string;
      if (msLeft <= 0) {
        color = "#9ca3af"; // gray
        body = `${formatSourceLabel(lead.source)} — UNGRABBED`;
      } else {
        const mins = Math.floor(msLeft / 60_000);
        const secs = Math.floor((msLeft % 60_000) / 1000);
        const stamp = `${mins}:${secs.toString().padStart(2, "0")}`;
        if (msLeft < 60_000) color = "#ef4444"; // red
        else if (msLeft < 180_000) color = "#eab308"; // yellow
        else color = "#22c55e"; // green
        body = `${formatSourceLabel(lead.source)}  ${stamp}`;
      }

      line.setColor(color);
      line.setText(body);
      line.setY(y);
      y += 14;
    }

    // Stealable leads below, oldest claim first (most steal-urgent). Orange
    // — the same accent as the steal pulse/toasts.
    const sortedStealable = [...stealableLeads.values()].sort(
      (a, b) =>
        new Date(a.claimed_at ?? a.created_at).getTime() -
        new Date(b.claimed_at ?? b.created_at).getTime()
    );
    for (const lead of sortedStealable) {
      const line = ensureLine(lead.id);
      line.setColor("#f97316");
      line.setText(`😈 STEAL: ${formatSourceLabel(lead.source)}`);
      line.setY(y);
      y += 14;
    }
  }

  private tryInteract() {
    if (!this.activeStation) return;
    const id = this.activeStation.data.id;
    const now = this.time.now;
    const last = this.lastInteractAt.get(id) ?? -Infinity;
    if (now - last < INTERACTION_COOLDOWN_MS) return;
    this.lastInteractAt.set(id, now);

    const station = this.activeStation;
    this.flashStation(station);

    // The Lead Board claims the oldest pending lead. The Computer Desk
    // opens the React Email Composer (real send via Resend). Phone/Photo
    // are placeholders until their real integrations (Twilio / video) land:
    // they explicitly do NOT award XP or count activities — XP is only for
    // server-verified real work, otherwise the daily counter (and the
    // manager's trust in it) is fiction.
    if (station.data.type === "leads") {
      void this.handleClaimAttempt();
      return;
    }
    if (station.data.type === "computer") {
      // Pause the game so SPACE/arrow keys do not leak into other stations
      // while the modal is open. GameCanvas resumes on close.
      this.scene.pause();
      gameStore.getState().setEmailComposerOpen(true);
      return;
    }

    gameStore.getState().pushToast({
      message: `${station.data.icon} ${station.data.label} — coming soon`,
      accent: "#9ca3af",
      durationMs: PLACEHOLDER_TOAST_DURATION_MS,
    });
  }

  private flashStation(station: StationView) {
    const originalFill = STATION_COLORS[station.data.type];
    station.circle.setFillStyle(0xffffff, 1);
    this.tweens.add({
      targets: station.circle,
      scale: 1.6,
      duration: 120,
      ease: "Quad.easeOut",
      yoyo: true,
      onComplete: () => {
        station.circle.setFillStyle(originalFill, 0.95);
      },
    });
  }

  private async handleClaimAttempt() {
    const store = gameStore.getState();
    try {
      const result = await claimNextLead();
      if (!result.ok) {
        if (result.reason === "no_leads") {
          store.pushToast({
            message: "No leads available right now",
            accent: "#9ca3af",
            durationMs: NONE_TOAST_DURATION_MS,
          });
        } else {
          console.error("[claim] failed:", result);
        }
        return;
      }

      // Optimistically drop the lead from the store; the Realtime UPDATE
      // event would do this too but it can lag by 100-300ms and the
      // toast/HUD look snappier when we remove it now.
      store.removePendingLead(result.leadId);
      store.setXp(result.newTotalXP);
      store.bumpDaily(1);

      const style = CLAIM_STYLES[result.eventType] ?? CLAIM_STYLES.lead_claimed_ontime!;
      store.pushToast({
        message: `${style.label}  +${result.xpEarned} XP`,
        accent: style.accent,
        durationMs: CLAIM_TOAST_DURATION_MS,
      });

      // Background-sync the daily breakdown so the optimistic bump stays
      // honest with the server's count.
      void getTodayActivities()
        .then((summary) => gameStore.getState().setDaily(summary))
        .catch((err) => console.error("[claim] daily refresh failed:", err));
    } catch (err) {
      console.error("[claim] threw:", err);
    }
  }

  private createStations() {
    for (const data of STATIONS) {
      const container = this.add.container(data.x, data.y);

      // Soft ground shadow so the badge feels anchored to the floor.
      const shadow = this.add.ellipse(0, 22, 36, 10, 0x000000, 0.35);

      // Colored disc that pulses to draw the eye.
      const circle = this.add.circle(0, 0, 22, STATION_COLORS[data.type], 0.95);
      circle.setStrokeStyle(2, 0xffffff, 0.9);

      // Emoji icon centered on the disc.
      const icon = this.add
        .text(0, 1, data.icon, { fontSize: "20px" })
        .setOrigin(0.5, 0.5);

      // Label tucked under the badge.
      const label = this.add
        .text(0, 30, data.label, {
          fontSize: "9px",
          fontFamily: "monospace",
          color: "#ffffff",
          backgroundColor: "#000000aa",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 0);

      container.add([shadow, circle, icon, label]);

      const pulseTween = this.tweens.add({
        targets: circle,
        scale: 1.12,
        duration: 750,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });

      this.stations.push({ data, container, circle, pulseTween, active: false });
    }

    // "Press SPACE" prompt floats above the currently-active station. Lives
    // in world space (so it tracks the station when the camera scrolls) but
    // starts hidden — proximity checks toggle it on/off.
    const promptBg = this.add.rectangle(0, 0, 100, 18, 0x000000, 0.85);
    promptBg.setStrokeStyle(1, 0xffffff, 0.6);
    const promptText = this.add
      .text(0, 0, "PRESS SPACE", {
        fontSize: "10px",
        fontFamily: "monospace",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0.5);
    this.prompt = this.add.container(0, 0, [promptBg, promptText]);
    this.prompt.setVisible(false);
  }

  private updateProximity() {
    let nearest: StationView | null = null;
    let nearestDist = PROXIMITY_RADIUS;

    for (const view of this.stations) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y - 16, // aim at the player's torso, not feet
        view.data.x,
        view.data.y
      );
      if (dist < nearestDist) {
        nearest = view;
        nearestDist = dist;
      }
    }

    if (nearest !== this.activeStation) {
      // Reset old active station's pulse to gentle scale.
      if (this.activeStation) {
        this.activeStation.active = false;
        this.activeStation.pulseTween.updateTo("scale", 1.12, true);
        this.activeStation.circle.setScale(1);
      }
      // Boost the new active station's pulse.
      if (nearest) {
        nearest.active = true;
        nearest.pulseTween.updateTo("scale", 1.3, true);
      }
      this.activeStation = nearest;
    }

    if (this.activeStation) {
      this.prompt.setVisible(true);
      this.prompt.setPosition(
        this.activeStation.data.x,
        this.activeStation.data.y - 44
      );
    } else {
      this.prompt.setVisible(false);
    }
  }

  update(timeMs: number) {
    if (!this.player || !this.cursors) return;
    this.updateLeadHud(timeMs);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown) vx = -PLAYER_SPEED;
    else if (this.cursors.right.isDown) vx = PLAYER_SPEED;
    if (this.cursors.up.isDown) vy = -PLAYER_SPEED;
    else if (this.cursors.down.isDown) vy = PLAYER_SPEED;

    body.setVelocity(vx, vy);

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      if (Math.abs(vx) >= Math.abs(vy)) {
        this.facing = vx < 0 ? "left" : "right";
      } else {
        this.facing = vy < 0 ? "up" : "down";
      }
      this.player.anims.play(`walk-${this.facing}`, true);
    } else {
      this.player.anims.play(`idle-${this.facing}`, true);
    }

    this.updateProximity();
  }
}
