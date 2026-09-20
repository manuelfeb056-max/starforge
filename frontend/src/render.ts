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
// supernova overlay — gift-box pick bonus
// ---------------------------------------------------------------------------

export interface GiftBox {
  x: number; // anchor: center of the box body
  y: number;
  prize: number; // hidden multiplier
  phase: 'idle' | 'shaking' | 'bursting' | 'revealed';
  picked: boolean;
  dim: boolean;
  dimT: number; // 0..1 elegant fade for unpicked boxes
  phaseT: number; // seconds in current phase
  ringT: number; // shockwave 0..1
  seed: number; // per-box random offset
  appearDelay: number; // staggered entrance
  shown: number; // count-up display value
  tickAcc: number; // accumulator for count-up ticks
}

const gbClamp = (v: number): number => Math.max(0, Math.min(1, v));
const gbEaseOutCubic = (k: number): number => 1 - Math.pow(1 - k, 3);
const gbEaseOutBack = (k: number): number => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};

function gbFmtPrize(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** 12 gift boxes in a 4x3 arc formation. */
export function giftBoxPositions(): Array<{ x: number; y: number }> {
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

function drawGiftBox(
  ctx: CanvasRenderingContext2D,
  t: number,
  b: GiftBox,
  fieldT: number,
  reducedMotion: boolean,
): void {
  const BW = 78;
  const BH = 60;
  const LIDH = 22;

  // staggered entrance
  const ekRaw = gbClamp((fieldT - b.appearDelay) / 0.45);
  const ek = reducedMotion ? (ekRaw >= 1 ? 1 : 0) : gbEaseOutBack(ekRaw);
  if (ek <= 0.01) return;

  // idle float + sway
  const floatY = reducedMotion ? 0 : Math.sin(t * 1.7 + b.seed * 6.283) * 9;
  const sway = reducedMotion ? 0 : Math.sin(t * 1.13 + b.seed * 6.283) * 0.05;

  // pick shake jitter
  let jx = 0;
  let jy = 0;
  if (b.phase === 'shaking' && !reducedMotion) {
    const k = 1 - gbClamp(b.phaseT / 0.5);
    jx = (Math.random() * 2 - 1) * 8 * k;
    jy = (Math.random() * 2 - 1) * 5 * k;
  }

  // elegant dim fade for unpicked boxes
  const alpha = b.dim ? 1 - b.dimT * 0.78 : 1;
  const sink = b.dim ? b.dimT * 16 : 0;

  const cx = b.x + jx;
  const cy = b.y + floatY + jy + sink;

  ctx.save();
  ctx.globalAlpha = alpha;

  // breathing aura
  const breathe = reducedMotion ? 0.8 : 0.62 + 0.28 * Math.sin(t * 2.3 + b.seed * 6.283);
  let glowA = 0.4 * breathe;
  let glowCol = '139,92,246';
  if (b.phase === 'shaking') {
    glowA = 0.75;
    glowCol = '255,179,71';
  }
  if (b.phase === 'bursting' || b.phase === 'revealed') {
    glowA = 0.85;
    glowCol = '255,214,140';
  }
  const gr = 88;
  const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
  gg.addColorStop(0, `rgba(${glowCol},${glowA})`);
  gg.addColorStop(1, `rgba(${glowCol},0)`);
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(cx, cy, gr, 0, Math.PI * 2);
  ctx.fill();

  // pick shockwave ring
  if (b.ringT > 0 && b.ringT < 1) {
    ctx.globalAlpha = alpha * (1 - b.ringT) * 0.9;
    ctx.strokeStyle = '#fff7e6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 + b.ringT * 95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  ctx.translate(cx, cy);
  ctx.rotate(sway);
  ctx.scale(Math.max(0.01, ek), Math.max(0.01, ek));

  const open = b.phase === 'bursting' || b.phase === 'revealed';

  // ---- light beam (bursting)
  if (b.phase === 'bursting' && !reducedMotion) {
    const bk = gbClamp(b.phaseT / 0.28) * (1 - gbClamp((b.phaseT - 0.55) / 0.45));
    if (bk > 0.01) {
      const bwPulse = 46 + 10 * Math.sin(t * 30);
      const beam = ctx.createLinearGradient(0, -BH / 2, 0, -BH / 2 - 170);
      beam.addColorStop(0, `rgba(255,244,214,${0.75 * bk})`);
      beam.addColorStop(1, 'rgba(255,244,214,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(-bwPulse / 2, -BH / 2 - 170, bwPulse, 170);
      ctx.fillStyle = `rgba(255,255,255,${0.5 * bk})`;
      ctx.fillRect(-5, -BH / 2 - 170, 10, 170);
    }
  }

  // ---- emerging prize star
  if (open) {
    const rk = b.phase === 'bursting' ? (reducedMotion ? 1 : gbEaseOutBack(gbClamp(b.phaseT / 0.55))) : 1;
    const rise =
      b.phase === 'bursting' && !reducedMotion ? (1 - gbEaseOutCubic(gbClamp(b.phaseT / 0.55))) * 52 : 0;
    const bob = b.phase === 'revealed' && !reducedMotion ? Math.sin(t * 2.2 + b.seed * 6.283) * 7 : 0;
    const sy = -BH / 2 - 82 + rise + bob;
    const sr = 25 * Math.max(0.01, rk);
    if (rk > 0.02) {
      ctx.save();
      ctx.translate(0, sy);
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, sr * 2.6);
      hg.addColorStop(0, 'rgba(255,214,140,0.8)');
      hg.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, 0, sr * 2.6, 0, Math.PI * 2);
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

      // prize label with count-up
      if (b.phase === 'revealed') {
        ctx.save();
        ctx.font = '700 32px ui-monospace, Menlo, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PAL.hotWhite;
        ctx.shadowColor = PAL.molten;
        ctx.shadowBlur = 14;
        ctx.fillText(`×${gbFmtPrize(b.shown)}`, 0, sy - sr - 28);
        ctx.restore();
      }
    }
  }

  // ---- box body
  const bg = ctx.createLinearGradient(0, -BH / 2, 0, BH / 2);
  bg.addColorStop(0, '#43308a');
  bg.addColorStop(0.55, '#2c1c58');
  bg.addColorStop(1, '#1a1136');
  roundRect(ctx, -BW / 2, -BH / 2, BW, BH, 10);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(139,92,246,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // gold ribbon cross
  const rib = ctx.createLinearGradient(-9, 0, 9, 0);
  rib.addColorStop(0, '#c77e1e');
  rib.addColorStop(0.5, '#ffd98a');
  rib.addColorStop(1, '#c77e1e');
  ctx.fillStyle = rib;
  ctx.fillRect(-9, -BH / 2 + 2, 18, BH - 4);
  ctx.fillRect(-BW / 2 + 2, -8, BW - 4, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-9, -BH / 2 + 2, 4, BH - 4);

  if (open) {
    // dark open mouth
    ctx.fillStyle = 'rgba(4,2,10,0.92)';
    ctx.beginPath();
    ctx.ellipse(0, -BH / 2 + 4, BW / 2 - 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,138,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // ---- lid (+ bow): flies off while bursting
    let lx = 0;
    let ly = 0;
    let lr = 0;
    let la = 1;
    if (b.phase === 'bursting') {
      const lk = gbEaseOutCubic(gbClamp(b.phaseT / 0.45));
      if (reducedMotion) {
        la = 1 - lk;
      } else {
        lx = lk * 46;
        ly = -lk * 120;
        lr = lk * 1.1;
        la = 1 - lk * 0.9;
      }
    }
    if (la > 0.01) {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(lr);
      ctx.globalAlpha = alpha * la;
      const lidW = BW + 10;
      const lg = ctx.createLinearGradient(0, -BH / 2 - LIDH, 0, -BH / 2);
      lg.addColorStop(0, '#5b3aa8');
      lg.addColorStop(1, '#37236e');
      roundRect(ctx, -lidW / 2, -BH / 2 - LIDH, lidW, LIDH, 8);
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(196,181,253,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = rib;
      ctx.fillRect(-9, -BH / 2 - LIDH + 2, 18, LIDH - 2);
      // bow
      const by = -BH / 2 - LIDH;
      ctx.fillStyle = '#ffcf7d';
      ctx.strokeStyle = '#c77e1e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-13, by - 8, 13, 9, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(13, by - 8, 13, 9, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, by - 4, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffb347';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

export function drawSupernovaField(
  ctx: CanvasRenderingContext2D,
  t: number,
  zoom: number,
  boxes: GiftBox[],
  fieldT: number,
  reducedMotion: boolean,
): void {
  // dim backdrop
  ctx.fillStyle = `rgba(4,3,14,${0.82 * Math.min(1, zoom * 2)})`;
  ctx.fillRect(0, 0, LW, LH);

  // starfield zoom: streaks radiating outward
  if (!reducedMotion && zoom > 0) {
    ensureStarfield();
    const cx = LW / 2;
    const cy = LH / 2;
    ctx.save();
    ctx.lineWidth = 1.6;
    for (const s of starfield!) {
      const dx = s.x - cx;
      const dy = s.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const lead = zoom * 130 * (0.4 + s.sp * 0.6);
      const x2 = s.x + ux * lead;
      const y2 = s.y + uy * lead;
      const a = Math.min(0.75, zoom * 0.8);
      const grad = ctx.createLinearGradient(s.x, s.y, x2, y2);
      grad.addColorStop(0, `rgba(223,230,255,0)`);
      grad.addColorStop(1, `rgba(223,230,255,${a})`);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // violet nebula core
  const cg = ctx.createRadialGradient(LW / 2, LH * 0.42, 0, LW / 2, LH * 0.42, 420);
  cg.addColorStop(0, 'rgba(139,92,246,0.28)');
  cg.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, LW, LH);

  // the 12 gift boxes
  for (const b of boxes) {
    drawGiftBox(ctx, t, b, fieldT, reducedMotion);
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
