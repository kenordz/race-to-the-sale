import Phaser from "phaser";

// Ambient "fake teammates" that wander the floor so the office never looks
// empty — the illusion of a live team until real multiplayer co-presence
// (Supabase Realtime) ships. Pure cosmetic: no physics, no collisions, just
// lerp-to-a-random-point wandering. Reuses whatever `walk-<dir>` / `idle-<dir>`
// animations the host scene already defines.

type Dir = "down" | "up" | "left" | "right";

type Npc = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  tx: number;
  ty: number;
  speed: number;
  pauseUntil: number;
  facing: Dir;
};

export type NpcCrowdConfig = {
  textureKey: string;
  startFrame: number;
  bounds: { x: number; y: number; w: number; h: number };
  members: { name: string; tint?: number }[];
  scale?: number;
};

const LABEL_DEPTH = 9000;

export class NpcCrowd {
  private scene: Phaser.Scene;
  private cfg: NpcCrowdConfig;
  private npcs: Npc[] = [];

  constructor(scene: Phaser.Scene, cfg: NpcCrowdConfig) {
    this.scene = scene;
    this.cfg = cfg;
    this.spawn();
  }

  private rand(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  private randomPoint() {
    const b = this.cfg.bounds;
    return { x: this.rand(b.x, b.x + b.w), y: this.rand(b.y, b.y + b.h) };
  }

  private spawn() {
    const scale = this.cfg.scale ?? 1;
    for (const m of this.cfg.members) {
      const p = this.randomPoint();
      const sprite = this.scene.add
        .sprite(p.x, p.y, this.cfg.textureKey, this.cfg.startFrame)
        .setOrigin(0.5, 1)
        .setScale(scale);
      if (m.tint !== undefined) sprite.setTint(m.tint);

      const label = this.scene.add
        .text(p.x, p.y, m.name, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(LABEL_DEPTH);

      const t = this.randomPoint();
      this.npcs.push({
        sprite,
        label,
        tx: t.x,
        ty: t.y,
        speed: this.rand(40, 75),
        pauseUntil: 0,
        facing: "down",
      });
    }
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;
    for (const n of this.npcs) {
      const s = n.sprite;

      if (time < n.pauseUntil) {
        s.anims.play(`idle-${n.facing}`, true);
      } else {
        const dx = n.tx - s.x;
        const dy = n.ty - s.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 4) {
          n.pauseUntil = time + this.rand(900, 3000);
          const p = this.randomPoint();
          n.tx = p.x;
          n.ty = p.y;
          s.anims.play(`idle-${n.facing}`, true);
        } else {
          const vx = (dx / dist) * n.speed;
          const vy = (dy / dist) * n.speed;
          s.x += vx * dt;
          s.y += vy * dt;
          n.facing =
            Math.abs(vx) > Math.abs(vy)
              ? vx < 0
                ? "left"
                : "right"
              : vy < 0
                ? "up"
                : "down";
          s.anims.play(`walk-${n.facing}`, true);
        }
      }

      n.label.setPosition(s.x, s.y - s.displayHeight - 2);
    }
  }
}
