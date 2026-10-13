import {
  drawSprite,
  HEROES,
  type HeroClass,
  ICON_NAMES,
  ICONS,
  type IconName,
  LEGS,
  MONSTER_KINDS,
  MONSTERS,
  type Sprite,
} from "./sprites";

export const W = 200;
export const H = 96;
const GROUND = 76;
/** Where the sky ends; dunes cover what is below it. */
const HORIZON = 60;

export interface Member {
  name: string;
  cls: HeroClass;
}

export type SceneMode = "idle" | "quest" | "camp";
export type SkyKind = "day" | "dusk" | "night";

export interface SceneInput {
  mode: SceneMode;
  sky: SkyKind;
  /** Ms into the current phase; the story is a pure function of it. */
  storyMs: number;
  party: readonly Member[];
  paused: boolean;
}

// A focus session is a loop of walking, meeting a monster, and fighting it.
export const WALK_MS = 20_000;
const FIGHT_MS = 8_000;
export const CYCLE_MS = 30_000;
const HIT_MS = 500;
/** Ground scroll speed in px per ms. */
const SPEED = 0.012;
const MONSTER_X = 128;

/** Monsters beaten after this much focus time. */
export function foesFelled(focusMs: number): number {
  return Math.floor(focusMs / CYCLE_MS);
}

function hash(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca77);
  x ^= x >>> 13;
  return x >>> 0;
}

function distance(storyMs: number): number {
  const cycles = Math.floor(storyMs / CYCLE_MS);
  return (cycles * WALK_MS + Math.min(storyMs % CYCLE_MS, WALK_MS)) * SPEED;
}

const SKY: Record<SkyKind, readonly string[]> = {
  day: ["#8fd3f0", "#a6dcef", "#c3e6ea", "#e2ecd9", "#f6e3b8"],
  dusk: ["#2d3a7a", "#5b4a8f", "#a0558f", "#e0766a", "#f2a65a"],
  night: ["#070b26", "#0d1438", "#141c48", "#1d2556", "#283063"],
};

const TINT: Record<SkyKind, string | null> = {
  day: null,
  dusk: "rgba(90, 40, 110, 0.22)",
  night: "rgba(10, 16, 60, 0.5)",
};

const CACTUS: Sprite = [
  "...C...",
  "..CCC..",
  "..CCC.C",
  "C.CCC.C",
  "C.CCCCC",
  "CCCCC..",
  "..CCC..",
  "..CCC..",
  "..CCC..",
  "..CCC..",
];

const SIGN: Sprite = [
  "PPPPPPPPP.",
  "PppppppPPP",
  "PPPPPPPPP.",
  "....P.....",
  "....P.....",
  "....P.....",
  "....P.....",
];

function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

function drawDunes(
  ctx: CanvasRenderingContext2D,
  offset: number,
  base: number,
  amp: number,
  seed: number,
  color: string,
) {
  ctx.fillStyle = color;
  for (let x = 0; x < W; x++) {
    const wx = x + offset;
    const top = Math.round(
      base - amp * (Math.sin(wx * 0.02 + seed) + 0.5 * Math.sin(wx * 0.047 + seed * 2)),
    );
    ctx.fillRect(x, top, 1, GROUND - top);
  }
}

function drawGround(ctx: CanvasRenderingContext2D, offset: number) {
  ctx.fillStyle = "#efcf8f";
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = "#d9b06a";
  ctx.fillRect(0, GROUND, W, 1);
  ctx.fillStyle = "#c9a465";
  const tile = 23;
  for (let i = Math.floor(offset / tile) - 1; i * tile - offset < W + tile; i++) {
    const h = hash(i);
    ctx.fillRect(Math.round(i * tile + (h % 17) - offset), GROUND + 3 + (h % 16), 2 + (h % 2), 1);
  }
}

function drawCacti(ctx: CanvasRenderingContext2D, offset: number) {
  const tile = 140;
  for (let i = Math.floor(offset / tile) - 1; i * tile - offset < W + tile; i++) {
    const h = hash(i * 13 + 5);
    if (h % 2) continue;
    drawSprite(ctx, CACTUS, { C: "#6f9a48" }, i * tile + (h % 60) - offset, GROUND - 13);
  }
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  m: Member,
  x: number,
  feetY: number,
  opts: { legs?: Sprite; flip?: boolean; lift?: number } = {},
) {
  const hero = HEROES[m.cls];
  const top = feetY - 15 - (opts.lift ?? 0);
  const flip = opts.flip ?? false;
  drawSprite(ctx, hero.sprite, hero.palette, x, top, { flip });
  if (opts.legs) drawSprite(ctx, opts.legs, hero.palette, x, top + 12, { flip });
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  icon: Sprite,
  pal: Record<string, string>,
) {
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(x, y, 9, 9);
  ctx.fillRect(x + 2, y + 9, 2, 2);
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(x + 1, y + 1, 7, 7);
  ctx.fillRect(x + 2, y + 8, 1, 1);
  drawSprite(ctx, icon, pal, x + 2, y + 2);
}

const STRIKE: Record<HeroClass, string> = {
  knight: "#ffffff",
  mage: "#7ff3ff",
  archer: "#e8e0c8",
  cleric: "#fff6a0",
};

function drawQuest(ctx: CanvasRenderingContext2D, input: SceneInput, anim: number) {
  const { party, storyMs } = input;
  const idle = input.mode === "idle";
  const cycle = Math.floor(storyMs / CYCLE_MS);
  const c = storyMs % CYCLE_MS;
  const walking = !idle && !input.paused && c < WALK_MS;
  const fightT = c - WALK_MS;
  const fighting = !idle && fightT >= 0 && fightT < FIGHT_MS;
  const offset = distance(storyMs);

  drawDunes(ctx, offset * 0.15, 52, 6, 1, "#dcae6a");
  drawDunes(ctx, offset * 0.4, 64, 4, 4, "#e8bf7c");
  drawCacti(ctx, offset * 0.7);
  drawGround(ctx, offset);
  if (idle) drawSprite(ctx, SIGN, { P: "#8b5a2b", p: "#5e3a1a" }, 128, GROUND - 7);

  const hit = Math.floor(fightT / HIT_MS);
  const hitP = (fightT % HIT_MS) / HIT_MS;
  const attacker = fighting ? hit % party.length : -1;
  const legs = walking ? LEGS[1 + (Math.floor(anim / 160) % 2)] : LEGS[0];

  party.forEach((m, i) => {
    const lunge = i === attacker ? Math.round(Math.sin(hitP * Math.PI) * 5) : 0;
    const bob = walking && Math.floor(anim / 160) % 2 ? 1 : 0;
    drawHero(ctx, m, 100 - i * 18 + lunge, GROUND, legs ? { legs, lift: bob } : { lift: bob });
  });

  if (idle) return;
  const kind = MONSTER_KINDS[hash(cycle) % MONSTER_KINDS.length] ?? "slime";
  const monster = MONSTERS[kind];
  const mh = monster.sprite.length;

  if (fightT >= FIGHT_MS) {
    // The monster is gone: a puff of smoke and a coin.
    const p = (fightT - FIGHT_MS) / (CYCLE_MS - WALK_MS - FIGHT_MS);
    ctx.fillStyle = `rgba(240, 236, 226, ${1 - p})`;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      disc(
        ctx,
        MONSTER_X + 6 + Math.round(Math.cos(a) * p * 12),
        GROUND - 6 + Math.round(Math.sin(a) * p * 8),
        3,
        ctx.fillStyle,
      );
    }
    disc(ctx, MONSTER_X + 6, Math.round(GROUND - 12 - p * 20), 2, "#e0b040");
    return;
  }

  let mx = c < WALK_MS ? MONSTER_X + (WALK_MS - c) * SPEED : MONSTER_X;
  if (fighting && hit % 4 === 3) mx -= Math.round(Math.sin(hitP * Math.PI) * 6);
  if (mx >= W) return;
  const flash = fighting && hitP > 0.4 && hitP < 0.6;
  const wobble = Math.floor(anim / 300) % 2;
  drawSprite(
    ctx,
    monster.sprite,
    monster.palette,
    mx,
    GROUND - mh + (kind === "slime" ? wobble : 0),
    flash ? { tint: "#ffffff" } : {},
  );

  if (!fighting) return;
  const hp = 1 - fightT / FIGHT_MS;
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(MONSTER_X - 1, GROUND - mh - 6, 16, 3);
  ctx.fillStyle = "#d8404a";
  ctx.fillRect(MONSTER_X, GROUND - mh - 5, Math.max(1, Math.round(14 * hp)), 1);

  const m = party[attacker];
  if (!m || hitP < 0.3 || hitP > 0.8) return;
  ctx.fillStyle = STRIKE[m.cls];
  const cx = MONSTER_X + 5;
  const cy = GROUND - Math.round(mh / 2);
  for (let k = 0; k < 5; k++) {
    const h = hash(hit * 31 + k);
    ctx.fillRect(cx + (h % 9) - 4, cy + ((h >>> 4) % 9) - 4, 1 + (k % 2), 1 + (k % 2));
  }
  if (m.cls === "knight") for (let k = 0; k < 6; k++) ctx.fillRect(cx - 3 + k, cy - 3 + k, 1, 1);
}

const SEATS = [
  { x: 96, flip: false },
  { x: 136, flip: true },
  { x: 78, flip: false },
  { x: 154, flip: true },
];
const FIRE_X = 121;
const SLOT_MS = 6_000;

function drawCamp(ctx: CanvasRenderingContext2D, input: SceneInput, anim: number) {
  const { party } = input;
  drawDunes(ctx, 900, 52, 6, 1, "#dcae6a");
  drawDunes(ctx, 900, 64, 4, 4, "#e8bf7c");
  drawCacti(ctx, 600);
  drawGround(ctx, 0);

  // Tent.
  const tentX = 36;
  for (let r = 0; r < 20; r++) {
    const w = Math.round(r * 1.4);
    ctx.fillStyle = "#b5543a";
    ctx.fillRect(tentX - w, GROUND - 20 + r, w * 2 + 1, 1);
    if (r > 7) {
      ctx.fillStyle = "#6e2f22";
      const d = Math.round((r - 7) * 0.6);
      ctx.fillRect(tentX - d, GROUND - 20 + r, d * 2 + 1, 1);
    }
  }
  ctx.fillStyle = "#5e3a1a";
  ctx.fillRect(tentX, GROUND - 23, 1, 3);

  const talk = campTalk(input);
  party.forEach((m, i) => {
    const seat = SEATS[i];
    if (!seat) return;
    ctx.fillStyle = "#7a4a26";
    ctx.fillRect(seat.x - 1, GROUND - 3, 12, 3);
    const singing = i === talk.who && talk.icon === "note" && Math.floor(anim / 250) % 2 === 0;
    drawHero(ctx, m, seat.x, GROUND + 1, { flip: seat.flip, lift: singing ? 1 : 0 });
  });
}

/** Every few seconds someone at camp says something, shown as an icon. */
function campTalk(input: SceneInput): { who: number; icon: IconName; showing: boolean } {
  const slot = Math.floor(input.storyMs / SLOT_MS);
  const sleepy = input.sky === "night" && hash(slot + 99) % 3 === 0;
  return {
    who: hash(slot) % input.party.length,
    icon: sleepy ? "zzz" : (ICON_NAMES[hash(slot * 7 + 3) % ICON_NAMES.length] ?? "dots"),
    showing: input.storyMs % SLOT_MS < SLOT_MS - 1_500,
  };
}

function drawCampTalk(ctx: CanvasRenderingContext2D, input: SceneInput) {
  const talk = campTalk(input);
  const seat = SEATS[talk.who];
  if (!seat || !talk.showing) return;
  const icon = ICONS[talk.icon];
  drawBubble(ctx, seat.flip ? seat.x - 4 : seat.x + 5, GROUND - 26, icon.sprite, icon.palette);
}

function drawFire(ctx: CanvasRenderingContext2D, anim: number) {
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(FIRE_X, GROUND - 4, 2, FIRE_X, GROUND - 4, 40);
  glow.addColorStop(0, "rgba(255, 150, 60, 0.35)");
  glow.addColorStop(1, "rgba(255, 150, 60, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(FIRE_X - 40, GROUND - 44, 80, H);
  ctx.globalCompositeOperation = "source-over";

  ctx.fillStyle = "#5e3a1a";
  ctx.fillRect(FIRE_X - 5, GROUND - 2, 11, 2);
  ctx.fillStyle = "#7a4a26";
  ctx.fillRect(FIRE_X - 3, GROUND - 3, 7, 1);
  const frame = Math.floor(anim / 90);
  for (let i = 0; i < 5; i++) {
    const h = 3 + (hash(frame * 5 + i) % 6) - Math.abs(i - 2);
    const x = FIRE_X - 2 + i;
    ctx.fillStyle = "#ffd25a";
    ctx.fillRect(x, GROUND - 3 - h, 1, h);
    ctx.fillStyle = "#ff7b3a";
    ctx.fillRect(x, GROUND - 3 - h, 1, Math.ceil(h / 2));
  }
}

function drawSky(ctx: CanvasRenderingContext2D, sky: SkyKind, anim: number) {
  // Called with "destination-over", so each draw lands behind what is already there.
  if (sky === "day") disc(ctx, 165, 18, 8, "#fff2b0");
  if (sky === "dusk") disc(ctx, 158, 50, 11, "#ffb35a");
  if (sky === "night") {
    disc(ctx, 40, 16, 6, "#f4f1de");
    for (let k = 0; k < 30; k++) {
      const h = hash(k + 500);
      const twinkle = hash(k + Math.floor(anim / 700)) % 7 === 0;
      ctx.fillStyle = twinkle ? "#8088b8" : "#e8ecff";
      ctx.fillRect(h % W, (h >>> 9) % HORIZON, 1, 1);
    }
  }
  const bands = SKY[sky];
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      0,
      Math.round((i * HORIZON) / bands.length),
      W,
      i === bands.length - 1 ? H : HORIZON / bands.length + 1,
    );
  });
}

export function drawScene(ctx: CanvasRenderingContext2D, input: SceneInput, anim: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);

  if (input.mode === "camp") drawCamp(ctx, input, anim);
  else drawQuest(ctx, input, anim);

  const tint = TINT[input.sky];
  if (tint) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "destination-over";
  drawSky(ctx, input.sky, anim);
  ctx.globalCompositeOperation = "source-over";

  if (input.mode === "camp") {
    drawFire(ctx, anim);
    drawCampTalk(ctx, input);
  }
}
