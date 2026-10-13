/** Pixel art as rows of characters; "." is transparent, other characters look up a palette. */
export type Sprite = readonly string[];
export type Palette = Readonly<Record<string, string>>;

export const HERO_CLASSES = ["knight", "mage", "archer", "cleric"] as const;
export type HeroClass = (typeof HERO_CLASSES)[number];

const SKIN = { S: "#f1c27d", E: "#2b2b2b" };

/** Hero bodies face right, 10x12; legs are drawn separately so they can walk. */
export const HEROES: Record<HeroClass, { sprite: Sprite; palette: Palette }> = {
  knight: {
    sprite: [
      "...HHHH...",
      "..HHHHHH.W",
      "..HSSSES.W",
      "..HSSSSS.W",
      "...SSSS..W",
      "..BBBBBB.W",
      ".BBBBBBBww",
      ".BbBBBBbS.",
      "..BBBBBB..",
      "..DDDDDD..",
      "..BBBBBB..",
      "..bb..bb..",
    ],
    palette: {
      ...SKIN,
      H: "#9aa3ad",
      B: "#3b6fc4",
      b: "#2a4f8f",
      D: "#6b4423",
      W: "#e6edf3",
      w: "#8b5a2b",
      L: "#2a3550",
    },
  },
  mage: {
    sprite: [
      ".....H...w",
      "....HHH..W",
      "...HHHHH.W",
      ".HHHHHHHHW",
      "..SSSSES.W",
      "...SSSS..W",
      "..BBBBBB.W",
      ".BBBBBBBSW",
      ".BbBBBBb.W",
      "..BBBBBB.W",
      "..BbBBbB..",
      ".BBBBBBBB.",
    ],
    palette: {
      ...SKIN,
      H: "#5b3590",
      B: "#7b4fbf",
      b: "#5a3590",
      W: "#8b5a2b",
      w: "#7ff3ff",
      L: "#3a2550",
    },
  },
  archer: {
    sprite: [
      "...HHHH...",
      "..HHHHHH..",
      ".HHSSSES..",
      ".HHSSSSS.W",
      "..HSSSS.Ww",
      "..BBBBBBWw",
      ".BBBBBBBSw",
      ".BbBBBBbWw",
      "..BBBBBB.W",
      "..DDDDDD..",
      "..BBBBBB..",
      "..bb..bb..",
    ],
    palette: {
      ...SKIN,
      H: "#3f7d3a",
      B: "#5a9a4a",
      b: "#3f6e33",
      D: "#6b4423",
      W: "#8b5a2b",
      w: "#e8e0c8",
      L: "#4a3a28",
    },
  },
  cleric: {
    sprite: [
      "...HHHH..w",
      "..HHHHHH.W",
      "..HSSSES.W",
      "..HSSSSS.W",
      "...SSSS..W",
      "..BBhBBB.W",
      ".BBhhhBBSW",
      ".BbBhBBb.W",
      "..BBBBBB.W",
      "..DDDDDD.W",
      "..BBBBBB..",
      "..bb..bb..",
    ],
    palette: {
      ...SKIN,
      H: "#e8e4da",
      B: "#f2efe6",
      b: "#cfc8b6",
      h: "#e0b040",
      D: "#c9a227",
      W: "#c9a227",
      w: "#fff6a0",
      L: "#6b6250",
    },
  },
};

/** Two walking frames and a standing frame, 10x3, drawn under a hero body. */
export const LEGS: readonly Sprite[] = [
  ["...LL.LL..", "...LL.LL..", "..LLL.LLL."],
  ["...LL.LL..", "..LL...LL.", ".LLL...LLL"],
  ["....LLL...", "....LLL...", "...LLLLL.."],
];

export const MONSTER_KINDS = ["slime", "scorpion", "mummy"] as const;
export type MonsterKind = (typeof MONSTER_KINDS)[number];

/** Monsters face left, toward the party. */
export const MONSTERS: Record<MonsterKind, { sprite: Sprite; palette: Palette }> = {
  slime: {
    sprite: [
      "....GGGG....",
      "..GGGGGGGG..",
      ".GgGGGGGGGG.",
      ".GEGGEGGGGG.",
      "GGEGGEGGGGGG",
      "GGGGGGGGGGGG",
      "GGGGGGGGGGGG",
      ".gggggggggg.",
    ],
    palette: { G: "#7bbf6a", g: "#4f8f45", E: "#2b2b2b" },
  },
  scorpion: {
    sprite: [
      "........TTT...",
      ".......t..TT..",
      "...........T..",
      "...........T..",
      "CC..BBBBBBTT..",
      "C.EBBBBBBBB...",
      "CCBBBBBBBBBB..",
      "..L.L.L.L.L...",
    ],
    palette: { T: "#8a3b2a", t: "#2b2b2b", B: "#a8482f", C: "#8a3b2a", E: "#ffe066", L: "#5e2a1e" },
  },
  mummy: {
    sprite: [
      "...MMMM...",
      "..MMmMMM..",
      "..EMMEMM..",
      "..MmMMMM..",
      "...MMMM...",
      "MMMMmMMM..",
      "mMMMMMmM..",
      "...MMmMM..",
      "...MmMMM..",
      "...MMMmM..",
      "...MM.MM..",
      "...mM.Mm..",
      "...MM.MM..",
      "..mMM.MMm.",
    ],
    palette: { M: "#d8cfb4", m: "#a99f86", E: "#e04040" },
  },
};

/** 5x5 icons shown in speech bubbles at camp. */
export const ICONS = {
  heart: { sprite: [".R.R.", "RRRRR", "RRRRR", ".RRR.", "..R.."], palette: { R: "#d8404a" } },
  note: { sprite: ["..KKK", "..K.K", "..K.K", "KKK.K", "KK..."], palette: { K: "#2b2b2b" } },
  zzz: { sprite: ["KKKK.", "..K..", ".K...", "KKKK.", "....."], palette: { K: "#4a62a8" } },
  meat: {
    sprite: ["..MMM", ".MMMM", ".MMM.", "W.M..", ".W..."],
    palette: { M: "#a4502c", W: "#f2efe6" },
  },
  star: { sprite: ["..Y..", ".YYY.", "YYYYY", ".YYY.", ".Y.Y."], palette: { Y: "#e0b040" } },
  dots: { sprite: [".....", ".....", "K.K.K", ".....", "....."], palette: { K: "#2b2b2b" } },
} satisfies Record<string, { sprite: Sprite; palette: Palette }>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** Draws a sprite with its top-left at (x, y), optionally mirrored or as a flat silhouette. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  palette: Palette,
  x: number,
  y: number,
  opts: { flip?: boolean; tint?: string } = {},
): void {
  x = Math.round(x);
  y = Math.round(y);
  sprite.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const color = opts.tint ?? palette[row.charAt(c)];
      if (row.charAt(c) === "." || color === undefined) continue;
      ctx.fillStyle = color;
      ctx.fillRect(opts.flip ? x + row.length - 1 - c : x + c, y + r, 1, 1);
    }
  });
}
