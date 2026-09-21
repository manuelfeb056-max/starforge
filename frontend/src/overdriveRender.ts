/**
 * FURNACE OVERDRIVE wheel rendering — a real casino-style forge wheel.
 * Pure canvas drawing; the spin physics live in game.ts.
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

/**
 * Draw the forge wheel. `angle` rotates the wheel; `highlight` (-1 = none)
 * spotlights the landed segment; `heat` 0..1 warms the rim.
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
): void {
  const n = OD_WHEEL_ORDER.length;
  const segA = TAU / n;

  ctx.save();

  // outer shadow / base
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 44;
  ctx.fillStyle = '#0d0a08';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 26, 0, TAU);
  ctx.fill();
  ctx.restore();

  // rim: riveted iron with heat glow
  const rimG = ctx.createRadialGradient(cx, cy, R - 6, cx, cy, R + 26);
  rimG.addColorStop(0, '#2b2118');
  rimG.addColorStop(0.55, '#171008');
  rimG.addColorStop(1, '#050302');
  ctx.fillStyle = rimG;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 26, 0, TAU);
  ctx.arc(cx, cy, R, 0, TAU, true);
  ctx.fill();
  if (!reducedMotion) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 + heat * 0.55 + 0.08 * Math.sin(t * 5.1);
    ctx.strokeStyle = `rgba(255,${120 + Math.round(heat * 90)},40,0.8)`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  // rivets
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU + 0.13;
    const rx = cx + Math.cos(a) * (R + 13);
    const ry = cy + Math.sin(a) * (R + 13);
    const rg = ctx.createRadialGradient(rx - 1.5, ry - 1.5, 0, rx, ry, 5);
    rg.addColorStop(0, '#cbb58a');
    rg.addColorStop(1, '#4a3a22');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(rx, ry, 4.6, 0, TAU);
    ctx.fill();
  }

  // segments
  for (let i = 0; i < n; i++) {
    const seg = OD_WHEEL_ORDER[i]!;
    const meta = OD_SEG_META[seg];
    const a0 = angle + i * segA;
    const a1 = a0 + segA;
    const isHi = i === highlight;

    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    g.addColorStop(0, meta.dark);
    g.addColorStop(0.75, meta.color + (isHi ? '' : 'cc'));
    g.addColorStop(1, meta.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fill();

    if (isHi && !reducedMotion) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 9);
      ctx.fillStyle = meta.glow;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // divider spokes
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
    const mid = a0 + segA / 2;
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

    // hell gets little flame pips
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

  // inner hub
  const hubR = R * 0.21;
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
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(hubR * 0.34)}px system-ui, sans-serif`;
  ctx.fillStyle = '#2b1404';
  const words = labels.title.split(' ');
  if (words.length > 1) {
    ctx.fillText(words[0]!, cx, cy - hubR * 0.18);
    ctx.fillText(words.slice(1).join(' '), cx, cy + hubR * 0.2);
  } else {
    ctx.fillText(labels.title, cx, cy);
  }
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
  // hub skull-ish core
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
