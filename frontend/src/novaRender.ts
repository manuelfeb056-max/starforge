/**
 * NOVA FURNACE renderer — the bonus universe. Procedural Canvas 2D, no images.
 * Forged-iron chamber, molten heat, plasma energy cores, lightning, lasers,
 * shockwaves. Drawn at the same 1280x800 logical resolution as the base game.
 */
import { LW, LH, PAL, roundRect } from './render.ts';
import type { NovaKind } from './nova.ts';

export const NOVA_GX = 330;
export const NOVA_GY = 196;
export const NOVA_PITCH = 124;
export const NOVA_CELL = 110;

export function novaCellCenter(cell: number): { x: number; y: number } {
  const col = cell % 5;
  const row = (cell / 5) | 0;
  return {
    x: NOVA_GX + col * NOVA_PITCH + NOVA_PITCH / 2,
    y: NOVA_GY + row * NOVA_PITCH + NOVA_PITCH / 2,
  };
}

export function fmtVal(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? `×${r}` : `×${r.toFixed(1)}`;
}

function coreColor(kind: NovaKind, value: number): string {
  if (kind === 'collector') return '#fb4d6d';
  if (kind === 'payer') return '#ffd34d';
  if (kind === 'sniper') return '#ff5a3c';
  if (value >= 25) return '#ff3df2';
  if (value >= 3) return '#ffb347';
  if (value >= 2) return '#a78bfa';
  return '#22d3ee';
}

// ---------------------------------------------------------------------------
// background: the furnace chamber
// ---------------------------------------------------------------------------

let emberSeed = 0;
interface Ember { x: number; y: number; r: number; sp: number; ph: number; hue: number }
let embers: Ember[] | null = null;
function ensureEmbers(): void {
  if (embers) return;
  let s = 0x12345678;
  const rnd = (): number => {
    s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0;
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
  embers = [];
  for (let i = 0; i < 70; i++) {
    embers.push({ x: rnd() * LW, y: rnd() * LH, r: 1 + rnd() * 3, sp: 24 + rnd() * 70, ph: rnd() * 6.283, hue: rnd() });
  }
  emberSeed = 1;
}
void emberSeed;

/**
 * @param heat 0..1 — molten intensity; rises as respins run low / on specials.
 * @param introK 0..1 — emergence scale-in of the chamber.
 */
export function drawNovaBackground(
  ctx: CanvasRenderingContext2D,
  t: number,
  heat: number,
  introK: number,
  reducedMotion: boolean,
): void {
  ensureEmbers();
  const h = Math.max(0, Math.min(1, heat));

  ctx.save();
  if (introK < 1) {
    ctx.translate(LW / 2, LH / 2);
    ctx.scale(0.82 + 0.18 * introK, 0.82 + 0.18 * introK);
    ctx.translate(-LW / 2, -LH / 2);
    ctx.globalAlpha = introK;
  }

  // chamber walls
  const wg = ctx.createLinearGradient(0, 0, 0, LH);
  wg.addColorStop(0, '#070403');
  wg.addColorStop(0.55, '#120705');
  wg.addColorStop(1, '#230c04');
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, LW, LH);

  // riveted iron panels on the sides
  const panel = (x: number): void => {
    const pg = ctx.createLinearGradient(x, 0, x + 90, 0);
    pg.addColorStop(0, 'rgba(40,22,14,0.9)');
    pg.addColorStop(0.5, 'rgba(58,32,20,0.55)');
    pg.addColorStop(1, 'rgba(40,22,14,0.9)');
    ctx.fillStyle = pg;
    ctx.fillRect(x, 0, 90, LH);
    ctx.fillStyle = 'rgba(255,150,60,0.10)';
    for (let y = 40; y < LH; y += 120) {
      ctx.beginPath();
      ctx.arc(x + 45, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  panel(0);
  panel(LW - 90);

  // molten floor glow — breathes with heat
  const breathe = reducedMotion ? 0.9 : 0.82 + 0.18 * Math.sin(t * 2.1);
  const glowA = (0.42 + 0.5 * h) * breathe;
  const fg = ctx.createRadialGradient(LW / 2, LH + 120, 0, LW / 2, LH + 120, 700);
  fg.addColorStop(0, `rgba(255,122,26,${glowA.toFixed(3)})`);
  fg.addColorStop(0.45, `rgba(255,80,20,${(glowA * 0.45).toFixed(3)})`);
  fg.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, LH - 560, LW, 560);

  // lava cracks along the bottom
  ctx.save();
  ctx.globalAlpha = 0.5 + 0.5 * h;
  ctx.strokeStyle = '#ff7a1a';
  ctx.lineWidth = 2.5;
  if (!reducedMotion) {
    ctx.shadowColor = '#ff6b1a';
    ctx.shadowBlur = 12;
  }
  const crackY = LH - 46;
  ctx.beginPath();
  for (let x = 100; x < LW - 100; x += 8) {
    const y = crackY + (reducedMotion ? 0 : Math.sin(x * 0.05 + t * 1.3) * 7 + Math.sin(x * 0.013 - t * 0.7) * 11);
    if (x === 100) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // rising embers
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of embers!) {
    const py = reducedMotion ? e.y : ((e.y - t * e.sp) % (LH + 40) + LH + 40) % (LH + 40) - 20;
    const px = e.x + (reducedMotion ? 0 : Math.sin(t * 0.9 + e.ph) * 26);
    const tw = reducedMotion ? 0.7 : 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + e.ph));
    const a = (0.25 + 0.55 * h) * tw;
    const col = e.hue < 0.7 ? '255,140,40' : e.hue < 0.9 ? '255,200,90' : '255,90,40';
    ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(px, py, e.r * (0.7 + 0.6 * h), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // heat shimmer waves above the floor
  if (!reducedMotion && h > 0.15) {
    ctx.save();
    ctx.globalAlpha = 0.10 + 0.12 * h;
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2;
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      const yy = LH - 120 - r * 46;
      for (let x = 120; x <= LW - 120; x += 14) {
        const y = yy + Math.sin(x * 0.03 + t * (3 + r) + r * 2) * 9;
        if (x === 120) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // vignette
  const vg = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.32, LW / 2, LH / 2, LH * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, LW, LH);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// the 5x4 forge grid
// ---------------------------------------------------------------------------

/**
 * @param appearK per-cell 0..1 emergence (array of 20, or null for all 1)
 * @param shimmerT >0 while empty cells shimmer with anticipation
 */
export function drawNovaFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  occupied: boolean[],
  appearK: number[] | null,
  shimmerT: number,
  reducedMotion: boolean,
): void {
  for (let cell = 0; cell < 20; cell++) {
    const { x, y } = novaCellCenter(cell);
    const ak = appearK ? Math.max(0.001, appearK[cell] ?? 1) : 1;
    if (ak <= 0.01) continue;
    const hw = (NOVA_CELL / 2) * ak;
    ctx.save();
    ctx.globalAlpha = ak;

    // forged iron socket
    const g = ctx.createLinearGradient(x, y - hw, x, y + hw);
    g.addColorStop(0, '#241610');
    g.addColorStop(0.5, '#120a06');
    g.addColorStop(1, '#1d100a');
    roundRect(ctx, x - hw, y - hw, hw * 2, hw * 2, 16 * ak);
    ctx.fillStyle = g;
    ctx.fill();

    // inner ember glow — the socket holds heat
    const ig = ctx.createRadialGradient(x, y, 0, x, y, hw);
    const emberPulse = reducedMotion ? 0.5 : 0.4 + 0.2 * Math.sin(t * 1.8 + cell * 1.1);
    ig.addColorStop(0, `rgba(255,110,30,${(0.10 + emberPulse * 0.10).toFixed(3)})`);
    ig.addColorStop(0.7, 'rgba(255,110,30,0.03)');
    ig.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.fillStyle = ig;
    ctx.fill();

    // molten seam border
    const seamPulse = reducedMotion ? 0.6 : 0.45 + 0.25 * Math.sin(t * 2.4 + cell * 0.7);
    const bg = ctx.createLinearGradient(x - hw, y - hw, x + hw, y + hw);
    bg.addColorStop(0, `rgba(255,122,26,${(0.35 + seamPulse * 0.4).toFixed(3)})`);
    bg.addColorStop(0.5, 'rgba(120,60,25,0.5)');
    bg.addColorStop(1, `rgba(255,122,26,${(0.35 + seamPulse * 0.4).toFixed(3)})`);
    ctx.strokeStyle = bg;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // corner rivets
    ctx.fillStyle = 'rgba(255,170,90,0.5)';
    const ro = hw - 10 * ak;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      ctx.beginPath();
      ctx.arc(x + sx * ro, y + sy * ro, 3.5 * ak, 0, Math.PI * 2);
      ctx.fill();
    }

    // anticipation shimmer on empty sockets
    if (!occupied[cell] && shimmerT > 0 && !reducedMotion) {
      const p = 0.5 + 0.5 * Math.sin(t * 10 + cell * 1.3);
      ctx.save();
      ctx.globalAlpha = ak * (0.25 + 0.55 * p) * Math.min(1, shimmerT * 2);
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 3;
      roundRect(ctx, x - hw + 5, y - hw + 5, hw * 2 - 10, hw * 2 - 10, 12 * ak);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// energy cores
// ---------------------------------------------------------------------------

export interface NovaCoreDraw {
  cell: number;
  kind: NovaKind;
  value: number;
  shown: number;
  dropK: number; // 0..1
  pulse: number; // hit glow, decays
  zap: number; // electric charge 0..1
  spin: number; // collector vortex 0..1
  seed: number;
  flyX: number; // finale launch offset
  flyY: number;
  flyA: number; // 1 -> 0 during launch
}

const easeOutBounce = (k: number): number => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (k < 1 / d1) return n1 * k * k;
  if (k < 2 / d1) return n1 * (k -= 1.5 / d1) * k + 0.75;
  if (k < 2.5 / d1) return n1 * (k -= 2.25 / d1) * k + 0.9375;
  return n1 * (k -= 2.625 / d1) * k + 0.984375;
};

export function drawNovaCore(
  ctx: CanvasRenderingContext2D,
  c: NovaCoreDraw,
  t: number,
  reducedMotion: boolean,
): void {
  const { x: cx0, y: cy0 } = novaCellCenter(c.cell);
  const cx = cx0 + c.flyX;
  const dk = Math.max(0.001, Math.min(1, c.dropK));
  const bounce = reducedMotion ? 1 : easeOutBounce(dk);
  const cy = cy0 + c.flyY - (1 - bounce) * 420;
  const scaleIn = reducedMotion ? 1 : 0.4 + 0.6 * Math.min(1, dk * 1.6);
  const col = coreColor(c.kind, c.value);
  const R = 38 * scaleIn;
  if (c.flyA <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = c.flyA;

  // aura
  const breathe = reducedMotion ? 0.8 : 0.72 + 0.28 * Math.sin(t * 3.4 + c.seed * 6.283);
  const auraR = R * (3.4 + (c.pulse > 0 ? c.pulse * 1.8 : 0));
  const ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, auraR);
  ag.addColorStop(0, col + '55');
  ag.addColorStop(1, col + '00');
  ctx.globalAlpha = c.flyA * (0.5 + 0.3 * breathe + c.pulse * 0.4 + c.zap * 0.5);
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = c.flyA;

  // plasma body
  const flick = reducedMotion ? 1 : 0.94 + 0.06 * Math.sin(t * 17 + c.seed * 9);
  const bodyR = R * flick;
  const bg2 = ctx.createRadialGradient(cx - bodyR * 0.25, cy - bodyR * 0.3, 0, cx, cy, bodyR);
  bg2.addColorStop(0, '#ffffff');
  bg2.addColorStop(0.35, col);
  bg2.addColorStop(1, '#1a0b06');
  ctx.fillStyle = bg2;
  if (!reducedMotion) {
    ctx.shadowColor = col;
    ctx.shadowBlur = 30 + c.pulse * 36 + c.zap * 32;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // inner swirl
  if (!reducedMotion) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    const sw = t * (2 + c.spin * 9) + c.seed * 6.283;
    ctx.beginPath();
    ctx.arc(cx, cy, bodyR * 0.55, sw, sw + Math.PI * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, bodyR * 0.3, -sw * 1.4, -sw * 1.4 + Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // orbiting sparks
  if (!reducedMotion && dk >= 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const nOrb = c.kind === 'value' ? 2 : 3;
    for (let i = 0; i < nOrb; i++) {
      const oa = t * (1.6 + i * 0.5) + c.seed * 6.283 + i * 2.094;
      const orad = bodyR * (1.7 + 0.15 * Math.sin(t * 2 + i * 2));
      const ox = cx + Math.cos(oa) * orad;
      const oy = cy + Math.sin(oa) * orad * 0.6;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(ox, oy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // kind sigils
  ctx.save();
  ctx.translate(cx, cy);
  if (c.kind === 'collector') {
    // magnet vortex: two rotating arcs (horseshoe impression)
    const ra = reducedMotion ? 0 : t * (1.2 + c.spin * 10);
    ctx.rotate(ra);
    ctx.strokeStyle = '#ff8fa3';
    ctx.lineWidth = 5;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.arc(0, 0, bodyR * 1.35, k * Math.PI + 0.5, k * Math.PI + Math.PI - 0.5);
      ctx.stroke();
    }
    ctx.rotate(-ra);
    // iron core dot
    ctx.fillStyle = '#e8e6f0';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (c.kind === 'payer') {
    // amplifier: expanding chevrons
    ctx.strokeStyle = '#fff3c4';
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      const rr = bodyR * (0.6 + k * 0.45 + (reducedMotion ? 0 : 0.12 * Math.sin(t * 4 + k * 2)));
      ctx.beginPath();
      ctx.arc(0, 0, rr, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(7, 4);
    ctx.lineTo(-7, 4);
    ctx.closePath();
    ctx.fill();
  } else if (c.kind === 'sniper') {
    // crosshair reticle, slow rotate
    const ra = reducedMotion ? 0 : t * 0.8;
    ctx.rotate(ra);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    const rr = bodyR * 1.15;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.rotate(-ra);
  }
  ctx.restore();

  // zap arcs across the body
  if (c.zap > 0.01 && !reducedMotion) {
    ctx.save();
    ctx.globalAlpha = c.flyA * c.zap;
    ctx.strokeStyle = '#eaf6ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#bfe9ff';
    ctx.shadowBlur = 10;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const a0 = c.seed * 6.283 + k * 2.094 + t * 22;
      for (let s = 0; s <= 5; s++) {
        const a = a0 + (s / 5) * Math.PI * 2;
        const rr = bodyR * (0.9 + 0.35 * Math.sin(t * 31 + k * 3 + s * 1.7));
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // value label
  if (dk >= 1) {
    ctx.save();
    ctx.font = `800 ${c.kind === 'value' ? 26 : 22}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ly = cy + bodyR + 20;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,4,2,0.9)';
    const label = fmtVal(c.shown);
    ctx.strokeText(label, cx, ly);
    ctx.fillStyle = c.pulse > 0.3 ? '#ffffff' : '#ffe9c4';
    if (!reducedMotion) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 10 + c.pulse * 18;
    }
    ctx.fillText(label, cx, ly);
    ctx.restore();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------------

export interface BoltPts { x: number; y: number }

/** Jagged lightning polyline between two points (regenerate per crackle). */
export function makeBoltPts(x0: number, y0: number, x1: number, y1: number, jag = 26): BoltPts[] {
  const pts: BoltPts[] = [];
  const segs = 7;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 0; i <= segs; i++) {
    const k = i / segs;
    const off = i === 0 || i === segs ? 0 : (Math.random() * 2 - 1) * jag;
    pts.push({ x: x0 + dx * k + nx * off, y: y0 + dy * k + ny * off });
  }
  return pts;
}

export interface FxBolt { pts: BoltPts[]; t: number; dur: number; color: string; width: number }
export interface FxRing { x: number; y: number; t: number; dur: number; color: string; maxR: number; width: number }
export interface FxPopup { x: number; y: number; text: string; t: number; dur: number; color: string; size: number }
export interface FxLaser { x0: number; y0: number; x1: number; y1: number; t: number; dur: number }
export interface FxStreak { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; color: string }

export function drawFxBolt(ctx: CanvasRenderingContext2D, b: FxBolt, reducedMotion: boolean): void {
  const k = Math.max(0, Math.min(1, b.t / b.dur));
  if (k >= 1) return;
  const a = 1 - k;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (!reducedMotion) {
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 16;
  }
  // outer glow pass
  ctx.strokeStyle = b.color;
  ctx.lineWidth = b.width;
  ctx.beginPath();
  b.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  // white-hot core pass
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(1.5, b.width * 0.35);
  ctx.stroke();
  ctx.restore();
}

export function drawFxLaser(ctx: CanvasRenderingContext2D, l: FxLaser, reducedMotion: boolean): void {
  const k = Math.max(0, Math.min(1, l.t / l.dur));
  if (k >= 1) return;
  const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.lineCap = 'round';
  if (!reducedMotion) {
    ctx.shadowColor = '#ff4d4d';
    ctx.shadowBlur = 18;
  }
  ctx.strokeStyle = '#ff6a5e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(l.x0, l.y0);
  ctx.lineTo(l.x1, l.y1);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // impact flare
  const fl = 1 - k;
  const fg = ctx.createRadialGradient(l.x1, l.y1, 0, l.x1, l.y1, 44 * fl + 8);
  fg.addColorStop(0, 'rgba(255,255,255,0.95)');
  fg.addColorStop(1, 'rgba(255,90,60,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(l.x1, l.y1, 44 * fl + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawFxRing(ctx: CanvasRenderingContext2D, r: FxRing): void {
  const k = Math.max(0, Math.min(1, r.t / r.dur));
  if (k >= 1) return;
  const e = 1 - Math.pow(1 - k, 3);
  ctx.save();
  ctx.globalAlpha = (1 - k) * 0.9;
  ctx.strokeStyle = r.color;
  ctx.lineWidth = r.width * (1 - k * 0.6);
  ctx.beginPath();
  ctx.arc(r.x, r.y, 8 + e * r.maxR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawFxPopup(ctx: CanvasRenderingContext2D, p: FxPopup): void {
  const k = Math.max(0, Math.min(1, p.t / p.dur));
  if (k >= 1) return;
  const rise = 1 - Math.pow(1 - k, 2);
  ctx.save();
  ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
  ctx.font = `800 ${p.size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = p.y - rise * 46;
  const scale = k < 0.18 ? 0.6 + (k / 0.18) * 0.4 : 1;
  ctx.translate(p.x, y);
  ctx.scale(scale, scale);
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(10,4,2,0.92)';
  ctx.strokeText(p.text, 0, 0);
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 12;
  ctx.fillText(p.text, 0, 0);
  ctx.restore();
}

export function drawFxStreak(ctx: CanvasRenderingContext2D, s: FxStreak): void {
  const k = Math.max(0, Math.min(1, s.t / s.dur));
  if (k >= 1) return;
  const e = k * k;
  const x = s.x0 + (s.x1 - s.x0) * e;
  const y = s.y0 + (s.y1 - s.y0) * e;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1 - k * 0.6;
  const g = ctx.createLinearGradient(s.x0, s.y0, x, y);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, s.color);
  ctx.strokeStyle = g;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s.x0, s.y0);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// chrome: title, respin pips, finale total
// ---------------------------------------------------------------------------

/** Entry title punch: k 0..1 scale/alpha. */
export function drawNovaTitle(
  ctx: CanvasRenderingContext2D,
  k: number,
  reducedMotion: boolean,
): void {
  if (k <= 0.01) return;
  const kk = Math.max(0.001, Math.min(1, k));
  ctx.save();
  ctx.globalAlpha = Math.min(1, kk * 1.6);
  ctx.translate(LW / 2, 104);
  const s = reducedMotion ? 1 : 1.6 - 0.6 * (1 - Math.pow(1 - kk, 3));
  ctx.scale(s, s);
  ctx.font = '900 58px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = 'NOVA FURNACE';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#2a0f04';
  ctx.strokeText(label, 0, 0);
  const tg = ctx.createLinearGradient(0, -30, 0, 30);
  tg.addColorStop(0, '#fff7e6');
  tg.addColorStop(0.45, '#ffb347');
  tg.addColorStop(1, '#ff6b1a');
  ctx.fillStyle = tg;
  if (!reducedMotion) {
    ctx.shadowColor = '#ff6b1a';
    ctx.shadowBlur = 26;
  }
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/** Molten respin pips. left = respins remaining. */
export function drawNovaRespins(
  ctx: CanvasRenderingContext2D,
  t: number,
  left: number,
  max: number,
  reducedMotion: boolean,
): void {
  ctx.save();
  ctx.textAlign = 'center';
  const cx = LW / 2;
  const y = 158;
  ctx.font = '700 17px ui-monospace, Menlo, monospace';
  ctx.fillStyle = left <= 1 ? '#ff5a3c' : '#ffb347';
  if (!reducedMotion && left <= 1) {
    ctx.shadowColor = '#ff3b1a';
    ctx.shadowBlur = 12 + 8 * Math.sin(t * 9);
  }
  ctx.fillText('RESPINS', cx, y - 26);
  ctx.shadowBlur = 0;
  for (let i = 0; i < max; i++) {
    const px = cx + (i - (max - 1) / 2) * 44;
    const on = i < left;
    const pulse = on && !reducedMotion ? 0.75 + 0.25 * Math.sin(t * 5 + i) : 1;
    const r = 13 * pulse;
    if (on) {
      const g = ctx.createRadialGradient(px - 3, y - 4, 0, px, y, r);
      g.addColorStop(0, '#fff7e6');
      g.addColorStop(0.5, '#ffb347');
      g.addColorStop(1, '#b33c00');
      ctx.fillStyle = g;
      if (!reducedMotion) {
        ctx.shadowColor = '#ff7a1a';
        ctx.shadowBlur = 16;
      }
    } else {
      ctx.fillStyle = '#241209';
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.arc(px, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = on ? 'rgba(255,220,160,0.8)' : 'rgba(120,70,40,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

/** Finale total count-up. k = reveal 0..1. */
export function drawNovaTotal(
  ctx: CanvasRenderingContext2D,
  t: number,
  shown: number,
  k: number,
  reducedMotion: boolean,
): void {
  if (k <= 0.01) return;
  const kk = Math.max(0.001, Math.min(1, k));
  ctx.save();
  ctx.globalAlpha = Math.min(1, kk * 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // label
  ctx.font = '700 24px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#ffb347';
  ctx.fillText('NOVA FURNACE', LW / 2, 268);
  // amount (multiplier, 1 decimal when fractional)
  const r = Math.round(shown * 10) / 10;
  ctx.font = '900 110px ui-monospace, Menlo, Consolas, monospace';
  const label = Number.isInteger(r) ? `×${r.toLocaleString('en-US')}` : `×${r.toFixed(1)}`;
  const cx = LW / 2;
  const cy = 380;
  const punch = reducedMotion ? 1 : 1 + 0.06 * Math.sin(t * 6);
  ctx.translate(cx, cy);
  ctx.scale(punch, punch);
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#2a0f04';
  ctx.strokeText(label, 0, 0);
  const g = ctx.createLinearGradient(0, -55, 0, 55);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#ffe9b8');
  g.addColorStop(1, '#ff9d2e');
  ctx.fillStyle = g;
  if (!reducedMotion) {
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 40;
  }
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

export { PAL, LW, LH };
