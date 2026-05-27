import Phaser from "phaser";
import {
  STATIONS,
  STATION_COLORS,
  PROXIMITY_RADIUS,
  INTERACTION_COOLDOWN_MS,
  type Station,
} from "@/lib/game/stations";

type StationView = {
  data: Station;
  container: Phaser.GameObjects.Container;
  circle: Phaser.GameObjects.Arc;
  pulseTween: Phaser.Tweens.Tween;
  active: boolean;
};

// Scene-v2: LimeZu Museum_room_2 — a tall 512x1056 vertical map with three
// stacked levels (artifacts up top, statue hall in the middle, garden + pond
// at the bottom). World is the image; there is no void around it.
const WORLD_WIDTH = 512;
const WORLD_HEIGHT = 1056;
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

  constructor() {
    super({ key: "MainScene" });
  }

  preload() {
    this.load.spritesheet("character", "/game/characters/character-01.png", {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
    });
    this.load.image("scene-bg", "/game/backgrounds/scene-v2.png");
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
    // Start the player at the bottom-center of the map (garden/pond level).
    // The camera will follow upward as they walk through the statue hall and
    // into the artifact room at the top.
    this.player = this.physics.add.sprite(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT - 80,
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

    // UI HUD lives in its own scene so it can render in canvas pixel space
    // without fighting the main camera's zoom or scroll.
    this.scene.launch("UIScene");
  }

  private tryInteract() {
    if (!this.activeStation) return;
    const id = this.activeStation.data.id;
    const now = this.time.now;
    const last = this.lastInteractAt.get(id) ?? -Infinity;
    if (now - last < INTERACTION_COOLDOWN_MS) return;
    this.lastInteractAt.set(id, now);

    // Visual flash: scale bump + briefly recolor the disc white, then back.
    const station = this.activeStation;
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

    this.game.events.emit("station:interact", {
      station: station.data,
      xp: station.data.xpReward,
    });
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

  update() {
    if (!this.player || !this.cursors) return;
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
