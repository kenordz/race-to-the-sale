import Phaser from "phaser";

// Scene-v2: LimeZu Museum_room_2 — a tall 512x1056 vertical map with three
// stacked levels (artifacts up top, statue hall in the middle, garden + pond
// at the bottom). World is the image; there is no void around it.
const WORLD_WIDTH = 512;
const WORLD_HEIGHT = 1056;
const ZOOM = 2;
// Canvas viewport is a square window into the much taller world; the camera
// follows the player, so vertical scroll dominates as you move between levels.
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 640;

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

    // ─── Camera: follow player around the expanded world ────────────────
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.setZoom(ZOOM);
    cam.startFollow(this.player, true, 0.1, 0.1);
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
