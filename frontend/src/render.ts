/**
 * STARFORGE renderer — all Canvas 2D art, procedural, no images.
 * Logical resolution 1280x800; caller sets transform so 1 unit = 1 logical px.
 */

export const LW = 1280;
export const LH = 800;

/** Closed palette (DESIGN.md §1). */
export const PAL = {
  void0: '#050510',
  void1: '#0d0b26',
  molten: '#ff6b1a',
  emberGold: '#ffb347',
  hotWhite: '#fff7e6',
  cyan: '#22d3ee',
  violet: '#8b5cf6',
  steel: '#e8e6f0',
  muted: '#8a87a3',
} as const;

export const MINERAL_COLORS = [
  '#b87333', // copper
  '#9aa5b1', // iron
  '#7dd3a8', // nickel
  '#c9d4e3', // silver
  '#f5c542', // gold
  '#e8fbff', // platinum
  '#8b5cf6', // neutronium
] as const;

export const MINERAL_NAMES = ['copper', 'iron', 'nickel', 'silver', 'gold', 'platinum', 'neutronium'] as const;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Deterministic PRNG for the static starfield. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star { x: number; y: number; r: number; tw: number; sp: number }
let starfield: Star[] | null = null;
let constLines: Array<[Star, Star]> | null = null;

function ensureStarfield(): void {
  if (starfield) return;
  const rnd = mulberry32(0x5eed);
  starfield = [];
  for (let i = 0; i < 200; i++) {
    starfield.push({ x: rnd() * LW, y: rnd() * LH, r: 0.4 + rnd() * 1.6, tw: rnd() * Math.PI * 2, sp: 0.2 + rnd() * 0.8 });
  }
  constLines = [];
  for (let i = 0; i < 26; i++) {
    const a = starfield[Math.floor(rnd() * starfield.length)]!;
    let best: Star | null = null;
    let bestD = 1e9;
    for (const b of starfield) {
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (b !== a && d < bestD && d < 220 * 220) {
        bestD = d;
        best = b;
      }
    }
    if (best) constLines.push([a, best]);
  }
}

// ---------------------------------------------------------------------------
// background
// ---------------------------------------------------------------------------

export interface BgOpts {
  shakeX?: number;
  shakeY?: number;
  flash?: number; // 0..1 white flash overlay
  reducedMotion?: boolean;
}

export function drawBackground(ctx: CanvasRenderingContext2D, t: number, o: BgOpts = {}): void {
  ensureStarfield();
  const sx = o.shakeX ?? 0;
  const sy = o.shakeY ?? 0;
  ctx.save();
  ctx.translate(sx, sy);

  // void gradient
  const g = ctx.createLinearGradient(0, 0, 0, LH);
  g.addColorStop(0, PAL.void0);
  g.addColorStop(1, PAL.void1);
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, LW + 40, LH + 40);

  // nebula blobs (slow drift)
  const drift = o.reducedMotion ? 0 : t * 0.008;
  const neb = (x: number, y: number, r: number, c1: string, c2: string, a: number) => {
    const ng = ctx.createRadialGradient(x, y, 0, x, y, r);
    ng.addColorStop(0, c1);
    ng.addColorStop(1, c2);
    ctx.globalAlpha = a;
    ctx.fillStyle = ng;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };
  neb(300 + Math.sin(drift * 2) * 30, 200, 420, 'rgba(139,92,246,0.55)', 'rgba(139,92,246,0)', 0.15);
  neb(1050 + Math.cos(drift * 1.6) * 40, 320, 460, 'rgba(255,107,26,0.5)', 'rgba(255,107,26,0)', 0.13);
  neb(680, 640, 380, 'rgba(139,92,246,0.4)', 'rgba(139,92,246,0)', 0.1);

  // constellation lines (faint)
  ctx.strokeStyle = 'rgba(139,92,246,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, b] of constLines!) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // starfield with parallax drift + twinkle
  for (const s of starfield!) {
    const px = (s.x + (o.reducedMotion ? 0 : t * 2 * s.sp)) % LW;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.tw));
    ctx.globalAlpha = tw * 0.9;
    ctx.fillStyle = '#dfe6ff';
    ctx.beginPath();
    ctx.arc(px, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // forge glow at bottom (flicker)
  const flick = o.reducedMotion ? 0.85 : 0.78 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 17.7);
  const fg = ctx.createRadialGradient(LW / 2, LH + 60, 0, LW / 2, LH + 60, 620);
  fg.addColorStop(0, `rgba(255,107,26,${0.34 * flick})`);
  fg.addColorStop(0.5, `rgba(255,107,26,${0.12 * flick})`);
  fg.addColorStop(1, 'rgba(255,107,26,0)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, LH - 480, LW, 480);

  // vignette
  const vg = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.35, LW / 2, LH / 2, LH * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2,2,8,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(-20, -20, LW + 40, LH + 40);

  ctx.restore();

  if (o.flash && o.flash > 0) {
    ctx.fillStyle = `rgba(255,247,230,${Math.min(1, o.flash)})`;
    ctx.fillRect(0, 0, LW, LH);
  }
}

// ---------------------------------------------------------------------------
// anvil slab
// ---------------------------------------------------------------------------

export function drawAnvil(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // slab
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#17162b');
  g.addColorStop(0.5, '#101024');
  g.addColorStop(1, '#0a0a1c');
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = g;
  ctx.fill();
  // metallic border
  const bg = ctx.createLinearGradient(x, y, x + w, y + h);
  bg.addColorStop(0, 'rgba(255,179,71,0.5)');
  bg.addColorStop(0.5, 'rgba(138,135,163,0.28)');
  bg.addColorStop(1, 'rgba(255,107,26,0.45)');
  ctx.strokeStyle = bg;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // rivets
  const rivet = (rx: number, ry: number) => {
    const rg = ctx.createRadialGradient(rx - 2, ry - 2, 0, rx, ry, 9);
    rg.addColorStop(0, '#ffe9c4');
    rg.addColorStop(0.5, '#8a6a3a');
    rg.addColorStop(1, '#2a1e10');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(rx, ry, 8, 0, Math.PI * 2);
    ctx.fill();
  };
  rivet(x + 20, y + 20);
  rivet(x + w - 20, y + 20);
  rivet(x + 20, y + h - 20);
  rivet(x + w - 20, y + h - 20);
}

// ---------------------------------------------------------------------------
// mineral glyphs (engraved, canvas paths — never color alone)
// ---------------------------------------------------------------------------

export function glyphPath(ctx: CanvasRenderingContext2D, sym: number, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  switch (sym) {
    case 0: // Cu △ triangle
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.95, cy + r * 0.75);
      ctx.lineTo(cx - r * 0.95, cy + r * 0.75);
      ctx.closePath();
      break;
    case 1: // Fe ▭ rectangle
      ctx.rect(cx - r * 0.8, cy - r * 0.55, r * 1.6, r * 1.1);
      break;
    case 2: // Ni ⬡ hexagon
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 3: // Ag ☾ crescent
      ctx.arc(cx, cy, r, Math.PI * 0.32, Math.PI * 1.68);
      ctx.arc(cx + r * 0.45, cy, r * 0.78, Math.PI * 1.62, Math.PI * 0.38, true);
      ctx.closePath();
      break;
    case 4: // Au ☉ sun: circle + rays
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      break;
    case 5: // Pt ✦ 4-point star
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx - r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy - r);
      break;
    case 6: // Nt ❖ diamond with inner diamond
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.8, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.8, cy);
      ctx.closePath();
      break;
  }
}

function drawSunRays(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}

// ---------------------------------------------------------------------------
// symbols
// ---------------------------------------------------------------------------

export interface SymbolOpts {
  alpha?: number;
  scale?: number;
  dim?: boolean;
  winGlow?: number; // 0..1 pulsing win highlight
  rot?: number; // override rotation (star)
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function drawMineral(ctx: CanvasRenderingContext2D, sym: number, cx: number, cy: number, size: number, t: number, o: SymbolOpts = {}): void {
  const base = MINERAL_COLORS[sym] ?? '#888';
  const s = size * (o.scale ?? 1);
  const half = s / 2;
  const r = s * 0.2;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.dim) ctx.globalAlpha *= 0.35;

  // drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  // beveled body
  const g = ctx.createLinearGradient(cx, cy - half, cx, cy + half);
  g.addColorStop(0, shade(base, 70));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, -70));
  roundRect(ctx, cx - half, cy - half, s, s, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // inner glow (top)
  const ig = ctx.createRadialGradient(cx, cy - half * 0.5, 0, cx, cy - half * 0.5, half * 1.1);
  ig.addColorStop(0, 'rgba(255,255,255,0.35)');
  ig.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, cx - half, cy - half, s, s, r);
  ctx.fillStyle = ig;
  ctx.fill();

  // rune notch (top edge)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy - half + 2);
  ctx.lineTo(cx + 9, cy - half + 2);
  ctx.lineTo(cx, cy - half + 12);
  ctx.closePath();
  ctx.fill();

  // neutronium aura
  if (sym === 6) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    ctx.save();
    ctx.globalAlpha = (o.alpha ?? 1) * (0.35 + 0.3 * pulse);
    ctx.strokeStyle = PAL.violet;
    ctx.lineWidth = 3 + 2 * pulse;
    roundRect(ctx, cx - half - 4, cy - half - 4, s + 8, s + 8, r + 4);
    ctx.stroke();
    ctx.restore();
  }

  // engraved glyph
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(2.5, s * 0.045);
  ctx.lineJoin = 'round';
  glyphPath(ctx, sym, cx, cy + 1.5, s * 0.24);
  ctx.stroke();
  ctx.strokeStyle = shade(base, 85);
  ctx.lineWidth = Math.max(1.5, s * 0.028);
  glyphPath(ctx, sym, cx, cy, s * 0.24);
  ctx.stroke();
  if (sym === 4) {
    ctx.strokeStyle = shade(base, 85);
    ctx.lineWidth = Math.max(1.5, s * 0.028);
    drawSunRays(ctx, cx, cy, s * 0.24);
    ctx.stroke();
  }
  ctx.restore();

  // win pulse glow
  if (o.winGlow && o.winGlow > 0) {
    ctx.save();
    ctx.globalAlpha = o.winGlow * 0.85;
    ctx.strokeStyle = PAL.hotWhite;
    ctx.lineWidth = 4;
    roundRect(ctx, cx - half - 3, cy - half - 3, s + 6, s + 6, r + 3);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = rot + (Math.PI / 5) * i - Math.PI / 2;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Scatter star: white-gold, radiating glow, slow rotation. */
export function drawScatterStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, t: number, o: SymbolOpts = {}): void {
  const r = (size / 2) * (o.scale ?? 1);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.dim) ctx.globalAlpha *= 0.35;
  const rot = o.rot ?? t * 0.5;
  // radiating glow
  const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
  gg.addColorStop(0, 'rgba(255,247,230,0.55)');
  gg.addColorStop(0.4, 'rgba(255,179,71,0.22)');
  gg.addColorStop(1, 'rgba(255,179,71,0)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  // body
  const bg = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  bg.addColorStop(0, '#fffdf4');
  bg.addColorStop(0.6, PAL.emberGold);
  bg.addColorStop(1, '#c77b1e');
  starPath(ctx, cx, cy, r, rot);
  ctx.fillStyle = bg;
  ctx.shadowColor = 'rgba(255,200,100,0.8)';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export function drawSymbol(ctx: CanvasRenderingContext2D, sym: number, cx: number, cy: number, size: number, t: number, o: SymbolOpts = {}): void {
  if (sym <= 6) drawMineral(ctx, sym, cx, cy, size, t, o);
  else drawScatterStar(ctx, cx, cy, size, t, o); // 7 = star (no wild in the final design)
}

// ---------------------------------------------------------------------------
// crucible vessel
// ---------------------------------------------------------------------------

export function drawCrucible(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, progress: number, t: number, flash: number, reducedMotion: boolean): void {
  const wall = 10;
  // vessel body
  const vg = ctx.createLinearGradient(x, y, x + w, y);
  vg.addColorStop(0, '#1b1a33');
  vg.addColorStop(0.5, '#2c2a4d');
  vg.addColorStop(1, '#141325');
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = vg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,179,71,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // liquid
  const ix = x + wall;
  const iw = w - wall * 2;
  const ih = h - wall * 2 - 8;
  const iy = y + wall + 4;
  const fillH = Math.max(0, Math.min(1, progress)) * ih;
  const surfY = iy + ih - fillH;
  if (fillH > 2) {
    ctx.save();
    roundRect(ctx, ix, iy, iw, ih, 14);
    ctx.clip();
    const lg = ctx.createLinearGradient(0, surfY, 0, iy + ih);
    lg.addColorStop(0, PAL.emberGold);
    lg.addColorStop(0.35, PAL.molten);
    lg.addColorStop(1, '#7a2400');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(ix, iy + ih);
    ctx.lineTo(ix, surfY);
    const amp = reducedMotion ? 0 : 5;
    const wl = iw / 3.2;
    for (let px = 0; px <= iw; px += 4) {
      const py = surfY + Math.sin(px / wl + t * 3.1) * amp + Math.sin(px / (wl * 0.5) - t * 4.3) * amp * 0.4;
      ctx.lineTo(ix + px, py);
    }
    ctx.lineTo(ix + iw, iy + ih);
    ctx.closePath();
    ctx.fill();
    // surface glow line
    ctx.strokeStyle = 'rgba(255,247,230,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= iw; px += 4) {
      const py = surfY + Math.sin(px / wl + t * 3.1) * amp + Math.sin(px / (wl * 0.5) - t * 4.3) * amp * 0.4;
      if (px === 0) ctx.moveTo(ix + px, py);
      else ctx.lineTo(ix + px, py);
    }
    ctx.stroke();
    // heat shimmer glow above liquid
    ctx.shadowColor = PAL.molten;
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(255,107,26,0.12)';
    ctx.fillRect(ix, surfY - 26, iw, 26);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // forge flash
  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, flash);
    roundRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = '#fff7e6';
    ctx.fill();
    ctx.restore();
  }
}
// ---------------------------------------------------------------------------
// supernova overlay — QUANTUM UNIVERSE pick bonus
// ---------------------------------------------------------------------------

export interface QuantumCube {
  x: number; // anchor: center of the cube
  y: number;
  prize: number; // hidden multiplier
  phase: 'idle' | 'shaking' | 'bursting' | 'revealed';
  picked: boolean;
  dim: boolean;
  dimT: number; // 0..1 quantum dissolve for unpicked cubes
  phaseT: number; // seconds in current phase
  ringT: number; // shockwave 0..1
  seed: number; // per-cube random offset
  appearDelay: number; // staggered materialization
  shown: number; // count-up display value
  tickAcc: number; // accumulator for count-up ticks
}

const qcClamp = (v: number): number => Math.max(0, Math.min(1, v));
const qcEaseOutCubic = (k: number): number => 1 - Math.pow(1 - k, 3);
const qcEaseOutBack = (k: number): number => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};

function qcFmtPrize(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** 12 quantum cubes in a 4x3 arc formation. */
export function quantumCubePositions(): Array<{ x: number; y: number }> {
  const pos: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const fx = col / 3; // 0..1
      const x = LW * (0.22 + fx * 0.56);
      const arc = Math.sin(fx * Math.PI) * -46;
      const y = LH * (0.3 + row * 0.17) + arc;
      pos.push({ x, y });
    }
  }
  return pos;
}

// ---- tiny 3D math for the pseudo-3D cubes ----------------------------------
type V3 = [number, number, number];
const CUBE_VERTS: V3[] = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
const CUBE_EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
const CUBE_FACES: number[][] = [
  [0, 1, 2, 3], [4, 5, 6, 7],
  [0, 1, 5, 4], [2, 3, 7, 6],
  [1, 2, 6, 5], [0, 3, 7, 4],
];

function qcRot(v: V3, rx: number, ry: number): V3 {
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x1 = v[0] * cy + v[2] * sy;
  const z1 = -v[0] * sy + v[2] * cy;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const y1 = v[1] * cx - z1 * sx;
  const z2 = v[1] * sx + z1 * cx;
  return [x1, y1, z2];
}

interface QProj { x: number; y: number; z: number }

function qcProject(cx: number, cy: number, r: number, rx: number, ry: number): QProj[] {
  return CUBE_VERTS.map(v => {
    const [x, y, z] = qcRot(v, rx, ry);
    const persp = 1 / (1 + z * 0.24);
    return { x: cx + x * r * persp, y: cy + y * r * persp, z };
  });
}

// ---- the other universe: background ----------------------------------------
interface QStar { x: number; y: number; r: number; tw: number; sp: number; hue: number }
interface QDust { x: number; y: number; r: number; sp: number; ph: number }
let qStars: QStar[] | null = null;
let qDust: QDust[] | null = null;

function ensureQuantumField(): void {
  if (qStars) return;
  const rnd = mulberry32(0x9e3779b9);
  qStars = [];
  for (let i = 0; i < 150; i++) {
    qStars.push({ x: rnd() * LW, y: rnd() * LH, r: 0.4 + rnd() * 1.7, tw: rnd() * 6.283, sp: 0.15 + rnd() * 0.85, hue: rnd() });
  }
  qDust = [];
  for (let i = 0; i < 46; i++) {
    qDust.push({ x: rnd() * LW, y: rnd() * LH, r: 1 + rnd() * 2.4, sp: 6 + rnd() * 14, ph: rnd() * 6.283 });
  }
}

const QCX = LW / 2;
const QCY = LH * 0.42;

function drawQuantumUniverse(
  ctx: CanvasRenderingContext2D,
  t: number,
  zoom: number,
  reducedMotion: boolean,
): void {
  ensureQuantumField();

  // 1. deep dimensional gradient: indigo -> magenta -> cyan depths
  const bg = ctx.createLinearGradient(0, 0, 0, LH);
  bg.addColorStop(0, '#070418');
  bg.addColorStop(0.45, '#150a35');
  bg.addColorStop(0.75, '#2b0f45');
  bg.addColorStop(1, '#041a26');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, LW, LH);

  // 2. drifting nebula blobs
  const blobs = [
    { dx: -380, dy: -140, r: 330, c: '139,92,246', a: 0.22, sp: 0.21 },
    { dx: 400, dy: 120, r: 370, c: '34,211,238', a: 0.14, sp: 0.16 },
    { dx: 40, dy: -210, r: 290, c: '217,70,239', a: 0.17, sp: 0.27 },
    { dx: -120, dy: 230, r: 260, c: '45,212,191', a: 0.1, sp: 0.19 },
  ];
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i]!;
    const bx = QCX + b.dx + (reducedMotion ? 0 : Math.sin(t * b.sp + i * 2.1) * 48);
    const by = QCY + b.dy + (reducedMotion ? 0 : Math.cos(t * b.sp * 0.8 + i * 1.3) * 36);
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, b.r);
    g.addColorStop(0, `rgba(${b.c},${b.a})`);
    g.addColorStop(1, `rgba(${b.c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LW, LH);
  }

  // 3. wormhole tunnel: concentric rotating energy rings
  const ringCols = ['34,211,238', '139,92,246', '217,70,239', '99,102,241', '45,212,191'];
  for (let i = 0; i < 5; i++) {
    const rr = 120 + i * 112 + (reducedMotion ? 0 : Math.sin(t * 1.1 + i * 1.7) * 14);
    ctx.save();
    ctx.translate(QCX, QCY);
    if (!reducedMotion) ctx.rotate(t * (0.1 + i * 0.045) * (i % 2 ? -1 : 1));
    ctx.setLineDash([26, 34, 8, 34]);
    if (!reducedMotion) ctx.lineDashOffset = -t * 60 * (i % 2 ? 1 : -1);
    const col = ringCols[i % ringCols.length]!;
    ctx.strokeStyle = `rgba(${col},${(0.36 - i * 0.05).toFixed(3)})`;
    ctx.lineWidth = 5 - i * 0.6;
    if (!reducedMotion) {
      ctx.shadowColor = `rgba(${col},0.8)`;
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, rr * 1.35, rr * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.setLineDash([]);

  // 4. distant stars with parallax drift + twinkle
  for (const s of qStars!) {
    let px = s.x - (reducedMotion ? 0 : t * 8 * s.sp);
    px = px % LW;
    if (px < 0) px += LW;
    const tw = reducedMotion ? 0.7 : 0.45 + 0.55 * Math.sin(t * 2.2 * s.sp + s.tw);
    const col = s.hue < 0.6 ? '223,230,255' : s.hue < 0.85 ? '190,242,255' : '240,200,255';
    ctx.fillStyle = `rgba(${col},${(0.2 + 0.6 * tw).toFixed(3)})`;
    ctx.fillRect(px, s.y, s.r, s.r);
  }

  // 5. cosmic dust rising
  if (!reducedMotion) {
    for (const d of qDust!) {
      let py = (d.y - t * d.sp) % LH;
      if (py < 0) py += LH;
      const dx = d.x + Math.sin(t * 0.5 + d.ph) * 22;
      const a = 0.1 + 0.08 * Math.sin(t * 1.3 + d.ph);
      ctx.fillStyle = `rgba(170,200,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(dx, py, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. tunnel inflow: light streaks flowing toward the wormhole core
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + t * 0.05;
      const k = (t * 0.7 + i * 0.37) % 1; // 0 far -> 1 near core
      const r = 580 + (220 - 580) * k;
      const x0 = QCX + Math.cos(a) * r * 1.35;
      const y0 = QCY + Math.sin(a) * r * 0.78;
      const x1 = QCX + Math.cos(a) * (r - 30) * 1.35;
      const y1 = QCY + Math.sin(a) * (r - 30) * 0.78;
      ctx.strokeStyle = `rgba(160,220,255,${((1 - k) * 0.5).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 7. entry warp streaks (the dimensional jump punch)
  if (!reducedMotion && zoom > 0) {
    ctx.save();
    ctx.lineWidth = 1.6;
    for (const s of starfieldForStreaks()) {
      const dx = s.x - QCX;
      const dy = s.y - QCY;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const lead = zoom * 130 * (0.4 + s.sp * 0.6);
      const x2 = s.x + ux * lead;
      const y2 = s.y + uy * lead;
      const a = Math.min(0.75, zoom * 0.8);
      const grad = ctx.createLinearGradient(s.x, s.y, x2, y2);
      grad.addColorStop(0, 'rgba(223,230,255,0)');
      grad.addColorStop(1, `rgba(223,230,255,${a.toFixed(3)})`);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

interface StreakStar { x: number; y: number; sp: number }
let streakStars: StreakStar[] | null = null;
function starfieldForStreaks(): StreakStar[] {
  if (!streakStars) {
    const rnd = mulberry32(0x5eed);
    streakStars = [];
    for (let i = 0; i < 200; i++) streakStars.push({ x: rnd() * LW, y: rnd() * LH, sp: 0.2 + rnd() * 0.8 });
  }
  return streakStars;
}

// ---- the quantum cube ------------------------------------------------------
function drawCubeBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  t: number,
  seed: number,
  reducedMotion: boolean,
  glitchPass: number, // -1 = normal; 0/1 = glitch color-split passes
): void {
  const P = qcProject(cx, cy, r, rx, ry);
  const at = (i: number): QProj => P[i]!;

  // translucent holographic faces, painter-ordered
  const fz = CUBE_FACES.map(f => f.reduce((s, i) => s + at(i).z, 0) / 4);
  const order = CUBE_FACES.map((_, i) => i).sort((a, b) => fz[a]! - fz[b]!);
  for (const fi of order) {
    const f = CUBE_FACES[fi]!;
    ctx.beginPath();
    ctx.moveTo(at(f[0]!).x, at(f[0]!).y);
    for (let k = 1; k < 4; k++) ctx.lineTo(at(f[k]!).x, at(f[k]!).y);
    ctx.closePath();
    ctx.fillStyle = glitchPass < 0 ? 'rgba(70,130,235,0.10)' : 'rgba(217,70,239,0.08)';
    ctx.fill();
  }

  // energy edges: cyan -> violet gradient per edge
  ctx.lineWidth = 2.6;
  if (!reducedMotion && glitchPass < 0) {
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 12;
  }
  for (const [a, b2] of CUBE_EDGES) {
    const A = at(a);
    const B = at(b2);
    if (glitchPass < 0) {
      const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      g.addColorStop(0, '#22d3ee');
      g.addColorStop(1, '#a855f7');
      ctx.strokeStyle = g;
    } else {
      ctx.strokeStyle = glitchPass === 0 ? 'rgba(217,70,239,0.85)' : 'rgba(34,211,238,0.85)';
    }
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // inner energy core: pulsing plasma heart
  let px = 0;
  let py = 0;
  for (const p of P) { px += p.x; py += p.y; }
  px /= 8; py /= 8;
  const pulse = reducedMotion ? 0.9 : 0.78 + 0.32 * Math.sin(t * 5 + seed * 6.283);
  const cr = r * 0.52 * pulse;
  const cg = ctx.createRadialGradient(px, py, 0, px, py, cr);
  cg.addColorStop(0, 'rgba(255,255,255,0.95)');
  cg.addColorStop(0.4, 'rgba(160,240,255,0.55)');
  cg.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(px, py, cr, 0, Math.PI * 2);
  ctx.fill();

  if (!reducedMotion) {
    // holographic scanlines across the cube
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - r * 1.15, cy - r * 1.15, r * 2.3, r * 2.3);
    ctx.clip();
    ctx.fillStyle = 'rgba(190,245,255,0.10)';
    const scanY = cy - r + ((t * 46 + seed * 300) % (r * 2));
    ctx.fillRect(cx - r * 1.15, scanY, r * 2.3, 3);
    ctx.fillStyle = 'rgba(190,245,255,0.05)';
    for (let i = 0; i < 5; i++) ctx.fillRect(cx - r * 1.15, cy - r + i * (r * 0.42), r * 2.3, 1.5);
    ctx.restore();

    // orbiting sparks: electrons around the cube
    for (let i = 0; i < 3; i++) {
      const oa = t * (1.15 + i * 0.38) + seed * 6.283 + i * 2.094;
      const orad = r * (1.75 + 0.18 * Math.sin(t * 1.7 + i * 2));
      const ox = cx + Math.cos(oa) * orad;
      const oy = cy + Math.sin(oa) * orad * 0.55;
      const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, 9);
      og.addColorStop(0, 'rgba(255,255,255,0.95)');
      og.addColorStop(0.4, 'rgba(140,230,255,0.6)');
      og.addColorStop(1, 'rgba(140,230,255,0)');
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(ox, oy, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // electron orbit ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.strokeStyle = 'rgba(140,230,255,0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.85, r * 1.02, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** Shattering: the 12 edges explode outward as light shards. */
function drawCubeShatter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  phaseT: number,
  t: number,
  seed: number,
  reducedMotion: boolean,
): void {
  const P = qcProject(cx, cy, r, rx, ry);
  const at = (i: number): QProj => P[i]!;
  const k = qcClamp(phaseT / 0.7);
  const fly = qcEaseOutCubic(k) * 240;
  const rot = (reducedMotion ? 0 : phaseT * 3.2) + seed * 6.283;
  const fade = 1 - k;

  // core flash
  if (k < 0.5) {
    const fa = (1 - k * 2) * 0.85;
    const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3);
    fg.addColorStop(0, `rgba(255,255,255,${fa.toFixed(3)})`);
    fg.addColorStop(1, 'rgba(160,240,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#aef';
  ctx.shadowBlur = 14;
  for (let e = 0; e < CUBE_EDGES.length; e++) {
    const [a, b2] = CUBE_EDGES[e]!;
    const A = at(a);
    const B = at(b2);
    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2;
    let dx = mx - cx;
    let dy = my - cy;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const ox = dx * fly + (reducedMotion ? 0 : Math.sin(t * 21 + e * 1.7) * 8 * k);
    const oy = dy * fly + (reducedMotion ? 0 : Math.cos(t * 19 + e * 2.3) * 8 * k);
    const c = Math.cos(rot + e);
    const s = Math.sin(rot + e);
    const rx0 = (A.x - mx) * c - (A.y - my) * s + mx + ox;
    const ry0 = (A.x - mx) * s + (A.y - my) * c + my + oy;
    const rx1 = (B.x - mx) * c - (B.y - my) * s + mx + ox;
    const ry1 = (B.x - mx) * s + (B.y - my) * c + my + oy;
    const g = ctx.createLinearGradient(rx0, ry0, rx1, ry1);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, e % 2 ? '#22d3ee' : '#a855f7');
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(rx0, ry0);
    ctx.lineTo(rx1, ry1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawQuantumCube(
  ctx: CanvasRenderingContext2D,
  t: number,
  b: QuantumCube,
  fieldT: number,
  reducedMotion: boolean,
): void {
  // materialization entrance: fade + scale + flash
  const ekRaw = qcClamp((fieldT - b.appearDelay) / 0.5);
  const ek = reducedMotion ? (ekRaw >= 1 ? 1 : 0) : qcEaseOutBack(ekRaw);
  if (ek <= 0.01) return;

  // quantum dissolve for unpicked cubes
  const dAlpha = b.dim ? 1 - b.dimT : 1;
  const dRise = b.dim ? b.dimT * -70 : 0;
  const dScale = b.dim ? 1 - b.dimT * 0.55 : 1;
  const alpha = Math.min(ek, dAlpha);
  if (alpha <= 0.01) return;

  // float physics: bob + drift
  const bobY = reducedMotion ? 0 : Math.sin(t * 1.35 + b.seed * 6.283) * 11;
  const driftX = reducedMotion ? 0 : Math.sin(t * 0.62 + b.seed * 6.283) * 15;
  const cx = b.x + driftX;
  const cy = b.y + bobY + dRise;

  // destabilize jitter (shaking)
  const glitch = b.phase === 'shaking' && !reducedMotion;
  let jx = 0;
  let jy = 0;
  if (glitch) {
    const k = 1 - qcClamp(b.phaseT / 0.5);
    jx = (Math.random() * 2 - 1) * 10 * (0.4 + k * 0.6);
    jy = (Math.random() * 2 - 1) * 7 * (0.4 + k * 0.6);
  }

  const r = 27 * Math.max(0.01, ek) * dScale;

  ctx.save();
  ctx.globalAlpha = alpha;

  // materialization flash ring
  if (ek < 1 && !reducedMotion) {
    const mk = qcEaseOutCubic(ek);
    ctx.globalAlpha = alpha * (1 - mk) * 0.9;
    ctx.strokeStyle = '#bdf3ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 20 + mk * 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  // ---- aura: breathing energy field
  const breathe = reducedMotion ? 0.75 : 0.6 + 0.3 * Math.sin(t * 2.6 + b.seed * 6.283);
  let glowCol = '34,211,238';
  let glowA = 0.42 * breathe;
  if (b.phase === 'shaking') { glowCol = '217,70,239'; glowA = 0.8; }
  if (b.phase === 'bursting' || b.phase === 'revealed') { glowCol = '255,240,200'; glowA = 0.9; }
  const ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, 96);
  ag.addColorStop(0, `rgba(${glowCol},${glowA.toFixed(3)})`);
  ag.addColorStop(1, `rgba(${glowCol},0)`);
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(cx, cy, 96, 0, Math.PI * 2);
  ctx.fill();

  // pick shockwave ring
  if (b.ringT > 0 && b.ringT < 1) {
    ctx.globalAlpha = alpha * (1 - b.ringT) * 0.9;
    ctx.strokeStyle = '#eafcff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 16 + b.ringT * 100, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  const ry = reducedMotion ? 0.6 : t * 0.85 + b.seed * 6.283;
  const rx = reducedMotion ? 0.35 : 0.45 + 0.4 * Math.sin(t * 0.55 + b.seed * 6.283);

  if (b.phase === 'bursting') {
    drawCubeShatter(ctx, cx + jx, cy + jy, r, rx, ry, b.phaseT, t, b.seed, reducedMotion);
    // vertical energy beam
    const bk = qcClamp(b.phaseT / 0.25) * (1 - qcClamp((b.phaseT - 0.5) / 0.5));
    if (bk > 0.01 && !reducedMotion) {
      const bw = 54 + 12 * Math.sin(t * 34);
      const beam = ctx.createLinearGradient(0, cy - r, 0, cy - r - 200);
      beam.addColorStop(0, `rgba(220,250,255,${(0.85 * bk).toFixed(3)})`);
      beam.addColorStop(1, 'rgba(220,250,255,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(cx - bw / 2, cy - r - 200, bw, 200);
      ctx.fillStyle = `rgba(255,255,255,${(0.55 * bk).toFixed(3)})`;
      ctx.fillRect(cx - 5, cy - r - 200, 10, 200);
    }
  } else {
    if (glitch) {
      // RGB energy-split: magenta/cyan ghost passes
      drawCubeBody(ctx, cx - 7 + jx, cy + jy, r, rx, ry, t, b.seed, reducedMotion, 0);
      drawCubeBody(ctx, cx + 7 + jx, cy + jy, r, rx, ry, t, b.seed, reducedMotion, 1);
    }
    drawCubeBody(ctx, cx + jx, cy + jy, r, rx, ry, t, b.seed, reducedMotion, -1);
  }

  // ---- prize star emerging from the core
  const open = b.phase === 'bursting' || b.phase === 'revealed';
  if (open) {
    const rk = b.phase === 'bursting' ? (reducedMotion ? 1 : qcEaseOutBack(qcClamp(b.phaseT / 0.55))) : 1;
    const rise = b.phase === 'bursting' && !reducedMotion ? (1 - qcEaseOutCubic(qcClamp(b.phaseT / 0.55))) * 56 : 0;
    const bob = b.phase === 'revealed' && !reducedMotion ? Math.sin(t * 2.2 + b.seed * 6.283) * 7 : 0;
    const sy = cy - r - 86 + rise + bob;
    const sr = 25 * Math.max(0.01, rk);
    if (rk > 0.02) {
      ctx.save();
      ctx.translate(cx, sy);
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, sr * 2.8);
      hg.addColorStop(0, 'rgba(255,230,170,0.85)');
      hg.addColorStop(1, 'rgba(255,230,170,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, 0, sr * 2.8, 0, Math.PI * 2);
      ctx.fill();
      starPath(ctx, 0, 0, sr, reducedMotion ? 0 : t * 0.9 + b.seed);
      const sg = ctx.createLinearGradient(0, -sr, 0, sr);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(0.55, '#ffe9b8');
      sg.addColorStop(1, '#ff9d2e');
      ctx.fillStyle = sg;
      ctx.shadowColor = '#ffb347';
      ctx.shadowBlur = 26;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (!reducedMotion) {
        ctx.fillStyle = 'rgba(255,247,230,0.95)';
        for (let s = 0; s < 4; s++) {
          const sa = b.seed * 6.283 + s * 1.7 + t * 1.4;
          const sd = sr * (1.7 + 0.5 * Math.sin(t * 3 + s));
          const sx = Math.cos(sa) * sd;
          const syy = Math.sin(sa) * sd;
          const ss = 3 + 2 * Math.sin(t * 5 + s * 2);
          ctx.fillRect(sx - ss / 2, syy - 0.75, ss, 1.5);
          ctx.fillRect(sx - 0.75, syy - ss / 2, 1.5, ss);
        }
      }
      ctx.restore();

      if (b.phase === 'revealed') {
        ctx.save();
        ctx.font = '700 32px ui-monospace, Menlo, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PAL.hotWhite;
        ctx.shadowColor = PAL.molten;
        ctx.shadowBlur = 14;
        ctx.fillText(`×${qcFmtPrize(b.shown)}`, cx, sy - sr - 28);
        ctx.restore();
      }
    }
  }

  // ---- quantum dissolve motes for unpicked cubes
  if (b.dim && !reducedMotion && b.dimT > 0 && b.dimT < 1) {
    for (let i = 0; i < 6; i++) {
      const ma = b.seed * 6.283 + i * 1.05 + t * 0.8;
      const mr = 30 + b.dimT * 60;
      const mx = cx + Math.cos(ma) * mr * 0.6;
      const my = cy + Math.sin(ma) * mr * 0.4 - b.dimT * 40;
      ctx.fillStyle = `rgba(150,220,255,${(0.5 * (1 - b.dimT)).toFixed(3)})`;
      ctx.fillRect(mx, my, 2.5, 2.5);
    }
  }

  ctx.restore();
}

export function drawSupernovaField(
  ctx: CanvasRenderingContext2D,
  t: number,
  zoom: number,
  cubes: QuantumCube[],
  fieldT: number,
  reducedMotion: boolean,
): void {
  // cross into the other universe: the base game dissolves behind this field
  drawQuantumUniverse(ctx, t, zoom, reducedMotion);

  // the 12 quantum cubes
  for (const b of cubes) {
    drawQuantumCube(ctx, t, b, fieldT, reducedMotion);
  }
}
// ---------------------------------------------------------------------------
// win rays (big-win backdrop)
// ---------------------------------------------------------------------------

export function drawRays(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, color: string, alpha: number, reducedMotion: boolean): void {
  if (reducedMotion) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.12);
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.5) / n) * Math.PI * 2;
    const grad = ctx.createRadialGradient(0, 0, 40, 0, 0, 520);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,179,71,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 520, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// particles
// ---------------------------------------------------------------------------

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  grav: number;
  drag: number;
}

export function spawnForgeBurst(parts: Particle[], x: number, y: number): void {
  const colors = ['#fff7e6', '#ffb347', '#ff6b1a', '#22d3ee'];
  for (let i = 0; i < 42; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 90 + Math.random() * 380;
    const life = 0.4 + Math.random() * 0.6;
    parts.push({
      x: x + (Math.random() - 0.5) * 40,
      y: y + (Math.random() - 0.5) * 20,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.7 - 120 * Math.random(),
      life,
      maxLife: life,
      size: 2 + Math.random() * 5,
      color: colors[(Math.random() * colors.length) | 0]!,
      grav: 420,
      drag: 0.97,
    });
  }
}

export function spawnEmbers(parts: Particle[], x: number, y: number, n: number, spread = 160, up = -260): void {
  const colors = ['#ff6b1a', '#ffb347', '#fff7e6', '#ff8c3a'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * spread;
    const life = 0.5 + Math.random() * 0.7;
    parts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.6 + up * Math.random(),
      life,
      maxLife: life,
      size: 2 + Math.random() * 4,
      color: colors[(Math.random() * colors.length) | 0]!,
      grav: 320,
      drag: 0.98,
    });
  }
}

export function spawnSparks(parts: Particle[], x: number, y: number, n: number, color = '#22d3ee'): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    const life = 0.3 + Math.random() * 0.4;
    parts.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life, maxLife: life,
      size: 1.5 + Math.random() * 2.5,
      color, grav: 60, drag: 0.96,
    });
  }
}

export function updateParticles(parts: Particle[], dt: number): void {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    p.life -= dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    p.vy += p.grav * dt;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, parts: Particle[]): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
