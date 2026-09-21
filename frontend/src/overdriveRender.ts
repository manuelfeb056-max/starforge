/**
 * FURNACE OVERDRIVE wheel rendering — cinematic casino-grade forge wheel.
 * Pure canvas drawing; spin physics live in game.ts. This file is the
 * "television event" layer: forged-metal object, incandescent edges,
 * eruption cracks, reveal bursts, takeover backdrop.
 */
import type { OdSegment } from './overdrive.ts';

export interface OdWheelMeta {
  color: string;
  dark: string;
  glow: string;
}

/** Segment order around the wheel (clockwise from top). */
export const OD_WHEEL_ORDER: OdSegment[] = ['rescue', 'winmult', 'second', 'instant', 'hell', 'reheat'];

export const OD_SEG_META: Record<OdSegment, OdWheelMeta> = {
  rescue: { color: '#22d3ee', dark: '#0b3b44', glow: 'rgba(34,211,238,0.55)' },
  winmult: { color: '#a78bfa', dark: '#2b1c52', glow: 'rgba(167,139,250,0.55)' },
  second: { color: '#fb4d6d', dark: '#4a1020', glow: 'rgba(251,77,109,0.55)' },
  instant: { color: '#ffd34d', dark: '#4d3a08', glow: 'rgba(255,211,77,0.55)' },
  hell: { color: '#ff4a1f', dark: '#4d0f02', glow: 'rgba(255,74,31,0.65)' },
  reheat: { color: '#8a8fa3', dark: '#23252e', glow: 'rgba(138,143,163,0.45)' },
};

const TAU = Math.PI * 2;

/** Segment index under a pointer at canvas-angle `pointerA` given wheel `angle`. */
export function odSegmentAt(angle: number, pointerA: number): number {
  const n = OD_WHEEL_ORDER.length;
  const rel = (((pointerA - angle) % TAU) + TAU) % TAU;
  return Math.floor((rel / TAU) * n) % n;
}

/** Wheel angle that centers segment `segIdx` under the pointer (plus jitter). */
export function odAngleForSegment(segIdx: number, pointerA: number, jitter: number): number {
  const n = OD_WHEEL_ORDER.length;
  const segCenter = ((segIdx + 0.5) / n) * TAU;
  return pointerA - segCenter + jitter;
}

export interface OdWheelLabels {
  rescue: string;
  winmult: string;
  second: string;
  instant: string;
  hell: string;
  reheat: string;
  title: string;
}

/** Deterministic pseudo-random for stable ambient detail. */
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

export interface OdWheelFx {
  /** Anticipation/near-miss pulsing segment (-1 = none). */
  anticSeg?: number;
  /** Anticipation pulse strength 0..1. */
  anticT?: number;
  /** Progression heat 0..1 — the forge remembers. */
  streakHeat?: number;
}

function segPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, a0: number, a1: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, a0, a1);
  ctx.closePath();
}

/**
 * Draw the forge wheel as a physical object: beveled metal segments,
 * incandescent edges that breathe, a riveted iron rim with a rotating
 * specular sweep, and an engraved STARFORGE hub that spins with the wheel.
 */
export function drawOdWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  angle: number,
  t: number,
  labels: OdWheelLabels,
  highlight: number,
  heat: number,
  reducedMotion: boolean,
  fx: OdWheelFx = {},
): void {
  const n = OD_WHEEL_ORDER.length;
  const segA = TAU / n;
  const anticSeg = fx.anticSeg ?? -1;
  const anticT = fx.anticT ?? 0;
  const streakHeat = fx.streakHeat ?? 0;
  const breathe = reducedMotion ? 0 : Math.sin(t * 5.1);

  ctx.save();

  // drop shadow / base
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 56;
  ctx.fillStyle = '#0d0a08';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 26, 0, TAU);
  ctx.fill();
  ctx.restore();

  // rim: riveted iron with heat glow
  const rimG = ctx.createRadialGradient(cx, cy, R - 6, cx, cy, R + 26);
  rimG.addColorStop(0, '#33281c');
  rimG.addColorStop(0.55, '#191108');
  rimG.addColorStop(1, '#050302');
  ctx.fillStyle = rimG;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 26, 0, TAU);
  ctx.arc(cx, cy, R, 0, TAU, true);
  ctx.fill();

  // rotating specular sweep on the rim (metal reflection)
  if (!reducedMotion) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sw = t * 0.55;
    const sg = ctx.createLinearGradient(
      cx + Math.cos(sw) * (R + 14), cy + Math.sin(sw) * (R + 14),
      cx - Math.cos(sw) * (R + 14), cy - Math.sin(sw) * (R + 14),
    );
    sg.addColorStop(0, 'rgba(255,240,210,0)');
    sg.addColorStop(0.5, `rgba(255,240,210,${0.10 + streakHeat * 0.08})`);
    sg.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.strokeStyle = sg;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 13, sw - 0.85, sw + 0.85);
    ctx.stroke();
    ctx.restore();
  }

  // incandescent rim ring (breathes with heat)
  if (!reducedMotion) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 + heat * 0.5 + streakHeat * 0.18 + 0.07 * breathe;
    ctx.strokeStyle = `rgba(255,${120 + Math.round(heat * 90)},40,0.85)`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // rivets (tips glow with streak heat)
  const rivR = 4.6;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU + 0.13;
    const rx = cx + Math.cos(a) * (R + 13);
    const ry = cy + Math.sin(a) * (R + 13);
    const rg = ctx.createRadialGradient(rx - 1.5, ry - 1.5, 0, rx, ry, rivR);
    if (streakHeat > 0.4 && !reducedMotion) {
      rg.addColorStop(0, '#ffd9a0');
      rg.addColorStop(0.6, '#b3540a');
    } else {
      rg.addColorStop(0, '#cbb58a');
    }
    rg.addColorStop(1, '#4a3a22');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(rx, ry, rivR, 0, TAU);
    ctx.fill();
  }

  // segments: forged metal with bevel + incandescent edges
  for (let i = 0; i < n; i++) {
    const seg = OD_WHEEL_ORDER[i]!;
    const meta = OD_SEG_META[seg];
    const a0 = angle + i * segA;
    const a1 = a0 + segA;
    const isHi = i === highlight;
    const isAntic = i === anticSeg;

    // segment body: hammered-metal radial gradient
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    g.addColorStop(0, meta.dark);
    g.addColorStop(0.72, meta.color + (isHi ? '' : 'd6'));
    g.addColorStop(1, meta.dark);
    ctx.fillStyle = g;
    segPath(ctx, cx, cy, R, a0, a1);
    ctx.fill();

    // brushed-metal streaks inside the segment (clipped)
    ctx.save();
    segPath(ctx, cx, cy, R, a0, a1);
    ctx.clip();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    const mid = a0 + segA / 2;
    for (let s = -2; s <= 2; s++) {
      const sa = mid + s * 0.055;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(sa) * R * 0.24, cy + Math.sin(sa) * R * 0.24);
      ctx.lineTo(cx + Math.cos(sa) * (R - 8), cy + Math.sin(sa) * (R - 8));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // bevel: outer rim light + inner shadow
    ctx.strokeStyle = 'rgba(255,246,225,0.30)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 4, a0 + 0.02, a1 - 0.02);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.235, a0 + 0.02, a1 - 0.02);
    ctx.stroke();
    ctx.restore();

    // incandescent edge: breathes; highlight/anticipation flares it
    const pulse = isHi || isAntic
      ? (reducedMotion ? 0.75 : 0.55 + 0.35 * Math.sin(t * (isAntic ? 13 : 9) + i))
      : (reducedMotion ? 0.30 : 0.26 + 0.12 * Math.sin(t * 4.2 + i * 1.7));
    ctx.save();
    if (!reducedMotion && (isHi || isAntic)) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pulse + (isAntic ? anticT * 0.35 : 0);
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = isHi || isAntic ? 5.5 : 3;
    segPath(ctx, cx, cy, R - 1.5, a0, a1);
    ctx.stroke();
    ctx.restore();

    // divider spokes: iron + catching edge light
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * R * 0.18, cy + Math.sin(a0) * R * 0.18);
    ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,235,200,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * R * 0.2, cy + Math.sin(a0) * R * 0.2);
    ctx.lineTo(cx + Math.cos(a0) * (R - 3), cy + Math.sin(a0) * (R - 3));
    ctx.stroke();

    // label along the bisector
    const label = labels[seg];
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * R * 0.62, cy + Math.sin(mid) * R * 0.62);
    ctx.rotate(mid + Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = seg === 'hell' ? 21 : 19;
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(label, 1.5, 2);
    ctx.fillStyle = isHi ? '#ffffff' : '#ffe9c4';
    ctx.fillText(label, 0, 0);
    ctx.restore();

    // hell flame pips
    if (seg === 'hell' && !reducedMotion) {
      ctx.save();
      ctx.fillStyle = '#ffd34d';
      for (let f = 0; f < 3; f++) {
        const fa = mid + (f - 1) * 0.16;
        const fr = R * 0.86 + 3 * Math.sin(t * 11 + f * 2.1);
        const fx = cx + Math.cos(fa) * fr;
        const fy = cy + Math.sin(fa) * fr;
        ctx.beginPath();
        ctx.arc(fx, fy, 3.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // inner hub: forged cap with engraved STARFORGE ring, rotates with the wheel
  const hubR = R * 0.21;
  const hubA = angle * 0.35;
  const hg = ctx.createRadialGradient(cx - hubR * 0.3, cy - hubR * 0.3, 0, cx, cy, hubR);
  hg.addColorStop(0, '#ffe9b8');
  hg.addColorStop(0.4, '#ff9a3c');
  hg.addColorStop(1, '#5c1f04');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#2b1a08';
  ctx.lineWidth = 5;
  ctx.stroke();
  // rotating notches
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(hubA);
  ctx.fillStyle = 'rgba(43,20,4,0.85)';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(hubR * 0.78, -2.5, hubR * 0.16, 5);
    ctx.restore();
  }
  // engraved STARFORGE ring
  const word = 'STARFORGE';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(hubR * 0.30)}px system-ui, sans-serif`;
  for (let i = 0; i < word.length; i++) {
    const a = hubA + (i / word.length) * TAU - Math.PI / 2;
    const tx = Math.cos(a) * hubR * 0.58;
    const ty = Math.sin(a) * hubR * 0.58;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = 'rgba(255,240,210,0.35)'; // engraved light edge
    ctx.fillText(word[i]!, 0, 1.2);
    ctx.fillStyle = '#2b1404';
    ctx.fillText(word[i]!, 0, 0);
    ctx.restore();
  }
  // center star
  ctx.save();
  ctx.rotate(-hubA * 0.6);
  ctx.fillStyle = '#2b1404';
  ctx.beginPath();
  const sr = hubR * 0.22;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 === 0 ? sr : sr * 0.45;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();

  ctx.restore();
}

/** The pointer at the top: draws with a bounce `k` (0 = rest, 1 = max bend). */
export function drawOdPointer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  bounce: number,
  urgency: number,
  reducedMotion: boolean,
): void {
  const wob = reducedMotion ? 0 : Math.sin(performance.now() / 130) * 0.02 * urgency;
  ctx.save();
  ctx.translate(cx, cy - R - 30);
  ctx.rotate(wob + bounce * 0.22);
  const s = 1 + bounce * 0.35 + urgency * 0.12;
  ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, -34, 0, 26);
  g.addColorStop(0, '#fff3d6');
  g.addColorStop(0.5, '#ffb347');
  g.addColorStop(1, '#b3540a');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#2b1a08';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(-20, -22);
  ctx.lineTo(0, -10);
  ctx.lineTo(20, -22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (!reducedMotion) {
    ctx.save();
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 18 + urgency * 26;
    ctx.fillStyle = 'rgba(255,179,71,0.9)';
    ctx.beginPath();
    ctx.arc(0, -14, 5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Hell-mode inner wheel: 5 prize wedges. */
export function drawHellWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  angle: number,
  prizes: number[],
  t: number,
  highlight: number,
  reducedMotion: boolean,
  hubLabel = 'HELL',
): void {
  const n = prizes.length;
  const segA = TAU / n;
  ctx.save();
  ctx.save();
  ctx.shadowColor = 'rgba(255,40,10,0.8)';
  ctx.shadowBlur = 50;
  ctx.fillStyle = '#160402';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 14, 0, TAU);
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < n; i++) {
    const a0 = angle + i * segA;
    const a1 = a0 + segA;
    const isHi = i === highlight;
    const heat = i / (n - 1);
    const g = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
    g.addColorStop(0, '#3d0a02');
    g.addColorStop(1, `rgb(${140 + Math.round(heat * 115)},${30 + Math.round(heat * 40)},10)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fill();
    if (isHi) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = reducedMotion ? 0.5 : 0.45 + 0.3 * Math.sin(t * 10);
      ctx.fillStyle = 'rgba(255,220,120,0.8)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    ctx.stroke();

    const mid = a0 + segA / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * R * 0.66, cy + Math.sin(mid) * R * 0.66);
    ctx.rotate(mid + Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 26px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(`×${prizes[i]}`, 1.5, 2);
    ctx.fillStyle = isHi ? '#ffffff' : '#ffd9a0';
    ctx.fillText(`×${prizes[i]}`, 0, 0);
    ctx.restore();
  }
  // hub core
  const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.2);
  hg.addColorStop(0, '#fff3d6');
  hg.addColorStop(1, '#a32c05');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.2, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(R * 0.13)}px system-ui, sans-serif`;
  ctx.fillStyle = '#3d0f02';
  ctx.fillText(hubLabel, cx, cy);
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cinematic layers
// ---------------------------------------------------------------------------

export interface OdBackdropOpts {
  cx: number;
  cy: number;
  R: number;
  t: number;
  /** 0..1 camera-dive darkness. */
  vignette: number;
  /** 0..1 eruption palette shift. */
  hellK: number;
  /** 0..1 progression heat. */
  streakHeat: number;
  reducedMotion: boolean;
}

/**
 * Takeover backdrop: the slot world falls away behind a wall of dark,
 * lava glow breathes behind the wheel, smoke drifts, the floor smolders.
 */
export function drawOdBackdrop(ctx: CanvasRenderingContext2D, o: OdBackdropOpts): void {
  const { cx, cy, R, t, vignette, hellK, streakHeat, reducedMotion } = o;
  const W = 1280;
  const H = 800;

  ctx.save();
  // darkness wall
  ctx.fillStyle = `rgba(6,3,2,${(0.60 + 0.34 * vignette).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);

  // lava glow breathing behind the wheel
  const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.2);
  const glowR = R * (2.0 + hellK * 0.9);
  const gg = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, glowR);
  const heat = 0.10 + 0.16 * pulse + streakHeat * 0.10 + hellK * 0.22;
  gg.addColorStop(0, hellK > 0.5 ? `rgba(255,52,10,${heat.toFixed(3)})` : `rgba(255,110,26,${heat.toFixed(3)})`);
  gg.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = gg;
  ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

  // volumetric smoke drifting
  const rnd = mulberry32(777);
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const bx = rnd() * W;
    const by = rnd() * H * 0.7;
    const sx = reducedMotion ? bx : bx + Math.sin(t * 0.12 + i * 2.1) * 90;
    const sy = reducedMotion ? by : by + Math.cos(t * 0.09 + i * 1.7) * 50;
    const sr = 170 + rnd() * 90;
    const sm = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sm.addColorStop(0, `rgba(90,70,60,${(0.10 + hellK * 0.05).toFixed(3)})`);
    sm.addColorStop(1, 'rgba(90,70,60,0)');
    ctx.fillStyle = sm;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }
  ctx.restore();

  // smoldering floor under the wheel
  const fy = cy + R + 78;
  const fg = ctx.createLinearGradient(0, fy - 26, 0, fy + 26);
  fg.addColorStop(0, 'rgba(255,120,30,0)');
  fg.addColorStop(0.5, `rgba(255,${90 + Math.round(hellK * 30)},30,${(0.20 + 0.25 * pulse + hellK * 0.25).toFixed(3)})`);
  fg.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = fg;
  ctx.fillRect(cx - R * 1.5, fy - 26, R * 3, 52);

  // cinematic vignette
  const vg = ctx.createRadialGradient(cx, cy, H * 0.28, cx, cy, H * (0.72 + vignette * 0.2));
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${(0.55 + 0.38 * vignette).toFixed(3)})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Lava cracks radiating outward — the eruption. k: 0..1. */
export function drawOdCracks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  t: number,
  k: number,
  reducedMotion: boolean,
): void {
  if (k <= 0.01) return;
  const rnd = mulberry32(4242);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flick = reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin(t * 17);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + rnd() * 0.5;
    const len = R * (0.55 + rnd() * 0.75) * k;
    let r = R * 0.92;
    let px = cx + Math.cos(a) * r;
    let py = cy + Math.sin(a) * r;
    ctx.strokeStyle = `rgba(255,${120 + Math.round(60 * rnd())},20,${(0.85 * k * flick).toFixed(3)})`;
    ctx.lineWidth = (2 + 3.5 * k) * (0.7 + rnd() * 0.6);
    ctx.beginPath();
    ctx.moveTo(px, py);
    const steps = 4;
    for (let s = 1; s <= steps; s++) {
      r += len / steps;
      const ja = a + (rnd() - 0.5) * 0.55;
      px = cx + Math.cos(ja) * r;
      py = cy + Math.sin(ja) * r;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    // white-hot core line
    ctx.strokeStyle = `rgba(255,240,200,${(0.5 * k * flick).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

/** Reveal burst: expanding shockwave rings + rotating rays. k: 0..1. */
export function drawOdRevealBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  k: number,
  color: string,
  t: number,
  reducedMotion: boolean,
): void {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let ring = 0; ring < 2; ring++) {
    const rk = Math.max(0, Math.min(1, k * 1.6 - ring * 0.45));
    if (rk <= 0) continue;
    ctx.globalAlpha = (1 - rk) * 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 + 9 * (1 - rk);
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.35 + 1.7 * rk), 0, TAU);
    ctx.stroke();
  }
  // rotating rays
  const rays = 12;
  ctx.globalAlpha = (1 - k) * 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU + (reducedMotion ? 0 : t * 0.8);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5);
    ctx.lineTo(cx + Math.cos(a) * R * (1.15 + 0.5 * k), cy + Math.sin(a) * R * (1.15 + 0.5 * k));
    ctx.stroke();
  }
  ctx.restore();
}

/** Takeover title: slams in with scale + shake. k: 0..1. */
export function drawOdTakeoverTitle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  k: number,
  title: string,
  sub: string,
  reducedMotion: boolean,
): void {
  if (k <= 0.01) return;
  const kk = Math.min(1, k * 1.12);
  const back = kk < 1 ? 1 + 2.2 * Math.pow(kk - 1, 3) + 1.2 * Math.pow(kk - 1, 2) * -1.2 : 1; // easeOutBack-ish
  const scale = Math.max(0.4, 2.4 - 1.4 * Math.min(1, back));
  const alpha = Math.min(1, k * 4);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (!reducedMotion) ctx.translate((Math.random() - 0.5) * 6 * (1 - k), (Math.random() - 0.5) * 6 * (1 - k));
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '10px';
  } catch { /* older canvas */ }
  ctx.font = '900 58px system-ui, sans-serif';
  if (!reducedMotion) {
    ctx.shadowColor = 'rgba(255,120,30,0.9)';
    ctx.shadowBlur = 42;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(title, 2.5, 3.5);
  const tg = ctx.createLinearGradient(0, -30, 0, 30);
  tg.addColorStop(0, '#fff6e0');
  tg.addColorStop(0.55, '#ffc46b');
  tg.addColorStop(1, '#ff7a1f');
  ctx.fillStyle = tg;
  ctx.fillText(title, 0, 0);
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '4px';
  } catch { /* older canvas */ }
  if (sub) {
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffb347';
    ctx.fillText(sub, 0, 52);
  }
  ctx.restore();
}

/** Ambient embers orbiting the wheel (deterministic drift). */
export function drawOdEmbers(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  t: number,
  heat: number,
  streakHeat: number,
  reducedMotion: boolean,
): void {
  const count = reducedMotion ? 8 : 26;
  const rnd = mulberry32(31337);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const a0 = rnd() * TAU;
    const rr = R + 34 + rnd() * 150;
    const speed = 0.15 + rnd() * 0.5;
    const a = reducedMotion ? a0 : a0 + t * speed * 0.25;
    const rise = reducedMotion ? 0 : ((t * (14 + rnd() * 26) + rnd() * 120) % 160);
    const ex = cx + Math.cos(a) * rr;
    const ey = cy + Math.sin(a) * rr * 0.9 - rise;
    const flick = reducedMotion ? 0.5 : 0.35 + 0.65 * Math.abs(Math.sin(t * (2 + rnd() * 4) + i * 2.4));
    const sz = 1.2 + rnd() * 2.6;
    const hot = rnd() < 0.25 + streakHeat * 0.4;
    ctx.globalAlpha = flick * (0.25 + heat * 0.5 + streakHeat * 0.25);
    ctx.fillStyle = hot ? '#ffd34d' : '#ff7a2a';
    ctx.beginPath();
    ctx.arc(ex, ey, sz, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
