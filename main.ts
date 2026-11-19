// gta6-meme-x-01 — "Post a GTA 6 meme on X" (make.fun bounty).
//
// main.ts (Node 22, standard library only, no network) draws the meme picture
// from scratch — a flat-cartoon living-room scene — and writes it as meme.png,
// then copies POST.json to /output, where the gate reads it (that is all the
// kit's starter does; this entry additionally generates its own meme image).
//
// The meme: GTA 6 launch night. A player on the couch, sunglasses on indoors,
// controller in hand, phone buzzing "BOSS" on the coffee table, and make.fun's
// ghost mascot floating beside him on the couch, playing along and holding its
// magenta coin with the white star. The TV glows with a Vice City sunset and
// "GTA VI". Top caption: "GTA 6 IS OUT TODAY". Bottom caption: "BOSS, I CAUGHT
// THE LEONIDA FLU".
//
// Run it locally:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
// (with MAKEFUN_OUTPUT_DIR=. it writes meme.png into the repository root.)
//
// Outside the grader's container, MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR stand
// in for /bot and /output.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------------------
// Tiny raster canvas: a 1024x1024 RGB buffer with shape helpers.
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

const img = new Uint8Array(W * H * 3);

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
}

function blendPx(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  if (a >= 1) return setPx(x, y, c);
  const i = (y * W + x) * 3;
  img[i] = Math.round(img[i] * (1 - a) + c[0] * a);
  img[i + 1] = Math.round(img[i + 1] * (1 - a) + c[1] * a);
  img[i + 2] = Math.round(img[i + 2] * (1 - a) + c[2] * a);
}

function fill(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    img[i * 3] = c[0];
    img[i * 3 + 1] = c[1];
    img[i * 3 + 2] = c[2];
  }
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
  }
}

function rectA(x: number, y: number, w: number, h: number, c: RGB, a: number): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) blendPx(xx, yy, c, a);
  }
}

// Vertical gradient inside a rectangle, from c1 (top) to c2 (bottom).
function vgrad(x: number, y: number, w: number, h: number, c1: RGB, c2: RGB): void {
  for (let yy = 0; yy < h; yy++) {
    const t = h <= 1 ? 0 : yy / (h - 1);
    const c: RGB = [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ];
    rect(x, y + yy, w, 1, c);
  }
}

// Three-stop vertical gradient.
function vgrad3(
  x: number, y: number, w: number, h: number,
  c1: RGB, c2: RGB, c3: RGB,
): void {
  const half = Math.floor(h / 2);
  vgrad(x, y, w, half, c1, c2);
  vgrad(x, y + half, w, h - half, c2, c3);
}

function circle(cx: number, cy: number, r: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) setPx(x, y, c);
    }
  }
}

function circleA(cx: number, cy: number, r: number, c: RGB, a: number): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) blendPx(x, y, c, a);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(x, y, c);
    }
  }
}

function ellipseA(cx: number, cy: number, rx: number, ry: number, c: RGB, a: number): void {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) blendPx(x, y, c, a);
    }
  }
}

// Filled polygon (even-odd scanline fill).
function poly(points: Array<[number, number]>, c: RGB): void {
  let minY = H - 1;
  let maxY = 0;
  for (const [, y] of points) {
    minY = Math.min(minY, Math.floor(y));
    maxY = Math.max(maxY, Math.ceil(y));
  }
  minY = Math.max(0, minY);
  maxY = Math.min(H - 1, maxY);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y + 0.5 - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) setPx(x, y, c);
    }
  }
}

// Thick line drawn as a chain of discs.
function thickLine(
  x0: number, y0: number, x1: number, y1: number, t: number, c: RGB,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / Math.max(1, t / 3)));
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    circle(x0 + dx * s, y0 + dy * s, t / 2, c);
  }
}

// Rounded rectangle: rect + corner discs.
function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  rect(x + r, y, w - 2 * r, h, c);
  rect(x, y + r, w, h - 2 * r, c);
  circle(x + r, y + r, r, c);
  circle(x + w - r, y + r, r, c);
  circle(x + r, y + h - r, r, c);
  circle(x + w - r, y + h - r, r, c);
}

// N-pointed star polygon.
function star(cx: number, cy: number, rO: number, rI: number, n: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rO : rI;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  poly(pts, c);
}

// Four-pointed sparkle (the make.fun ghost's eyes).
function sparkle(cx: number, cy: number, r: number, c: RGB): void {
  const k = 0.24;
  poly(
    [
      [cx, cy - r],
      [cx + r * k, cy - r * k],
      [cx + r, cy],
      [cx + r * k, cy + r * k],
      [cx, cy + r],
      [cx - r * k, cy + r * k],
      [cx - r, cy],
      [cx - r * k, cy - r * k],
    ],
    c,
  );
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGB, 8-bit, filter 0) — node:zlib does the deflate.
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: None
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(
      raw,
      y * (width * 3 + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font (Impact-style meme caps) + outlined text rendering.
// Each glyph is 7 rows of 5 cells; '#' is on, '.' is off.
// ---------------------------------------------------------------------------

const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  ',': ['.....', '.....', '.....', '.....', '.....', '.##..', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.##.', '#....', '.###.'],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

// Draw one glyph's filled cells as scale x scale blocks, at pixel offset.
function drawGlyph(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = FONT[ch] ?? FONT['?'];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (g[row][col] === '#') {
        rect(x + col * scale, y + row * scale, scale, scale, c);
      }
    }
  }
}

// Draw a string left-aligned at (x, y) in one colour.
function drawTextAt(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    drawGlyph(ch, cx, y, scale, c);
    cx += 6 * scale;
  }
}

// Draw a centred string with a thick outline (meme-caption style): the outline
// colour is stamped at eight offsets around the fill, then the fill on top.
function drawCaption(
  s: string, cx: number, y: number, scale: number, fillC: RGB, outlineC: RGB,
): void {
  const w = textWidth(s, scale);
  const x = Math.round(cx - w / 2);
  const o = Math.max(2, Math.round(scale / 3.5));
  for (const [dx, dy] of [
    [-o, 0], [o, 0], [0, -o], [0, o],
    [-o, -o], [o, -o], [-o, o], [o, o],
  ] as Array<[number, number]>) {
    drawTextAt(s, x + dx, y + dy, scale, outlineC);
  }
  drawTextAt(s, x, y, scale, fillC);
}

// ---------------------------------------------------------------------------
// Colours.
// ---------------------------------------------------------------------------

const INK: RGB = [25, 20, 25]; // near-black outline (make.fun wordmark ink)
const MAGENTA: RGB = [196, 28, 131]; // make.fun magenta (press mark disc/coin)
const WHITE: RGB = [255, 255, 255];
const CREAM: RGB = [255, 240, 214];

// ---------------------------------------------------------------------------
// make.fun's ghost mascot, drawn from the press mark (mark-1024.png): a white
// ghost with a thick black outline, two black four-pointed sparkle eyes, a
// round little hand, holding a magenta coin with a white star. Drawn at
// (cx, top) with body width `w`; the ghost floats, its wavy hem at the bottom.
// ---------------------------------------------------------------------------

function drawGhost(cx: number, top: number, w: number): void {
  const r = w / 2; // half-width of the body
  const domeY = top + r; // centre of the dome's circle
  const bodyBottom = top + w * 1.12;
  const hemY = bodyBottom - r * 0.28;
  const outline = Math.max(5, Math.round(w * 0.055));

  // --- black outline silhouette (dome + body + two hem lobes) ---
  circle(cx, domeY, r, INK);
  rect(cx - r, domeY, w, hemY - domeY, INK);
  circle(cx - r / 2, hemY, r / 2, INK);
  circle(cx + r / 2, hemY, r / 2, INK);

  // --- white body, inset by the outline ---
  const r2 = r - outline;
  const domeY2 = domeY;
  const hemY2 = hemY - outline * 0.4;
  circle(cx, domeY2, r2, WHITE);
  rect(cx - r2, domeY2, r2 * 2, hemY2 - domeY2, WHITE);
  circle(cx - r2 / 2, hemY2, r2 / 2, WHITE);
  circle(cx + r2 / 2, hemY2, r2 / 2, WHITE);

  // --- little notch in the hem, as in the logo ---
  roundRect(cx - outline * 0.45, hemY2 + r2 * 0.18, outline * 0.9, r2 * 0.34, outline * 0.45, INK);

  // --- sparkle eyes ---
  const eyeY = domeY - r * 0.08;
  const eyeR = r * 0.26;
  sparkle(cx - r * 0.38, eyeY, eyeR, INK);
  sparkle(cx + r * 0.38, eyeY, eyeR, INK);

  // --- left arm nub (small white bump with black outline) ---
  const armY = domeY + r * 0.55;
  circle(cx - r * 0.98, armY, r * 0.2, INK);
  circle(cx - r * 0.94, armY, r * 0.2 - outline * 0.5, WHITE);

  // --- right hand: round white hand with black outline, holding the coin ---
  const handX = cx + r * 0.98;
  const handY = domeY + r * 0.62;
  const handR = r * 0.3;
  circle(handX, handY, handR, INK);
  circle(handX, handY, handR - outline * 0.55, WHITE);

  // --- magenta coin with a white star, held up by the hand ---
  const coinX = handX + handR * 0.55;
  const coinY = handY - handR * 1.15;
  const coinR = r * 0.34;
  circle(coinX, coinY, coinR, INK);
  circle(coinX, coinY, coinR - outline * 0.5, MAGENTA);
  star(coinX, coinY, coinR * 0.62, coinR * 0.26, 5, WHITE);
}

// ---------------------------------------------------------------------------
// A palm-tree silhouette (for the TV's Vice City sunset).
// ---------------------------------------------------------------------------

function drawPalm(x: number, baseY: number, h: number, c: RGB, lean: number): void {
  const topX = x + lean;
  const topY = baseY - h;
  // Trunk: a slightly curved stack of segments.
  const segs = 8;
  let px0 = x;
  let py0 = baseY;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const px1 = x + lean * t * t + Math.sin(t * 2.2) * 4;
    const py1 = baseY - h * t;
    thickLine(px0, py0, px1, py1, Math.max(4, 10 - t * 5), c);
    px0 = px1;
    py0 = py1;
  }
  // Fronds: five arcs fanning out from the crown.
  for (const [ang, len] of [
    [-160, 1.0], [-125, 1.15], [-90, 1.2], [-55, 1.15], [-20, 1.0],
  ] as Array<[number, number]>) {
    const rad = (ang * Math.PI) / 180;
    const ex = topX + Math.cos(rad) * h * 0.42 * len;
    const ey = topY + Math.sin(rad) * h * 0.3 * len + h * 0.1;
    thickLine(topX, topY, (topX + ex) / 2, (topY + ey) / 2 - h * 0.06, 5, c);
    thickLine((topX + ex) / 2, (topY + ey) / 2 - h * 0.06, ex, ey, 4, c);
  }
  // Coconuts.
  circle(topX - 5, topY + 6, 4, c);
  circle(topX + 6, topY + 7, 4, c);
}

// ---------------------------------------------------------------------------
// The player on the couch: sunglasses indoors, controller in hand.
// ---------------------------------------------------------------------------

function drawPlayer(cx: number, seatY: number): void {
  const skin: RGB = [232, 184, 138];
  const hoodie: RGB = [31, 138, 112];
  const hoodieDark: RGB = [22, 104, 84];
  const jeans: RGB = [58, 90, 140];
  const shoe: RGB = [240, 240, 240];

  // Legs (jeans) sticking out from under the couch seat, shoes on the floor.
  rect(cx - 58, seatY + 62, 46, 96, jeans);
  rect(cx + 12, seatY + 62, 46, 96, jeans);
  roundRect(cx - 62, seatY + 150, 54, 22, 8, shoe);
  roundRect(cx + 8, seatY + 150, 54, 22, 8, shoe);

  // Hoodie torso.
  roundRect(cx - 72, seatY - 72, 144, 140, 26, hoodie);
  // Hoodie pocket + drawstrings.
  roundRect(cx - 44, seatY + 18, 88, 44, 10, hoodieDark);
  thickLine(cx - 14, seatY - 58, cx - 10, seatY - 30, 4, WHITE);
  thickLine(cx + 14, seatY - 58, cx + 10, seatY - 30, 4, WHITE);

  // Arms reaching forward to the controller.
  thickLine(cx - 58, seatY - 40, cx - 30, seatY + 44, 26, hoodie);
  thickLine(cx + 58, seatY - 40, cx + 30, seatY + 44, 26, hoodie);

  // Controller.
  roundRect(cx - 46, seatY + 36, 92, 40, 14, INK);
  circle(cx - 28, seatY + 56, 7, [90, 90, 110]);
  circle(cx + 28, seatY + 56, 7, [90, 90, 110]);
  circle(cx + 12, seatY + 48, 4, MAGENTA);
  circle(cx + 24, seatY + 58, 4, [255, 210, 60]);

  // Head.
  circle(cx, seatY - 108, 44, skin);
  // Cap (Vice City nights call for a cap): dome + brim.
  ellipse(cx, seatY - 128, 46, 26, [196, 28, 131]);
  rect(cx - 46, seatY - 132, 92, 12, [196, 28, 131]);
  ellipse(cx, seatY - 146, 46, 16, [196, 28, 131]);
  circle(cx, seatY - 152, 7, WHITE);
  // Sunglasses (indoors, obviously).
  roundRect(cx - 40, seatY - 118, 80, 22, 9, INK);
  thickLine(cx - 40, seatY - 108, cx - 46, seatY - 104, 5, INK);
  thickLine(cx + 40, seatY - 108, cx + 46, seatY - 104, 5, INK);
  // Smug little grin.
  thickLine(cx - 12, seatY - 82, cx, seatY - 76, 4, INK);
  thickLine(cx, seatY - 76, cx + 14, seatY - 84, 4, INK);
}

// ---------------------------------------------------------------------------
// The scene: launch night in the living room.
// ---------------------------------------------------------------------------

function drawScene(): void {
  // Wall (deep purple night) and wood floor.
  vgrad(0, 0, W, 660, [38, 20, 68], [66, 38, 104]);
  vgrad(660, 660, W, H - 660, [138, 90, 51], [94, 58, 30]);
  // Floor planks.
  for (let y = 700; y < H; y += 46) rect(0, y, W, 3, [70, 42, 22]);
  rect(0, 660, W, 4, [52, 30, 16]);

  // Framed mini beach picture on the wall, right of the TV.
  roundRect(852, 196, 132, 96, 6, [20, 12, 30]);
  vgrad3(860, 204, 116, 80, [255, 170, 80], [255, 94, 138], [40, 120, 160]);
  circle(946, 226, 12, [255, 224, 138]);
  drawPalm(884, 284, 44, [30, 10, 50], 8);
  // Framed "WASTED"-style poster, left of the TV — a nod to the series.
  roundRect(40, 196, 132, 96, 6, [20, 12, 30]);
  rect(48, 204, 116, 80, [18, 18, 22]);
  drawTextAt('WASTED', 62, 232, 3, [220, 220, 220]);
  drawTextAt('EST. 2013', 66, 258, 2, [150, 150, 150]);

  // --- TV: a Vice City sunset, "GTA VI" on screen ---
  roundRect(212, 150, 600, 272, 10, [12, 10, 14]); // bezel
  rect(224, 162, 576, 248, [0, 0, 0]); // screen base
  vgrad3(224, 162, 576, 248, [255, 154, 60], [255, 94, 138], [123, 47, 190]);
  // Sun + glow.
  circleA(690, 330, 78, [255, 224, 138], 0.25);
  circle(690, 330, 46, [255, 224, 138]);
  // Sea at the bottom of the screen.
  vgrad(224, 356, 576, 54, [30, 110, 150], [16, 60, 110]);
  rect(224, 356, 576, 3, [255, 255, 255]);
  thickLine(260, 378, 420, 378, 3, [255, 255, 255]);
  thickLine(560, 392, 760, 392, 3, [255, 255, 255]);
  // Palm silhouettes.
  drawPalm(268, 410, 120, [38, 12, 58], 26);
  drawPalm(762, 410, 104, [38, 12, 58], -20);
  // On-screen titles.
  drawCaption('GTA VI', 512, 186, 8, WHITE, INK);
  drawTextAt('L E O N I D A', 512 - textWidth('L E O N I D A', 3) / 2, 268, 3, [255, 240, 200]);
  // TV glow on the wall.
  rectA(200, 138, 624, 296, [255, 150, 90], 0.06);
  // TV stand.
  rect(462, 422, 100, 12, [20, 12, 30]);

  // --- Couch ---
  // Back cushions.
  roundRect(110, 540, 804, 150, 22, [183, 62, 46]);
  roundRect(126, 556, 376, 118, 16, [217, 79, 61]);
  roundRect(522, 556, 376, 118, 16, [217, 79, 61]);
  rect(508, 556, 8, 118, [160, 52, 38]);
  // Seat + arms.
  roundRect(110, 674, 804, 96, 18, [201, 67, 50]);
  roundRect(110, 556, 74, 214, 20, [183, 62, 46]);
  roundRect(840, 556, 74, 214, 20, [183, 62, 46]);
  // Couch legs.
  rect(140, 770, 18, 26, [40, 24, 16]);
  rect(866, 770, 18, 26, [40, 24, 16]);

  // --- The players: a fan and make.fun's ghost, side by side ---
  // Soft shadows on the couch seat.
  ellipseA(300, 700, 90, 14, [0, 0, 0], 0.18);
  ellipseA(660, 700, 90, 14, [0, 0, 0], 0.18);
  drawPlayer(300, 690);
  drawGhost(660, 470, 200);

  // --- Coffee table: the boss is calling ---
  // Table top + legs.
  roundRect(300, 800, 424, 22, 8, [107, 66, 38]);
  rect(300, 800, 424, 5, [140, 90, 52]);
  rect(322, 822, 16, 42, [70, 44, 24]);
  rect(686, 822, 16, 42, [70, 44, 24]);
  // Buzzing phone: "BOSS" on screen.
  roundRect(352, 762, 74, 40, 8, INK);
  rect(358, 768, 62, 28, [30, 160, 80]);
  drawTextAt('BOSS', 366, 776, 2, WHITE);
  // Ringing arcs.
  thickLine(436, 768, 448, 760, 3, WHITE);
  thickLine(436, 790, 448, 798, 3, WHITE);
  thickLine(442, 764, 458, 752, 3, WHITE);
  thickLine(442, 794, 458, 806, 3, WHITE);
  // Soda can.
  roundRect(610, 758, 34, 44, 6, [196, 28, 131]);
  rect(610, 772, 34, 10, WHITE);
  circle(627, 758, 15, [220, 220, 220]);
  // Snack bowl.
  ellipse(500, 800, 34, 10, [240, 240, 240]);
  circle(488, 794, 7, [255, 200, 60]);
  circle(504, 790, 7, [255, 120, 60]);
  circle(516, 796, 7, [255, 200, 60]);
}

// ---------------------------------------------------------------------------
// Entry point: draw the meme, write meme.png, copy POST.json to /output.
// ---------------------------------------------------------------------------

function main(): void {
  fill([16, 8, 28]);
  drawScene();

  // Captions go on last, over the scene.
  drawCaption('GTA 6 IS OUT TODAY', W / 2, 26, 9, WHITE, INK);
  drawCaption('BOSS, I CAUGHT', W / 2, 878, 9, WHITE, INK);
  drawCaption('THE LEONIDA FLU', W / 2, 950, 9, WHITE, INK);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, 'meme.png'), encodePNG(W, H, img));
  try {
    copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
  } catch (err) {
    console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log(`meme.png written to ${join(OUTPUT_DIR, 'meme.png')}`);
  console.log(`POST.json copied to ${join(OUTPUT_DIR, 'POST.json')}`);
}

main();
