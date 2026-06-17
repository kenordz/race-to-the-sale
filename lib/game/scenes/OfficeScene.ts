import Phaser from "phaser";
import { NpcCrowd } from "@/lib/game/npc";

// OfficeScene — the NEW art direction (cartoon illustrated office), isolated
// from the production MainScene so the pixel-art demo stays untouched. This
// is a sandbox to validate the look: load the illustrated map as a full
// background, drop a walkable character on it, camera follows.
//
// The character here is the existing pixel sprite used as a PLACEHOLDER —
// the real isometric/cartoon character (matching this map) gets swapped in
// once its art is ready.

const MAP_WIDTH = 1376;
const MAP_HEIGHT = 768;
const ZOOM = 2.3;
const PLAYER_SCALE = 1.85;
const PLAYER_SPEED = 150;

// Reuse the LimeZu character sheet layout (32x64 frames, 56 cols).
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

export class OfficeScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private facing: Direction = "down";
  private crowd!: NpcCrowd;

  constructor() {
    super({ key: "OfficeScene" });
  }

  preload() {
    this.load.image("office-map", "/art/raw/office-map.png");
    this.load.spritesheet("character", "/game/characters/character-01.png", {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
    });
  }

  create() {
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    this.add.image(0, 0, "office-map").setOrigin(0, 0);

    this.player = this.physics.add
      .sprite(MAP_WIDTH / 2, MAP_HEIGHT * 0.62, "character", frame(0, IDLE_ROW))
      .setCollideWorldBounds(true);
    this.player.setScale(PLAYER_SCALE);
    // Tighten the body to the feet so the character reads as standing on the
    // floor rather than floating.
    (this.player.body as Phaser.Physics.Arcade.Body)
      .setSize(20, 18)
      .setOffset(6, 44);

    this.createAnimations();

    // Ambient teammates wandering the floor (cosmetic until real multiplayer).
    this.crowd = new NpcCrowd(this, {
      textureKey: "character",
      startFrame: frame(DIR_OFFSET.down, IDLE_ROW),
      bounds: { x: 220, y: 170, w: MAP_WIDTH - 440, h: MAP_HEIGHT - 320 },
      scale: PLAYER_SCALE,
      members: [
        { name: "Carlos", tint: 0xff9b9b },
        { name: "Marisol", tint: 0x9bd0ff },
        { name: "Diego", tint: 0xffe39b },
        { name: "Hannah", tint: 0xc7a3ff },
        { name: "Tony", tint: 0x9bf0c0 },
      ],
    });

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    cam.setZoom(ZOOM);
    cam.startFollow(this.player, true, 0.1, 0.1);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  private createAnimations() {
    DIRECTIONS.forEach((dir) => {
      const off = DIR_OFFSET[dir];
      if (!this.anims.exists(`walk-${dir}`)) {
        this.anims.create({
          key: `walk-${dir}`,
          frames: Array.from({ length: FRAMES_PER_DIR }, (_, i) => ({
            key: "character",
            frame: frame(off + i, WALK_ROW),
          })),
          frameRate: 10,
          repeat: -1,
        });
      }
      if (!this.anims.exists(`idle-${dir}`)) {
        this.anims.create({
          key: `idle-${dir}`,
          frames: [{ key: "character", frame: frame(off, IDLE_ROW) }],
          frameRate: 1,
        });
      }
    });
  }

  update(time: number, delta: number) {
    this.crowd.update(time, delta);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    let moving = false;
    if (left) {
      body.setVelocityX(-PLAYER_SPEED);
      this.facing = "left";
      moving = true;
    } else if (right) {
      body.setVelocityX(PLAYER_SPEED);
      this.facing = "right";
      moving = true;
    }
    if (up) {
      body.setVelocityY(-PLAYER_SPEED);
      if (!left && !right) this.facing = "up";
      moving = true;
    } else if (down) {
      body.setVelocityY(PLAYER_SPEED);
      if (!left && !right) this.facing = "down";
      moving = true;
    }

    body.velocity.normalize().scale(PLAYER_SPEED);

    this.player.anims.play(
      `${moving ? "walk" : "idle"}-${this.facing}`,
      true
    );
  }
}
