/**
 * STARFORGE game orchestrator — state machine, animation timeline, input.
 * Owns the canvas frame loop; DOM chrome lives in main.ts (wired via callbacks).
 */
import {
  ART,
  CELLS,
  COLS,
  NOVA_TRIGGER_STARS,
  ROWS,
  SYM,
  countStars,
  cryptoRng,
  drawGrid,
  finalizeSpin,
  runSpin,
  type ByteRng,
  type FinalizedSpin,
  type SpinResult,
} from './engine';
import {
  NOVA_START_RESPINS,
  playNova,
  type NovaEvent,
  type NovaKind,
  type NovaResult,
} from './nova';
import {
  LH,
  LW,
  drawAnvil,
  drawBackground,
  drawCrucible,
  drawParticles,
  drawRays,
  drawSymbol,
  spawnEmbers,
  spawnForgeBurst,
  updateParticles,
  type Particle,
} from './render';
import {
  drawFxBolt,
  drawFxLaser,
  drawFxPopup,
  drawFxRing,
  drawFxStreak,
  drawNovaBackground,
  drawNovaCore,
  drawNovaFrame,
  drawNovaRespins,
  drawNovaTitle,
  drawNovaTotal,
  makeBoltPts,
  novaCellCenter,
  type FxBolt,
  type FxLaser,
  type FxPopup,
  type FxRing,
  type FxStreak,
  type NovaCoreDraw,
} from './novaRender';
import { audio } from './audio';
import { Crucible, type ArtifactKey } from './crucible';
import { STR, type Locale } from './i18n';
import {
  HELL_X,
  OD_CHARGE_MAX,
  OdTracker,
  planOverdrive,
  type OdHeat,
  type OdPlan,
  type OdSegment,
} from './overdrive';
import {
  OD_SEG_META,
  OD_WHEEL_ORDER,
  drawHellWheel,
  drawOdPointer,
  drawOdWheel,
  odAngleForSegment,
  odSegmentAt,
  type OdWheelLabels,
} from './overdriveRender';

export const BETS = [1, 2, 5, 10, 25, 50, 100];
const PITCH = 116; // cell + gap
const CELL = 104;
export const GRID_X = 298;
export const GRID_Y = 116;

export type GameState = 'idle' | 'busy' | 'nova' | 'overdrive' | 'hostwait';
export type Mode = 'demo' | 'host';

export interface WinEntry {
  bet: number;
  winX: number;
  win: number;
  nova: boolean;
}

export interface GameCallbacks {
  setBusy(busy: boolean, label?: string): void;
  setBalance(text: string): void;
  pushHistory(e: WinEntry): void;
  forgeIgnite(keys: ArtifactKey[]): void;
  payBadge(text: string): void;
  winBanner(tier: 0 | 1 | 2, title: string, amountText: string, sub: string): void;
  clearBanner(): void;
  toast(msg: string): void;
  crucibleChanged(): void;
  canAfford(): boolean;
}

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const easeOutCubic = (k: number): number => 1 - Math.pow(1 - k, 3);
const easeInCubic = (k: number): number => k * k * k;
const easeOutBack = (k: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
const easeOutBounce = (k: number): number => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (k < 1 / d1) return n1 * k * k;
  if (k < 2 / d1) return n1 * (k -= 1.5 / d1) * k + 0.75;
  if (k < 2.5 / d1) return n1 * (k -= 2.25 / d1) * k + 0.9375;
  return n1 * (k -= 2.625 / d1) * k + 0.984375;
};

interface CellV {
  sym: number;
  dy: number;
  alpha: number;
  scale: number;
  glow: number;
  shimmer: boolean;
}

const fmtInt = (n: number): string => Math.floor(n).toLocaleString('en-US');
const fmtX = (x: number): string => (Math.round(x * 100) / 100).toString();

/**
 * Live state of the NOVA FURNACE bonus. The math arrives as an event log
 * (see nova.ts); this scene replays it cinematically. Math and visuals can
 * never diverge because the visuals only render the logged events.
 */
interface NovaScene {
  phase: 'collapse' | 'entry' | 'play' | 'finale';
  phaseK: number; // collapse progress 0..1
  entryK: number; // chamber emergence 0..1
  titleK: number; // title punch 0..1
  cores: (NovaCoreDraw | null)[]; // one slot per forge cell (20)
  bolts: FxBolt[];
  lasers: FxLaser[];
  rings: FxRing[];
  popups: FxPopup[];
  streaks: FxStreak[];
  respinsLeft: number;
  maxRespins: number;
  heat: number; // molten intensity 0..1 (eased)
  heatTarget: number;
  shimmerT: number; // anticipation shimmer on empty cells
  appearK: number[]; // per-cell frame emergence
  finaleK: number;
  finaleShown: number;
  finaleTotal: number;
  tickAcc: number;
}

/**
 * Live state of the FURNACE OVERDRIVE wheel. The math arrives as an OdPlan
 * (see overdrive.ts); this scene replays it cinematically: a rigged wheel
 * spin with real-feeling physics (ease-out deceleration, segment ticks,
 * suspense riser) that always settles on the planned segment.
 */
interface OdScene {
  angle: number;
  targetAngle: number;
  segIdx: number; // planned segment index in OD_WHEEL_ORDER
  lastSeg: number; // last segment under the pointer (for ticks)
  bounce: number; // pointer bounce 0..1, decays
  urgency: number; // 0..1 as the wheel slows (pointer zoom + tick pitch)
  phase: 'spin' | 'reveal' | 'hell';
  revealK: number; // 0..1 spotlight settle
  heat: number; // visual heat 0..1
  // hell-mode inner wheel
  hellAngle: number;
  hellTarget: number;
  hellIdx: number; // planned prize index in HELL_X
  hellLast: number;
  hellK: number; // 0..1 inner wheel emergence
}

const OD_STORAGE_KEY = 'starforge-od-v1';

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: GameCallbacks;
  locale: Locale = 'es';
  mode: Mode = 'demo';
  state: GameState = 'idle';
  crucible = new Crucible();
  rng: ByteRng = cryptoRng();
  balance = 1000;
  betIdx = 2; // 5
  reducedMotion = false;

  private raf = 0;
  private t = 0;
  private lastTs = 0;
  private dead = false;
  private skipFlag = false;
  private particles: Particle[] = [];
  private cells: CellV[] = [];
  private gridOn = false;
  private shakeT = 0;
  private shakeDur = 0;
  private shakeMag = 0;
  private flash = 0;
  private crucibleFlash = 0;
  private raysT = -1; // >=0 while big-win rays show
  /** Live NOVA FURNACE bonus scene (null outside the bonus). */
  private nova: NovaScene | null = null;
  /** FURNACE OVERDRIVE charge + live wheel scene. Persists across screens. */
  readonly od = new OdTracker();
  private odScene: OdScene | null = null;
  private odMilestone = 0; // charge milestones crossed (0..4 of 25/50/75/100)

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks, locale: Locale) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.cb = cb;
    this.locale = locale;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      const b = localStorage.getItem('starforge-bet');
      if (b !== null) {
        const i = BETS.indexOf(Number(b));
        if (i >= 0) this.betIdx = i;
      }
    } catch { /* ignore */ }

    // decorative idle grid
    const g = drawGrid(this.rng);
    this.cells = g.map(sym => ({ sym, dy: 0, alpha: 0.5, scale: 1, glow: 0, shimmer: false }));
    this.gridOn = true;

    // overdrive charge persists across screens and sessions
    try {
      this.od.load(localStorage.getItem(OD_STORAGE_KEY));
      this.odMilestone = Math.floor(this.od.charge / 25);
    } catch { /* ignore */ }

    canvas.addEventListener('pointerdown', () => this.onPointerDown());
  }

  /** Persist the overdrive charge (session continuity). */
  saveOd(): void {
    try {
      localStorage.setItem(OD_STORAGE_KEY, this.od.serialize());
    } catch { /* ignore */ }
  }

  resetOd(): void {
    this.od.reset();
    this.odMilestone = 0;
    this.saveOd();
  }

  get S(): (typeof STR)[Locale] {
    return STR[this.locale];
  }
  get bet(): number {
    return BETS[this.betIdx]!;
  }
  get artifacts(): number {
    return this.crucible.bitmask;
  }

  // ------------------------------------------------------------------ loop
  start(): void {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      if (this.dead) return;
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.t += dt;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  private update(dt: number): void {
    updateParticles(this.particles, dt);
    if (this.shakeT < this.shakeDur) this.shakeT += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.crucibleFlash > 0) this.crucibleFlash = Math.max(0, this.crucibleFlash - dt * 1.8);
    if (this.raysT >= 0) {
      this.raysT += dt;
      if (this.raysT > 3.2) this.raysT = -1;
    }
    if (this.nova) this.updateNova(this.nova, dt);
    if (this.odScene) {
      const os = this.odScene;
      if (os.bounce > 0) os.bounce = Math.max(0, os.bounce - dt * 5);
      os.heat = Math.min(1, os.heat + dt * 0.5);
    }
  }

  private render(): void {
    const { ctx } = this;
    const s = this.canvas.width / LW;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, LW, LH);

    // screen shake
    let shx = 0;
    let shy = 0;
    if (this.shakeT < this.shakeDur && !this.reducedMotion) {
      const k = 1 - this.shakeT / this.shakeDur;
      shx = (Math.random() * 2 - 1) * this.shakeMag * k;
      shy = (Math.random() * 2 - 1) * this.shakeMag * k;
    }

    drawBackground(ctx, this.t, { shakeX: shx, shakeY: shy, flash: this.flash, reducedMotion: this.reducedMotion });

    ctx.save();
    ctx.translate(shx, shy);

    // crucible vessel (left panel)
    drawCrucible(ctx, 48, 168, 120, 232, this.crucible.progress(), this.t, this.crucibleFlash, this.reducedMotion);

    // anvil + grid
    drawAnvil(ctx, 256, 88, 768, 624);
    if (this.gridOn) this.drawGrid();

    // big-win rays behind banner
    if (this.raysT >= 0) {
      drawRays(ctx, LW / 2, LH * 0.42, this.t, 'rgba(255,179,71,0.5)', Math.max(0, 0.8 - this.raysT * 0.25), this.reducedMotion);
    }

    drawParticles(ctx, this.particles);
    ctx.restore();

    // NOVA FURNACE overlay (no shake on the base scene)
    if (this.nova) this.drawNova(this.nova);

    // OVERDRIVE charge bar: always visible except inside bonus cinematics
    if (!this.nova && !this.odScene) this.drawOdBar();

    // FURNACE OVERDRIVE wheel overlay
    if (this.odScene) this.drawOdScene(this.odScene);
  }

  /**
   * The forge charge bar: every paid spin heats it; losses heat it fastest.
   * Pulses near full, bursts embers at 25/50/75 milestones.
   */
  private drawOdBar(): void {
    const { ctx } = this;
    const S = this.S;
    const x = 36;
    const y = 652;
    const w = 224;
    const h = 44;
    const charge = Math.min(1, this.od.charge / OD_CHARGE_MAX);
    const hot = charge >= 0.8 && !this.reducedMotion;
    const pulse = hot ? 1 + 0.035 * Math.sin(this.t * 9) : 1;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-(x + w / 2), -(y + h / 2));

    // housing
    ctx.fillStyle = 'rgba(8,5,3,0.82)';
    ctx.strokeStyle = '#3a2a16';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();

    // label (single centered line at 100% to avoid collision)
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 13px system-ui, sans-serif';
    if (charge >= 1) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(S.odFull, x + w / 2, y + 19);
    } else {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffb347';
      ctx.fillText(S.overdrive, x + 12, y + 19);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#c9a86a';
      ctx.fillText(`${Math.floor(charge * 100)}%`, x + w - 12, y + 19);
    }

    // track
    const tx = x + 12;
    const ty = y + 25;
    const tw = w - 24;
    const th = 10;
    ctx.fillStyle = '#120b06';
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 5);
    ctx.fill();

    // molten fill
    if (charge > 0.005) {
      const fw = Math.max(8, tw * charge);
      const fg = ctx.createLinearGradient(tx, 0, tx + tw, 0);
      fg.addColorStop(0, '#7a2400');
      fg.addColorStop(0.5, '#ff7b1c');
      fg.addColorStop(0.85, '#ffd34d');
      fg.addColorStop(1, '#fff6d8');
      ctx.save();
      if (!this.reducedMotion && charge > 0.25) {
        ctx.shadowColor = `rgba(255,${110 + Math.round(charge * 90)},30,${0.35 + charge * 0.5})`;
        ctx.shadowBlur = 8 + charge * 22;
      }
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.roundRect(tx, ty, fw, th, 5);
      ctx.fill();
      ctx.restore();
      // licking flame tips on the fill edge
      if (!this.reducedMotion && charge > 0.1 && charge < 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const fx = tx + fw - 4 + (i - 1) * 7;
          const fh = 6 + 4 * Math.sin(this.t * 13 + i * 2.4) + charge * 5;
          const fl = ctx.createLinearGradient(0, ty, 0, ty - fh);
          fl.addColorStop(0, 'rgba(255,180,60,0.85)');
          fl.addColorStop(1, 'rgba(255,120,20,0)');
          ctx.fillStyle = fl;
          ctx.beginPath();
          ctx.moveTo(fx - 3.5, ty + 2);
          ctx.quadraticCurveTo(fx, ty - fh, fx + 3.5, ty + 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // milestone ticks 25/50/75
    ctx.fillStyle = 'rgba(255,220,160,0.5)';
    for (const m of [0.25, 0.5, 0.75]) {
      ctx.fillRect(tx + tw * m - 1, ty - 2, 2, th + 4);
    }
    ctx.restore();
  }

  private odLabels(): OdWheelLabels {
    const S = this.S;
    return {
      rescue: S.odSegRescue,
      winmult: S.odSegWinmult,
      second: S.odSegSecond,
      instant: S.odSegInstant,
      hell: S.odSegHell,
      reheat: S.odSegReheat,
      title: S.overdrive,
    };
  }

  /** Render the overdrive wheel scene (spin + hell inner wheel). */
  private drawOdScene(os: OdScene): void {
    const { ctx } = this;
    const cx = 640;
    const cy = 400;
    const R = 265;
    const pointerA = -Math.PI / 2;

    // dim the forge behind the wheel
    ctx.save();
    ctx.fillStyle = 'rgba(4,2,1,0.72)';
    ctx.fillRect(0, 0, 1280, 800);
    ctx.restore();

    if (os.phase === 'hell') {
      const k = this.reducedMotion ? 1 : Math.min(1, os.hellK);
      const hr = 150 * (0.6 + 0.4 * k);
      // outer ring shows the landed HELL segment ghosted behind
      drawOdWheel(ctx, cx, cy, R, os.angle, this.t, this.odLabels(), os.segIdx, os.heat, this.reducedMotion);
      ctx.save();
      ctx.globalAlpha = k;
      drawHellWheel(ctx, cx, cy, hr, os.hellAngle, [...HELL_X], this.t, os.hellLast >= 0 ? os.hellLast : -1, this.reducedMotion, this.S.odSegHell);
      drawOdPointer(ctx, cx, cy, hr, os.bounce, os.urgency, this.reducedMotion);
      ctx.restore();
      return;
    }

    const highlight = os.phase === 'reveal' ? os.segIdx : -1;
    drawOdWheel(ctx, cx, cy, R, os.angle, this.t, this.odLabels(), highlight, os.heat, this.reducedMotion);
    drawOdPointer(ctx, cx, cy, R, os.bounce, os.urgency, this.reducedMotion);

    // reveal spotlight text
    if (os.phase === 'reveal') {
      const k = this.reducedMotion ? 1 : Math.min(1, os.revealK);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.textAlign = 'center';
      ctx.font = '900 44px system-ui, sans-serif';
      const seg = OD_WHEEL_ORDER[os.segIdx]!;
      const meta = OD_SEG_META[seg];
      ctx.fillStyle = meta.color;
      if (!this.reducedMotion) {
        ctx.shadowColor = meta.glow;
        ctx.shadowBlur = 30;
      }
      const label = this.odLabels()[seg];
      ctx.fillText(label, cx, cy - R - 78);
      ctx.restore();
    }
    void pointerA;
  }

  // ------------------------------------------------------------ nova bonus
  private updateNova(nv: NovaScene, dt: number): void {
    for (const b of nv.bolts) b.t += dt;
    for (const l of nv.lasers) l.t += dt;
    for (const r of nv.rings) r.t += dt;
    for (const p of nv.popups) p.t += dt;
    for (const st of nv.streaks) st.t += dt;
    nv.bolts = nv.bolts.filter(b => b.t < b.dur);
    nv.lasers = nv.lasers.filter(l => l.t < l.dur);
    nv.rings = nv.rings.filter(r => r.t < r.dur);
    nv.popups = nv.popups.filter(pp => pp.t < pp.dur);
    nv.streaks = nv.streaks.filter(st => st.t < st.dur);
    for (const c of nv.cores) {
      if (!c) continue;
      if (c.pulse > 0) c.pulse = Math.max(0, c.pulse - dt * 2.2);
      if (c.zap > 0) c.zap = Math.max(0, c.zap - dt * 1.6);
      if (c.spin > 0) c.spin = Math.max(0, c.spin - dt * 0.9);
      const d = c.value - c.shown;
      if (Math.abs(d) > 0.004) {
        c.shown += d * Math.min(1, dt * 9);
        nv.tickAcc += dt;
      }
    }
    if (nv.tickAcc > 0.085) {
      nv.tickAcc = 0;
      audio.tick();
    }
    if (nv.shimmerT > 0) nv.shimmerT -= dt;
    nv.heat += (nv.heatTarget - nv.heat) * Math.min(1, dt * 1.6);
  }

  /** The dimensional tear: the base universe collapses into the void. */
  private drawNovaCollapse(nv: NovaScene): void {
    const { ctx } = this;
    const k = nv.phaseK;
    ctx.save();
    const vg = ctx.createRadialGradient(LW / 2, LH / 2, 0, LW / 2, LH / 2, LH * (0.92 - 0.38 * k));
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.7, `rgba(10,2,6,${(0.6 * k).toFixed(3)})`);
    vg.addColorStop(1, `rgba(2,1,3,${(0.96 * k).toFixed(3)})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, LW, LH);
    if (!this.reducedMotion) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, k * 1.6);
      const cx = LW / 2;
      const cy = LH / 2;
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 + k * 0.7;
        const r0 = 130 + ((i * 197) % 260) + k * 420;
        const r1 = r0 + 100 + k * 180;
        const x0 = cx + Math.cos(a) * r0;
        const y0 = cy + Math.sin(a) * r0;
        const x1 = cx + Math.cos(a) * r1;
        const y1 = cy + Math.sin(a) * r1;
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(255,140,60,0)');
        g.addColorStop(1, 'rgba(255,170,90,0.55)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private drawNova(nv: NovaScene): void {
    const { ctx } = this;
    if (nv.phase === 'collapse') {
      this.drawNovaCollapse(nv);
      return;
    }
    drawNovaBackground(ctx, this.t, nv.heat, nv.entryK, this.reducedMotion);
    const occupied = nv.cores.map(c => c !== null);
    drawNovaFrame(ctx, this.t, occupied, nv.appearK, nv.shimmerT, this.reducedMotion);
    for (const c of nv.cores) if (c) drawNovaCore(ctx, c, this.t, this.reducedMotion);
    for (const r of nv.rings) drawFxRing(ctx, r);
    for (const l of nv.lasers) drawFxLaser(ctx, l, this.reducedMotion);
    for (const b of nv.bolts) drawFxBolt(ctx, b, this.reducedMotion);
    for (const st of nv.streaks) drawFxStreak(ctx, st);
    for (const p of nv.popups) drawFxPopup(ctx, p);
    if (nv.phase === 'play' || nv.phase === 'entry') {
      drawNovaTitle(ctx, nv.titleK, this.reducedMotion);
      if (nv.titleK > 0.9) drawNovaRespins(ctx, this.t, nv.respinsLeft, nv.maxRespins, this.reducedMotion);
    }
    if (nv.phase === 'finale') {
      drawRays(ctx, LW / 2, 380, this.t, 'rgba(255,179,71,0.5)', Math.min(1, nv.finaleK), this.reducedMotion);
      drawNovaTotal(ctx, this.t, nv.finaleShown, nv.finaleK, this.reducedMotion);
    }
  }

  /** Format a bonus delta (+1.5 / +2). */
  private fmtDelta(d: number): string {
    const r = Math.round(d * 10) / 10;
    return Number.isInteger(r) ? `+${r}` : `+${r.toFixed(1)}`;
  }

  private async novaRespinEv(nv: NovaScene, left: number): Promise<void> {
    nv.respinsLeft = left;
    audio.novaMusicTension(1 - left / NOVA_START_RESPINS);
    nv.heatTarget = 0.25 + (1 - left / NOVA_START_RESPINS) * 0.5;
    audio.novaRespin(left);
    if (!this.reducedMotion) this.addShake(2, 200);
    nv.shimmerT = 1.1; // anticipation on the empty sockets
    await this.wait(520);
  }

  private async novaLandEv(
    nv: NovaScene,
    lands: Array<{ cell: number; kind: NovaKind; value: number }>,
  ): Promise<void> {
    const drops = lands.map((l, i) => (async () => {
      await this.wait(i * 110);
      if (this.dead) return;
      const c: NovaCoreDraw = {
        cell: l.cell,
        kind: l.kind,
        value: l.value,
        shown: l.value,
        dropK: 0,
        pulse: 0,
        zap: 0,
        spin: 0,
        seed: Math.random(),
        flyX: 0,
        flyY: 0,
        flyA: 1,
      };
      nv.cores[l.cell] = c;
      audio.novaCoreLand(l.value);
      if (!this.reducedMotion) {
        const { x, y } = novaCellCenter(l.cell);
        nv.rings.push({ x, y, t: 0, dur: 0.5, color: l.kind === 'value' ? '#ffb347' : '#ffffff', maxR: l.kind === 'value' ? 60 : 95, width: 3 });
        if (l.kind !== 'value') {
          this.addShake(6, 320);
          this.flash = Math.max(this.flash, 0.4);
          audio.novaSpecial(l.kind);
          nv.heatTarget = Math.min(1, nv.heatTarget + 0.3);
          await this.wait(380);
        }
      }
      await this.tween(430, k => {
        c.dropK = k;
      });
    })());
    await Promise.all(drops);
  }

  private async novaPayerEv(
    nv: NovaScene,
    ev: Extract<NovaEvent, { t: 'payerFire' }>,
  ): Promise<void> {
    const pc = nv.cores[ev.cell];
    if (!pc) return;
    const { x: px, y: py } = novaCellCenter(ev.cell);
    pc.pulse = 1;
    audio.novaShockwave();
    if (!this.reducedMotion) {
      this.addShake(7, 450);
      nv.heatTarget = Math.min(1, nv.heatTarget + 0.25);
      nv.rings.push({ x: px, y: py, t: 0, dur: 0.7, color: '#ffd34d', maxR: 150, width: 6 });
      nv.rings.push({ x: px, y: py, t: 0.1, dur: 0.7, color: '#fff3c4', maxR: 105, width: 3 });
    }
    const beams = ev.targets.map((cell, i) => (async () => {
      await this.wait(140 + i * 110);
      if (this.dead) return;
      const { x: tx, y: ty } = novaCellCenter(cell);
      const mx = (px + tx) / 2;
      const my = (py + ty) / 2 - 70;
      nv.streaks.push({ x0: px, y0: py, x1: mx, y1: my, t: 0, dur: 0.3, color: '#ffd34d' });
      await this.wait(150);
      if (this.dead) return;
      nv.streaks.push({ x0: mx, y0: my, x1: tx, y1: ty, t: 0, dur: 0.25, color: '#ffd34d' });
      const tc = nv.cores[cell];
      if (tc) {
        tc.value += ev.add;
        tc.pulse = 1;
        nv.popups.push({ x: tx, y: ty - 46, text: this.fmtDelta(ev.add), t: 0, dur: 1, color: '#ffe9b8', size: 28 });
        nv.rings.push({ x: tx, y: ty, t: 0, dur: 0.45, color: '#ffd34d', maxR: 55, width: 3 });
        audio.novaCoreLand(Math.min(3, tc.value));
      }
    })());
    await Promise.all(beams);
    await this.wait(430);
  }

  private async novaSniperEv(
    nv: NovaScene,
    ev: Extract<NovaEvent, { t: 'sniperFire' }>,
  ): Promise<void> {
    const sc = nv.cores[ev.cell];
    if (!sc) return;
    const { x: sx, y: sy } = novaCellCenter(ev.cell);
    sc.pulse = 1;
    const shots = ev.targets.map((cell, i) => (async () => {
      await this.wait(i * 210);
      if (this.dead) return;
      const { x: tx, y: ty } = novaCellCenter(cell);
      nv.lasers.push({ x0: sx, y0: sy, x1: tx, y1: ty, t: 0, dur: 0.3 });
      audio.novaLaser();
      if (!this.reducedMotion) this.addShake(3, 180);
      await this.wait(150);
      if (this.dead) return;
      const tc = nv.cores[cell];
      if (tc) {
        tc.value *= 2;
        tc.pulse = 1;
        tc.zap = 0.9;
        nv.popups.push({ x: tx, y: ty - 48, text: '×2', t: 0, dur: 1, color: '#ff8a7a', size: 32 });
        nv.rings.push({ x: tx, y: ty, t: 0, dur: 0.4, color: '#ff5a3c', maxR: 60, width: 3 });
      }
    })());
    await Promise.all(shots);
    await this.wait(520);
  }

  private async novaCollectEv(
    nv: NovaScene,
    ev: Extract<NovaEvent, { t: 'collectFire' }>,
  ): Promise<void> {
    const cc = nv.cores[ev.cell];
    if (!cc) return;
    const { x: cx, y: cy } = novaCellCenter(ev.cell);
    cc.pulse = 1;
    cc.spin = 1; // magnet vortex spin-up
    audio.novaSpecial('collector');
    nv.heatTarget = 1;
    if (!this.reducedMotion) this.addShake(6, 520);
    await this.wait(520); // spin-up beat
    // lightning barrage: one bolt per absorbed core, staggered
    const strikes = ev.from.map((cell, i) => (async () => {
      await this.wait(i * 75);
      if (this.dead) return;
      const { x: tx, y: ty } = novaCellCenter(cell);
      const bolt: FxBolt = { pts: makeBoltPts(cx, cy, tx, ty), t: 0, dur: 0.34, color: '#ff8fb0', width: 5 };
      nv.bolts.push(bolt);
      if (!this.reducedMotion) {
        setTimeout(() => {
          if (!this.dead) bolt.pts = makeBoltPts(cx, cy, tx, ty);
        }, 95); // mid-flight crackle
      }
      audio.novaZap();
      const tc = nv.cores[cell];
      // the math keeps every target's value: the collector draws power
      // without draining (visual cores mirror the logged values exactly)
      const drawn = tc ? tc.value : 0;
      if (tc) tc.zap = 1;
      await this.wait(170);
      if (this.dead) return;
      nv.streaks.push({ x0: tx, y0: ty, x1: cx, y1: cy, t: 0, dur: 0.42, color: '#fb4d6d' });
      await this.wait(250);
      if (this.dead) return;
      cc.value += drawn;
      cc.pulse = Math.min(1, cc.pulse + 0.55);
      audio.tick();
    })());
    await Promise.all(strikes);
    cc.value = ev.newValue; // snap to the logged total (kills float drift)
    // detonation
    if (!this.reducedMotion) {
      this.flash = Math.max(this.flash, 0.55);
      this.addShake(8, 420);
      nv.rings.push({ x: cx, y: cy, t: 0, dur: 0.8, color: '#fb4d6d', maxR: 160, width: 6 });
      if (ev.from.length > 0) {
        for (let i = 0; i < 3; i++) spawnEmbers(this.particles, cx, cy, 22);
      }
    }
    nv.popups.push({ x: cx, y: cy - 62, text: this.fmtDelta(ev.gained), t: 0, dur: 1.2, color: '#ffffff', size: 34 });
    await this.wait(720);
  }

  private async novaFinaleEv(nv: NovaScene, totalX: number): Promise<void> {
    audio.novaMusicTension(1);
    nv.heatTarget = 1;
    await this.wait(480); // the held breath before the win
    // every core launches skyward as it dissolves into the total
    if (!this.reducedMotion) {
      for (const c of nv.cores) {
        if (!c) continue;
        const { x } = novaCellCenter(c.cell);
        const fx = (LW / 2 - x) * 0.35;
        const fy = -280 - Math.random() * 140;
        void this.tween(720, k => {
          c.flyX = fx * k;
          c.flyY = fy * k;
          c.flyA = 1 - k;
        });
      }
    } else {
      for (const c of nv.cores) if (c) c.flyA = 0;
    }
    this.flash = 1;
    if (!this.reducedMotion) {
      this.addShake(10, 800);
      for (let i = 0; i < 5; i++) {
        spawnEmbers(this.particles, LW / 2 + (Math.random() - 0.5) * 560, LH * 0.62, 30);
      }
      spawnForgeBurst(this.particles, LW / 2, 380);
    }
    audio.novaFanfare();
    nv.phase = 'finale';
    nv.finaleTotal = totalX;
    const dur = this.reducedMotion ? 220 : 2500;
    let lastTick = 0;
    await this.tween(dur, k => {
      nv.finaleShown = totalX * k;
      nv.finaleK = Math.min(1, k * 3);
      const now = performance.now();
      if (!this.reducedMotion && now - lastTick > Math.max(42, 115 - k * 75)) {
        lastTick = now;
        audio.tick();
      }
    }, easeOutCubic);
    nv.finaleShown = totalX;
    nv.finaleK = 1;
    await this.wait(2000);
  }

  /**
   * NOVA FURNACE bonus: dimensional entry, event-log replay, cinematic finale.
   * Returns the total win multiplier (×bet). The math comes from playNova();
   * the visuals only replay the logged events, so they can never diverge.
   */
  async presentNova(temple: boolean): Promise<number> {
    return this.playNovaResult(playNova(this.rng, temple));
  }

  /** Replay a pre-rolled NovaResult cinematically. Returns res.totalX. */
  private async playNovaResult(res: NovaResult): Promise<number> {
    const nv: NovaScene = {
      phase: 'collapse',
      phaseK: 0,
      entryK: 0,
      titleK: 0,
      cores: new Array(20).fill(null),
      bolts: [],
      lasers: [],
      rings: [],
      popups: [],
      streaks: [],
      respinsLeft: res.startRespins,
      maxRespins: res.startRespins,
      heat: 0,
      heatTarget: 0,
      shimmerT: 0,
      appearK: new Array(20).fill(0),
      finaleK: 0,
      finaleShown: 0,
      finaleTotal: res.totalX,
      tickAcc: 0,
    };
    this.nova = nv;
    this.state = 'nova';

    // ---- the universe tears open
    audio.novaEntry();
    if (!this.reducedMotion && !this.skipFlag && !this.dead) {
      await this.tween(950, k => {
        nv.phaseK = k;
      }, easeInCubic);
    }
    this.flash = 1;
    this.addShake(12, 600);

    // ---- the furnace materializes
    nv.phase = 'entry';
    if (!this.reducedMotion) {
      await this.tween(900, k => {
        nv.entryK = k;
      });
      await this.tween(1100, k => {
        for (let c = 0; c < 20; c++) nv.appearK[c] = Math.max(0, Math.min(1, (k - c * 0.022) * 2.4));
      });
      for (let c = 0; c < 20; c++) nv.appearK[c] = 1;
    } else {
      nv.entryK = 1;
      nv.appearK.fill(1);
    }
    // title punch + furnace score ignites
    audio.novaMusicStart();
    audio.novaCoreLand(3);
    if (!this.reducedMotion) {
      this.addShake(6, 380);
      await this.tween(480, k => {
        nv.titleK = k;
      }, easeOutBack);
    }
    nv.titleK = 1;
    nv.phase = 'play';

    // ---- replay the event log (consecutive landings play as one staggered batch)
    const evs = res.events;
    for (let i = 0; i < evs.length; i++) {
      if (this.dead) break;
      const ev = evs[i]!;
      if (ev.t === 'land') {
        const batch: Array<{ cell: number; kind: NovaKind; value: number }> = [ev];
        while (i + 1 < evs.length && evs[i + 1]!.t === 'land') {
          i++;
          batch.push(evs[i]! as { cell: number; kind: NovaKind; value: number });
        }
        await this.novaLandEv(nv, batch);
      } else if (ev.t === 'respin') {
        await this.novaRespinEv(nv, ev.left);
      } else if (ev.t === 'payerFire') {
        await this.novaPayerEv(nv, ev);
      } else if (ev.t === 'sniperFire') {
        await this.novaSniperEv(nv, ev);
      } else if (ev.t === 'collectFire') {
        await this.novaCollectEv(nv, ev);
      } else if (ev.t === 'end') {
        await this.novaFinaleEv(nv, ev.totalX);
      }
    }

    await this.wait(450);
    this.nova = null;
    this.state = 'busy';
    return res.totalX;
  }

  /**
   * Demo shortcut: jump straight into the Nova Furnace cinematic (?bonus=nova).
   * No spin, no bet deducted — pure showcase of the bonus round.
   * Showcase rule: re-roll the (genuine, random) bonus until it shows the
   * furnace at its best — a special core or a >=4x total — so the first
   * impression matches what the bonus can do. Still real RNG, no fake wins.
   */
  /**
   * Debug/test hook: play a bonus guaranteed to contain a special core of the
   * given kind. Exposed for automated visual verification; not wired to any UI.
   */
  async debugNovaSpecial(kind: 'collector' | 'payer' | 'sniper'): Promise<number> {
    for (let i = 0; i < 7 && this.state !== 'idle'; i++) await this.wait(500);
    if (this.state !== 'idle') return 0;
    this.state = 'busy';
    this.cb.setBusy(true, this.S.forging);
    this.cb.clearBanner();
    const fire = kind === 'collector' ? 'collectFire' : kind === 'payer' ? 'payerFire' : 'sniperFire';
    let res = playNova(this.rng, false);
    for (let attempt = 0; attempt < 400; attempt++) {
      const ok =
        kind === 'collector'
          ? res.events.some(e => e.t === 'collectFire' && e.from.length >= 3)
          : res.events.some(e => e.t === fire);
      if (ok) break;
      res = playNova(this.rng, false);
    }
    const total = await this.playNovaResult(res);
    this.state = 'idle';
    this.cb.setBusy(false, '');
    return total;
  }

  async demoNova(): Promise<void> {
    // wait for the host handshake to settle (demo fallback ~1500ms) before
    // forcing the idle-only bonus path
    for (let i = 0; i < 20 && this.state !== 'idle'; i++) await this.wait(500);
    if (this.state !== 'idle') return;
    this.state = 'busy';
    this.skipFlag = false;
    this.cb.setBusy(true, this.S.forging);
    this.cb.clearBanner();
    const bet = this.bet;
    const temple = (this.artifacts & ART.TEMPLE) !== 0;
    // pre-roll the bonus off-screen; play the first showcase-worthy result:
    // a rare (x25+) core, a chained special, or a >=6x total — the new
    // ceiling must be visible on first impression. Still real RNG.
    let total = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      const r = playNova(cryptoRng(), temple);
      const rare = r.events.some(e => e.t === 'land' && e.kind === 'value' && e.value >= 25);
      const special = r.events.some(e => e.t === 'collectFire' || e.t === 'payerFire' || e.t === 'sniperFire');
      if (r.totalX >= 6 || rare || special || attempt === 39) {
        total = await this.playNovaResult(r);
        break;
      }
    }
    this.balance += total * bet;
    this.cb.setBalance(this.balanceText());
    this.cb.winBanner(2, this.S.nova, `×${fmtX(total)}`, '');
    await this.wait(1800);
    this.cb.clearBanner();
    this.cb.pushHistory({ bet, winX: total, win: total * bet, nova: true });
    this.state = 'idle';
    this.cb.setBusy(false);
  }

  // ------------------------------------------------------- FURNACE OVERDRIVE
  private odTau(): number {
    return Math.PI * 2;
  }

  /** Rigged wheel spin: 5 full turns, ease-out settle on the planned segment. */
  private odWheelSpin(os: OdScene, pointerA: number): Promise<void> {
    return new Promise(res => {
      const dur = this.reducedMotion ? 700 : 6200;
      const t0 = performance.now();
      const step = () => {
        if (this.dead) return res();
        const k = Math.min(1, (performance.now() - t0) / dur);
        if (this.skipFlag) {
          os.angle = os.targetAngle;
          os.lastSeg = os.segIdx;
          os.urgency = 1;
          return res();
        }
        const e = 1 - Math.pow(1 - k, 4); // easeOutQuart: real deceleration feel
        os.angle = os.targetAngle * e;
        os.urgency = Math.min(1, k * 1.4);
        const seg = odSegmentAt(os.angle, pointerA);
        if (seg !== os.lastSeg) {
          os.lastSeg = seg;
          os.bounce = 1;
          audio.odTick(1 - k * 0.7);
        }
        if (k >= 1) {
          os.angle = os.targetAngle;
          return res();
        }
        requestAnimationFrame(step);
      };
      step();
    });
  }

  /** Hell inner-wheel spin: 4 turns, ease-out settle on the planned prize. */
  private odHellSpin(os: OdScene): Promise<void> {
    const TAU = this.odTau();
    const n = HELL_X.length;
    return new Promise(res => {
      const dur = this.reducedMotion ? 500 : 3600;
      const t0 = performance.now();
      const step = () => {
        if (this.dead) return res();
        const k = Math.min(1, (performance.now() - t0) / dur);
        if (this.skipFlag) {
          os.hellAngle = os.hellTarget;
          os.hellLast = os.hellIdx;
          return res();
        }
        const e = 1 - Math.pow(1 - k, 4);
        os.hellAngle = os.hellTarget * e;
        if (!this.reducedMotion) os.hellK = Math.min(1, os.hellK + 0.04);
        const rel = (((-Math.PI / 2 - os.hellAngle) % TAU) + TAU) % TAU;
        const seg = Math.floor((rel / TAU) * n) % n;
        if (seg !== os.hellLast) {
          os.hellLast = seg;
          os.bounce = 1;
          audio.odTick(1 - k * 0.6);
        }
        if (k >= 1) {
          os.hellAngle = os.hellTarget;
          return res();
        }
        requestAnimationFrame(step);
      };
      step();
    });
  }

  /** Flat xbet award with a forge banner (winmult / instant / hell). */
  private async odFlatAward(title: string, awardX: number, bet: number): Promise<void> {
    if (awardX <= 0) {
      this.cb.toast('—');
      await this.wait(this.reducedMotion ? 100 : 700);
      return;
    }
    const tier: 0 | 1 | 2 = awardX >= 50 ? 2 : awardX >= 10 ? 1 : 0;
    this.cb.winBanner(tier, title, `+${fmtInt(awardX * bet)}`, `×${fmtX(awardX)}`);
    audio.win(tier);
    if (!this.reducedMotion) {
      this.addShake(tier === 2 ? 10 : 4, tier === 2 ? 600 : 280);
      for (let i = 0; i < 3; i++) {
        spawnEmbers(this.particles, 640 + (Math.random() - 0.5) * 420, 400, tier === 2 ? 30 : 20);
      }
      if (tier === 2) this.raysT = 0;
    }
    await this.wait(this.reducedMotion ? 150 : tier === 2 ? 2200 : 1500);
    this.cb.clearBanner();
  }

  /** One free spin at face value (reheat segment). */
  private async odFreeSpin(bet: number, mult: number, label: string): Promise<number> {
    const spin = runSpin(this.rng, this.artifacts);
    await this.animateGrid(spin);
    let novaWinX = 0;
    if (spin.nova) novaWinX = await this.presentNova((this.artifacts & ART.TEMPLE) !== 0);
    const fin = finalizeSpin(spin, novaWinX);
    const award = fin.totalWinX * mult;
    if (award > 0) {
      this.cb.winBanner(1, label, `+${fmtInt(award * bet)}`, mult > 1 ? `×${fmtX(award)}` : '');
      audio.win(award >= 10 ? 1 : 0);
      await this.wait(this.reducedMotion ? 150 : 1300);
      this.cb.clearBanner();
    } else {
      audio.lose();
      await this.wait(this.reducedMotion ? 100 : 500);
    }
    return award;
  }

  /** RESCUE SPINS: free spins whose wins pay xmult. Never charges the bar. */
  private async odRescueSpins(plan: OdPlan, bet: number): Promise<number> {
    const S = this.S;
    let total = 0;
    for (let i = 0; i < plan.rescueN; i++) {
      if (this.dead) break;
      this.cb.payBadge(`${S.odRescueSpins} ${i + 1}/${plan.rescueN} · ×${plan.rescueMult}`);
      const spin = runSpin(this.rng, this.artifacts);
      await this.animateGrid(spin);
      let novaWinX = 0;
      if (spin.nova) novaWinX = await this.presentNova((this.artifacts & ART.TEMPLE) !== 0);
      const fin = finalizeSpin(spin, novaWinX);
      const award = fin.totalWinX * plan.rescueMult;
      total += award;
      if (award > 0) {
        const tier: 0 | 1 | 2 = award >= 10 ? 1 : 0;
        this.cb.winBanner(tier, `×${fmtX(award)}`, `+${fmtInt(award * bet)}`, `${S.odRescueSpins} ×${plan.rescueMult}`);
        audio.win(tier);
        if (!this.reducedMotion) {
          this.addShake(4, 260);
          spawnEmbers(this.particles, 640 + (Math.random() - 0.5) * 300, 400, 22);
        }
        await this.wait(this.reducedMotion ? 150 : 1100);
        this.cb.clearBanner();
      } else {
        audio.lose();
        await this.wait(this.reducedMotion ? 100 : 500);
      }
    }
    return total;
  }

  /** HELL MODE: the inner wheel erupts and spins for the big prize. */
  private async odHell(plan: OdPlan, bet: number): Promise<number> {
    const os = this.odScene;
    if (!os) return plan.hellPrizeX;
    const TAU = this.odTau();
    const n = HELL_X.length;
    const hellIdx = (HELL_X as readonly number[]).indexOf(plan.hellPrizeX);
    os.phase = 'hell';
    os.hellIdx = hellIdx;
    const jitter = (this.rng.nextByte() / 256 - 0.5) * 0.3;
    const segCenter = ((hellIdx + 0.5) / n) * TAU;
    const base = (((-Math.PI / 2 - segCenter + jitter) % TAU) + TAU) % TAU;
    os.hellTarget = base + TAU * 4;
    os.hellK = this.reducedMotion ? 1 : 0;
    audio.odIgnite();
    if (!this.reducedMotion) this.addShake(9, 600);
    await this.odHellSpin(os);
    audio.odRiser(this.reducedMotion ? 200 : 1100);
    await this.wait(this.reducedMotion ? 150 : 1200);
    audio.odWin('hell');
    this.flash = 1;
    if (!this.reducedMotion) {
      this.addShake(12, 700);
      for (let i = 0; i < 6; i++) spawnEmbers(this.particles, 640 + (Math.random() - 0.5) * 420, 400, 26);
    }
    const awardX = plan.hellPrizeX;
    await this.odFlatAward(this.S.odSegHell, awardX, bet);
    return awardX;
  }

  /**
   * FURNACE OVERDRIVE: the bar is full — the forge wheel ignites and the
   * planned segment resolves cinematically. Returns the award in xbet.
   * `rigged` forces a segment (debug / screenshots only).
   */
  async presentOverdrive(rigged?: OdSegment): Promise<number> {
    const TAU = this.odTau();
    const heat: OdHeat = this.od.heat();
    let plan: OdPlan = planOverdrive(this.rng, heat, this.od.state.lastWins);
    if (rigged) {
      for (let i = 0; i < 400 && plan.segment !== rigged; i++) {
        plan = planOverdrive(this.rng, heat, this.od.state.lastWins);
      }
    }
    const bet = this.bet;
    const temple = (this.artifacts & ART.TEMPLE) !== 0;
    const S = this.S;
    this.state = 'overdrive';
    this.skipFlag = false;
    this.cb.setBusy(true, S.overdrive);
    this.cb.clearBanner();

    audio.odMusicStart();
    audio.odIgnite();
    if (!this.reducedMotion) this.addShake(8, 500);

    const pointerA = -Math.PI / 2;
    const segIdx = OD_WHEEL_ORDER.indexOf(plan.segment);
    const jitter = (this.rng.nextByte() / 256 - 0.5) * 0.45;
    const base = ((odAngleForSegment(segIdx, pointerA, jitter) % TAU) + TAU) % TAU;
    const os: OdScene = {
      angle: 0,
      targetAngle: base + TAU * 5,
      segIdx,
      lastSeg: -1,
      bounce: 0,
      urgency: 0,
      phase: 'spin',
      revealK: 0,
      heat: 0,
      hellAngle: 0,
      hellTarget: 0,
      hellIdx: -1,
      hellLast: -1,
      hellK: 0,
    };
    this.odScene = os;
    await this.odWheelSpin(os, pointerA);

    // suspense beat before the reveal
    os.phase = 'reveal';
    audio.odRiser(this.reducedMotion ? 300 : 1400);
    if (!this.reducedMotion) this.addShake(4, 900);
    await this.tween(this.reducedMotion ? 200 : 1500, k => {
      os.revealK = k;
      os.urgency = 1 - k * 0.4;
    });
    os.revealK = 1;

    // ---- resolve the segment
    let awardX = 0;
    const seg = plan.segment;
    audio.odWin(seg);
    if (seg === 'rescue') {
      this.cb.winBanner(1, `${S.odRescueSpins} ×${plan.rescueMult}`, '', '');
      await this.wait(this.reducedMotion ? 200 : 1200);
      this.cb.clearBanner();
      awardX = await this.odRescueSpins(plan, bet);
    } else if (seg === 'winmult') {
      awardX = plan.winMult * plan.winBase;
      await this.odFlatAward(`${S.odSegWinmult} ×${plan.winMult}`, awardX, bet);
    } else if (seg === 'second') {
      this.cb.winBanner(2, S.odSegSecond, '', '');
      await this.wait(this.reducedMotion ? 200 : 1100);
      this.cb.clearBanner();
      this.odScene = null; // the furnace takes the stage
      awardX = await this.playNovaResult(playNova(this.rng, temple, true));
      this.state = 'overdrive';
    } else if (seg === 'instant') {
      awardX = plan.instantX;
      await this.odFlatAward(S.odSegInstant, awardX, bet);
    } else if (seg === 'hell') {
      awardX = await this.odHell(plan, bet);
    } else {
      // reheat: bar back to 50% + 1 free spin
      this.od.discharge(true);
      this.odMilestone = 2;
      this.saveOd();
      awardX = await this.odFreeSpin(bet, 1, S.odSegReheat);
    }
    if (seg !== 'reheat') {
      this.od.discharge(false);
      this.odMilestone = 0;
      this.saveOd();
    }

    this.odScene = null;
    this.balance += awardX * bet;
    this.refreshBalanceText();
    this.cb.pushHistory({ bet, winX: awardX, win: awardX * bet, nova: false });
    this.state = 'busy';
    this.cb.setBusy(false);
    return awardX;
  }

  /**
   * Demo shortcut: jump straight into FURNACE OVERDRIVE (?bonus=overdrive).
   * Fills the bar to 100% and fires the wheel. `heat` presets the recent
   * history for cold/hot adaptive-weight testing (?bonus=overdrive-cold/hot).
   */
  async debugOverdrive(heat?: OdHeat, segment?: OdSegment): Promise<number> {
    for (let i = 0; i < 20 && this.state !== 'idle'; i++) await this.wait(500);
    if (this.state !== 'idle') return 0;
    if (heat === 'cold') this.od.state.recent = new Array(20).fill(-1);
    else if (heat === 'hot') this.od.state.recent = new Array(20).fill(0.4);
    this.od.state.charge = OD_CHARGE_MAX;
    this.odMilestone = 4;
    this.saveOd();
    this.state = 'busy';
    const award = await this.presentOverdrive(segment);
    this.state = 'idle';
    return award;
  }

  /** Test hook: set the charge bar to a percentage (screenshots). */
  debugSetCharge(pct: number): void {
    this.od.state.charge = Math.max(0, Math.min(OD_CHARGE_MAX, pct));
    this.odMilestone = Math.floor(this.od.state.charge / 25);
    this.saveOd();
  }

  /**
   * Debug/test hook: play a furnace guaranteed to show a rare (x25+) core
   * or a chained special. Exposed for automated visual verification.
   */
  async debugNovaRare(): Promise<number> {
    for (let i = 0; i < 7 && this.state !== 'idle'; i++) await this.wait(500);
    if (this.state !== 'idle') return 0;
    this.state = 'busy';
    this.cb.setBusy(true, this.S.forging);
    this.cb.clearBanner();
    let res = playNova(this.rng, false);
    for (let attempt = 0; attempt < 600; attempt++) {
      const rare = res.events.some(e => e.t === 'land' && e.kind === 'value' && e.value >= 25);
      const chained = res.events.some(
        e => e.t === 'collectFire' || (e.t === 'sniperFire' && e.targets.length >= 2),
      );
      if (rare || res.totalX >= 25 || (chained && res.totalX >= 10)) break;
      res = playNova(this.rng, false);
    }
    const total = await this.playNovaResult(res);
    this.balance += total * this.bet;
    this.cb.setBalance(this.balanceText());
    this.state = 'idle';
    this.cb.setBusy(false, '');
    return total;
  }

  private drawGrid(): void {    const { ctx } = this;
    const at = this.reducedMotion ? 0 : this.t; // freeze idle motion when reduced
    for (let i = 0; i < CELLS; i++) {
      const c = this.cells[i]!;
      const col = i % COLS;
      const row = (i / COLS) | 0;
      const cx = GRID_X + col * PITCH + CELL / 2;
      const cy = GRID_Y + row * PITCH + CELL / 2 + c.dy;
      if (c.shimmer && !this.reducedMotion) {
        const p = 0.5 + 0.5 * Math.sin(this.t * 9 + i);
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.4 * p;
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        ctx.strokeRect(GRID_X + col * PITCH + 4, GRID_Y + row * PITCH + 4 + c.dy, CELL - 8, CELL - 8);
        ctx.restore();
      }
      if (c.alpha <= 0.01) continue;
      drawSymbol(ctx, c.sym, cx, cy, CELL * 0.86, at, {
        alpha: c.alpha,
        scale: c.scale,
        winGlow: c.glow,
      });
    }
  }

  cellCenter(i: number): { x: number; y: number } {
    const col = i % COLS;
    const row = (i / COLS) | 0;
    return { x: GRID_X + col * PITCH + CELL / 2, y: GRID_Y + row * PITCH + CELL / 2 };
  }

  // ------------------------------------------------------------- sequencing
  skip(): void {
    this.skipFlag = true;
  }

  private wait(ms: number): Promise<void> {
    return new Promise(res => {
      let m = this.reducedMotion ? Math.min(ms, 80) : ms;
      if (this.skipFlag || m <= 0 || this.dead) return res();
      const t0 = performance.now();
      const tick = () => {
        if (this.skipFlag || this.dead) return res();
        if (performance.now() - t0 >= m) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  private tween(durMs: number, onU: (k: number) => void, ease: (k: number) => number = easeOutCubic): Promise<void> {
    return new Promise(res => {
      const dur = this.reducedMotion ? Math.min(durMs, 90) : durMs;
      const t0 = performance.now();
      const step = () => {
        if (this.dead) return res();
        if (this.skipFlag) {
          onU(1);
          return res();
        }
        const k = (performance.now() - t0) / dur;
        if (k >= 1) {
          onU(1);
          return res();
        }
        onU(ease(k));
        requestAnimationFrame(step);
      };
      step();
    });
  }

  addShake(mag: number, durMs: number): void {
    if (this.reducedMotion) return;
    this.shakeMag = mag;
    this.shakeDur = durMs / 1000;
    this.shakeT = 0;
  }

  // ------------------------------------------------------------------ input
  private onPointerDown(): void {
    audio.unlock();
    audio.startAmbient();
    // during a bonus a tap skips the current beat
    if (this.state === 'nova' || this.state === 'overdrive') {
      this.skip();
      return;
    }
    if (this.state === 'busy') this.skip();
  }

  // --------------------------------------------------------------- demo spin
  setBetIdx(i: number): void {
    this.betIdx = Math.max(0, Math.min(BETS.length - 1, i));
    try {
      localStorage.setItem('starforge-bet', String(BETS[this.betIdx]));
    } catch { /* ignore */ }
  }

  async demoSpin(): Promise<void> {
    if (this.state !== 'idle') return;
    const bet = this.bet;
    if (bet > this.balance) {
      this.cb.toast(this.S.balance + ' —');
      return;
    }
    this.state = 'busy';
    this.skipFlag = false;
    this.cb.setBusy(true, this.S.forging);
    this.cb.clearBanner();
    this.balance -= bet;
    this.cb.setBalance(this.balanceText());

    // spin ignition: whoosh + forge burst + micro shake
    audio.spinWhoosh();
    if (!this.reducedMotion) {
      spawnForgeBurst(this.particles, GRID_X + (COLS * PITCH) / 2, GRID_Y + (ROWS * PITCH) / 2);
      this.addShake(3, 260);
    }

    const spin: SpinResult = runSpin(this.rng, this.artifacts);
    await this.animateGrid(spin);

    let novaWinX = 0;
    if (spin.nova) {
      novaWinX = await this.presentNova((this.artifacts & ART.TEMPLE) !== 0);
    }

    const fin: FinalizedSpin = finalizeSpin(spin, novaWinX);
    await this.presentWin(fin, bet);

    // overdrive charge: every paid spin heats the forge (losses fastest)
    const prevMilestone = this.odMilestone;
    const odFull = this.od.addSpin(this.rng, fin.totalWinX, spin.nova);
    this.odMilestone = Math.floor(this.od.charge / 25);
    this.saveOd();
    if (this.odMilestone > prevMilestone && !this.reducedMotion) {
      audio.odChargeK(this.odMilestone / 4);
      spawnEmbers(this.particles, 148, 470, 10 + this.odMilestone * 6);
    }
    if (odFull) {
      await this.presentOverdrive();
    }

    // crucible progression
    const forged = this.crucible.addEssence(fin.totalWinX);
    this.cb.crucibleChanged();
    if (forged.length > 0) {
      audio.forge();
      this.crucibleFlash = 1;
      this.addShake(9, 380);
      this.cb.forgeIgnite(forged);
      await this.wait(900);
    }

    this.balance += fin.totalWinX * bet;
    this.cb.setBalance(this.balanceText());
    this.cb.pushHistory({ bet, winX: fin.totalWinX, win: fin.totalWinX * bet, nova: !!spin.nova });
    this.state = 'idle';
    this.cb.setBusy(false);
  }

  private balanceText(): string {
    return this.mode === 'demo' ? `${fmtInt(this.balance)} ${this.S.demo}` : fmtInt(this.balance);
  }

  refreshBalanceText(): void {
    this.cb.setBalance(this.balanceText());
  }

  private async animateGrid(spin: SpinResult): Promise<void> {
    const S = this.S;
    // --- initial drop: column by column, 40ms stagger per cell
    const g0 = spin.grids[0]!;
    this.cells = g0.map(sym => ({ sym, dy: -900, alpha: 1, scale: 1, glow: 0, shimmer: false }));
    this.gridOn = true;

    // anticipation: find when the 3rd star lands
    const starCells: number[] = [];
    for (let i = 0; i < CELLS; i++) if (g0[i] === SYM.STAR) starCells.push(i);
    const delayOf = (i: number): number => {
      const col = i % COLS;
      const row = (i / COLS) | 0;
      return (col * ROWS + row) * 40;
    };
    starCells.sort((a, b) => delayOf(a) - delayOf(b));
    const thirdStarAt = starCells.length >= 3 ? delayOf(starCells[2]!) + 300 : Infinity;

    // suspense: 2+ stars landing early -> the last two columns drop slower (reel tension)
    const starsEarly = starCells.length >= 2 && delayOf(starCells[1]!) <= 800;
    const suspenseOf = (i: number): number => {
      if (!starsEarly) return 0;
      const col = i % COLS;
      return col === 4 ? 280 : col === 5 ? 430 : 0;
    };
    if (starsEarly && !this.reducedMotion) {
      setTimeout(() => {
        if (this.skipFlag || this.dead || this.state !== 'busy') return;
        audio.tensionRiser(900);
      }, delayOf(starCells[1]!) + 200);
    }

    const dropOne = async (i: number): Promise<void> => {
      const col = i % COLS;
      await this.wait(delayOf(i) + suspenseOf(i));
      if (this.skipFlag || this.dead) return;
      audio.drop(col);
      audio.clink(col);
      const c = this.cells[i]!;
      const dist = 900;
      await this.tween(340, k => {
        c.dy = -dist * (1 - k);
        c.scale = 0.7 + 0.3 * k;
      }, easeOutBack);
      c.dy = 0;
      c.scale = 1;
    };
    const drops = g0.map((_, i) => dropOne(i));
    // shimmer unlanded cells once 3 stars have landed
    if (thirdStarAt !== Infinity && !this.reducedMotion) {
      setTimeout(() => {
        if (this.skipFlag || this.dead || this.state !== 'busy') return;
        for (let i = 0; i < CELLS; i++) {
          if (delayOf(i) > thirdStarAt) this.cells[i]!.shimmer = true;
        }
        setTimeout(() => {
          for (const c of this.cells) c.shimmer = false;
        }, 900);
      }, thirdStarAt);
    }
    await Promise.all(drops);
    for (const c of this.cells) {
      c.dy = 0;
      c.scale = 1;
      c.shimmer = false;
    }

    if (countStars(g0) >= NOVA_TRIGGER_STARS) {
      // the furnace will ignite after cascade evaluation; brief beat
      await this.wait(250);
    }

    // --- cascade steps (cap is always 2)
    for (let s = 0; s < spin.steps.length; s++) {
      const step = spin.steps[s]!;
      if (step.payX <= 0) break;

      // win pulse 2x
      const winSet = new Set(step.winCells);
      const patSet = new Set(step.pattern ? step.pattern.cells : []);
      await this.tween(520, k => {
        const p = Math.abs(Math.sin(k * Math.PI * 2));
        for (const i of winSet) {
          const c = this.cells[i]!;
          c.glow = p;
          c.scale = 1 + 0.12 * p;
        }
        for (const i of patSet) {
          const c = this.cells[i]!;
          c.glow = Math.max(c.glow, p);
        }
      });
      for (const i of winSet) {
        this.cells[i]!.glow = 0;
        this.cells[i]!.scale = 1;
      }

      // pay badge + chime
      const tier: 0 | 1 | 2 = step.payX >= 50 ? 2 : step.payX >= 10 ? 1 : 0;
      this.cb.payBadge(`+${fmtX(step.payX)}×`);
      audio.win(tier);
      if (step.payX >= 10 && !this.reducedMotion) {
        this.addShake(4, 220);
        spawnEmbers(this.particles, GRID_X + (COLS * PITCH) / 2, GRID_Y + (ROWS * PITCH) / 2, 18);
      }

      // Yunque: boosted tier-3 scatter win → anvil slam
      if ((this.artifacts & ART.YUNQUE) !== 0 && step.wins.some(w => w.tier === 2)) {
        this.addShake(6, 150);
        audio.slam();
      }

      // dissolve into embers
      if (!this.reducedMotion) {
        for (const i of winSet) {
          const { x, y } = this.cellCenter(i);
          spawnEmbers(this.particles, x, y, 10);
        }
        // Brasa: boosted constellation burns brighter
        if ((this.artifacts & ART.BRASA) !== 0 && step.pattern) {
          for (const i of step.pattern.cells) {
            const { x, y } = this.cellCenter(i);
            spawnEmbers(this.particles, x, y, 14);
          }
          audio.ignite();
        }
      } else {
        audio.cascade();
      }
      await this.tween(300, k => {
        for (const i of winSet) {
          const c = this.cells[i]!;
          c.alpha = 1 - k;
          c.scale = 1 - 0.5 * k;
        }
      }, easeInCubic);
      for (const i of winSet) this.cells[i]!.alpha = 0;

      // refill drop (unless last evaluated step)
      const next = spin.grids[s + 1];
      if (!next) break;
      if (!this.reducedMotion) audio.cascade();
      const removed = new Set(step.winCells);
      const falls = this.computeFalls(spin.grids[s]!, next, removed);
      // apply new symbols immediately, animate dy
      for (let i = 0; i < CELLS; i++) this.cells[i]!.sym = next[i]!;
      const fallAnims: Promise<void>[] = [];
      for (let col = 0; col < COLS; col++) {
        for (let row = 0; row < ROWS; row++) {
          const i = row * COLS + col;
          const dist = falls[i]!;
          if (dist <= 0) {
            this.cells[i]!.alpha = 1;
            this.cells[i]!.scale = 1;
            continue;
          }
          fallAnims.push(
            (async (ii: number, d: number, dl: number, cc: number) => {
              await this.wait(dl);
              if (this.skipFlag || this.dead) return;
              const c = this.cells[ii]!;
              c.alpha = 1;
              await this.tween(380, k => {
                c.dy = -d * (1 - k);
              }, easeOutBounce);
              c.dy = 0;
              c.scale = 1;
              if (!this.skipFlag && !this.dead) audio.reelStop(cc);
            })(i, dist, col * 45, col),
          );
        }
      }
      await Promise.all(fallAnims);
      for (const c of this.cells) {
        c.dy = 0;
        c.alpha = 1;
        c.scale = 1;
        c.glow = 0;
      }
      void S;
    }
  }

  /** Per-cell fall distance (px) for a cascade refill. */
  private computeFalls(oldGrid: number[], newGrid: number[], removed: Set<number>): number[] {
    const falls = new Array<number>(CELLS).fill(0);
    for (let col = 0; col < COLS; col++) {
      const survRows: number[] = [];
      for (let row = ROWS - 1; row >= 0; row--) {
        const i = row * COLS + col;
        if (!removed.has(i)) survRows.push(row);
      }
      // new grid column bottom-up: survivors first (same order), then fresh
      for (let j = 0; j < ROWS; j++) {
        const newRow = ROWS - 1 - j;
        const i = newRow * COLS + col;
        if (j < survRows.length) {
          const oldRow = survRows[j]!;
          falls[i] = Math.max(0, (newRow - oldRow) * PITCH);
        } else {
          falls[i] = (newRow + 1) * PITCH + 120; // fresh from above
        }
        void oldGrid;
        void newGrid;
      }
    }
    return falls;
  }

  private async presentWin(fin: FinalizedSpin, bet: number): Promise<void> {
    const S = this.S;
    const x = fin.totalWinX;
    if (x <= 0) {
      audio.lose();
      return;
    }
    const amount = x * bet;
    const tier: 0 | 1 | 2 = x >= 50 ? 2 : x >= 10 ? 1 : 0;
    const title = tier === 2 ? S.legendary : tier === 1 ? `×${fmtX(x)}` : S.lastWin;
    if (tier === 2) {
      this.flash = 1;
      this.addShake(10, 650);
      this.raysT = 0;
      audio.legendaryBoom();
    } else if (tier === 1) {
      this.raysT = 0;
      this.addShake(3, 250);
    }
    if (!this.reducedMotion) {
      const bursts = tier === 2 ? 5 : 3;
      for (let k = 0; k < bursts; k++) {
        spawnEmbers(this.particles, LW / 2 + (Math.random() - 0.5) * 300, LH * 0.42, tier === 2 ? 30 : 24);
      }
    }
    audio.win(tier);
    // count-up with audible ticks
    const el = $('banner-amount');
    const dur = this.reducedMotion || this.skipFlag ? 60 : tier === 2 ? 2200 : tier === 1 ? 1500 : 900;
    this.cb.winBanner(tier, title, '', tier === 2 ? `×${fmtX(x)}` : '');
    let lastTick = 0;
    await this.tween(dur, k => {
      el.textContent = fmtInt(amount * k);
      const now = performance.now();
      if (!this.reducedMotion && now - lastTick > 110) {
        lastTick = now;
        audio.tick();
      }
    }, easeOutCubic);
    el.textContent = fmtInt(amount);
    await this.wait(tier === 2 ? 1600 : 1100);
    this.cb.clearBanner();
  }

  // ---------------------------------------------------------- host-mode API
  /** Generic celebration when the contract settles (grid unknown client-side). */
  async hostPresentWin(totalWinX: number, betUnits: number): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'hostwait') return;
    this.state = 'busy';
    this.skipFlag = false;
    this.cb.setBusy(true, this.S.sessionSettling);
    this.cb.clearBanner();
    const fin = { totalWinX } as FinalizedSpin;
    await this.presentWin(fin, betUnits);
    this.state = 'idle';
    this.cb.setBusy(false);
  }

  hostSetWaiting(): void {
    this.state = 'hostwait';
    this.cb.setBusy(true, this.S.waitingHost);
  }

  hostSetIdle(): void {
    if (this.state === 'hostwait') {
      this.state = 'idle';
      this.cb.setBusy(false);
    }
  }
}
