import Phaser from "phaser";

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;

const PLAYER_SIZE = 32;
const PLAYER_SPEED = 220;

export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super({ key: "MainScene" });
  }

  create() {
    this.cameras.main.setBackgroundColor("#f3f4f6");

    this.player = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      0x6366f1
    );

    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  update(_time: number, delta: number) {
    const step = (PLAYER_SPEED * delta) / 1000;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown) dx -= step;
    if (this.cursors.right.isDown) dx += step;
    if (this.cursors.up.isDown) dy -= step;
    if (this.cursors.down.isDown) dy += step;

    const half = PLAYER_SIZE / 2;
    this.player.x = Phaser.Math.Clamp(
      this.player.x + dx,
      half,
      GAME_WIDTH - half
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + dy,
      half,
      GAME_HEIGHT - half
    );
  }
}
