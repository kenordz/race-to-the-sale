import Phaser from "phaser";

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;

const TILE = 32;
const WALL_THICKNESS = TILE;
const PLAYER_SPEED = 160;

// LimeZu Premade_Character_32x32 sheet: 1792x1312, frames are 32 wide x 64 tall
// (a "tile" worth of legs, plus a tile worth of head/hair on top). The bottom
// 32px of the PNG is empty padding, leaving a clean 56 cols x 20 rows grid.
// Row 0 holds 3 preview thumbnails; animation rows start at row 1.
// Each animation row is laid out as: cells 0-5 down, 6-11 right, 12-17 up,
// 18-23 left (6 frames per direction, 4 directions).
const CHAR_COLS = 56;
const FRAME_W = 32;
const FRAME_H = 64;
const IDLE_ROW = 1;
const WALK_ROW = 2;
const DIR_OFFSET = { down: 0, right: 6, up: 12, left: 18 } as const;
const FRAMES_PER_DIR = 6;
const frame = (col: number, row: number) => row * CHAR_COLS + col;

type Direction = keyof typeof DIR_OFFSET;
const DIRECTIONS: Direction[] = ["down", "right", "up", "left"];

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private facing: Direction = "down";

  constructor() {
    super({ key: "MainScene" });
  }

  preload() {
    this.load.spritesheet("character", "/game/characters/character-01.png", {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
    });
  }

  create() {
    // World bounds = the full office room.
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // ─── Floor ───────────────────────────────────────────────────────────
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xc4a17a)
      .setOrigin(0, 0);

    // ─── Walls (perimeter, with collision) ───────────────────────────────
    this.walls = this.physics.add.staticGroup();
    const wallColor = 0x4a3520;
    const wallSpecs = [
      [0, 0, GAME_WIDTH, WALL_THICKNESS],
      [0, GAME_HEIGHT - WALL_THICKNESS, GAME_WIDTH, WALL_THICKNESS],
      [0, 0, WALL_THICKNESS, GAME_HEIGHT],
      [GAME_WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, GAME_HEIGHT],
    ] as const;
    for (const [x, y, w, h] of wallSpecs) {
      const rect = this.add.rectangle(x, y, w, h, wallColor).setOrigin(0, 0);
      this.physics.add.existing(rect, true);
      this.walls.add(rect);
    }

    // Inner trim line for pixel-art depth.
    this.add
      .rectangle(
        WALL_THICKNESS,
        WALL_THICKNESS,
        GAME_WIDTH - 2 * WALL_THICKNESS,
        2,
        0x2a1f12
      )
      .setOrigin(0, 0);

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
    // Sprite is 32w x 64h. Anchor at the feet (origin 0.5, 1) so positioning
    // matches the tile grid: the sprite's "ground" lines up with the
    // collision body, and the head extends upward into the cell above.
    this.player = this.physics.add.sprite(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      "character",
      frame(DIR_OFFSET.down, IDLE_ROW)
    );
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    // Body covers the feet/legs area only so the character's head can pass
    // in front of walls and decor without colliding. With origin (0.5, 1)
    // the body sits at the bottom of the sprite rect.
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(20, 20);
    body.setOffset(6, FRAME_H - 22);

    this.physics.add.collider(this.player, this.walls);

    // ─── Camera: chunky Habbo-style zoom + follow player ─────────────────
    const cam = this.cameras.main;
    cam.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    cam.setZoom(2);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.player.anims.play(`idle-${this.facing}`);
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
  }
}
