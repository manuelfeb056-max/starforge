/**
 * STARFORGE game orchestrator — state machine, animation timeline, input.
 * Owns the canvas frame loop; DOM chrome lives in main.ts (wired via callbacks).
 */
import {
  ART,
  CELLS,
  COLS,
  ROWS,
  SYM,
  countStars,
  cryptoRng,
  drawGrid,
  finalizeSpin,
  gamble as gambleFlip,
  runSpin,
  shufflePrizes,
  type ByteRng,
  type FinalizedSpin,
  type SpinResult,
} from './engine';
import {
  LH,
  LW,
  drawAnvil,
  drawBackground,
  drawCrucible,
  drawParticles,
  drawRays,
  drawSupernovaField,
  drawSymbol,
  quantumCubePositions,
  spawnEmbers,
  spawnForgeBurst,
  spawnSparks,
  updateParticles,
  type Particle,
  type QuantumCube,
} from './render';
import { audio } from './audio';
import { Crucible, type ArtifactKey } from './crucible';
import { STR, type Locale } from './i18n';

export const BETS = [1, 2, 5, 10, 25, 50, 100];
const PITCH = 116; // cell + gap
const CELL = 104;
export const GRID_X = 298;
export const GRID_Y = 116;

export type GameState = 'idle' | 'busy' | 'supernova' | 'gamble' | 'hostwait';
export type Mode = 'demo' | 'host';

export interface WinEntry {
  bet: number;
  winX: number;
  win: number;
  supernova: boolean;
}

export interface GameCallbacks {
  setBusy(busy: boolean, label?: string): void;
  setBalance(text: string): void;
  pushHistory(e: WinEntry): void;
  forgeIgnite(keys: ArtifactKey[]): void;
  payBadge(text: string): void;
  winBanner(tier: 0 | 1 | 2, title: string, amountText: string, sub: string): void;
  clearBanner(): void;
  picksStatus(text: string): void;
  gambleChoice(amountText: string): Promise<boolean>;
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
  private supernova: {
    boxes: QuantumCube[];
    zoom: number;
    fieldT: number;
    prizes: number[];
    picks: number[];
    resolve: (v: { picks: number[]; gamble: boolean }) => void;
    done: boolean;
  } | null = null;

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

    canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
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
    if (this.supernova) {
      const sn = this.supernova;
      sn.fieldT += dt;
      for (const b of sn.boxes) {
        if (b.dim && b.dimT < 1) b.dimT = Math.min(1, b.dimT + dt * 2.2);
        if (b.ringT > 0 && b.ringT < 1) b.ringT = Math.min(1, b.ringT + dt * 2.4);
        if (b.phase === 'shaking') {
          b.phaseT += dt;
          if (b.phaseT >= 0.5) {
            // cube destabilizes: glitch burst
            b.phase = 'bursting';
            b.phaseT = 0;
            audio.cubeBreak();
            if (!this.reducedMotion) {
              spawnSparks(this.particles, b.x, b.y - 20, 30, '#22d3ee');
              spawnSparks(this.particles, b.x, b.y - 20, 16, '#d946ef');
            }
            this.addShake(4, 280);
          }
        } else if (b.phase === 'bursting') {
          b.phaseT += dt;
          if (b.phaseT >= 1.0) {
            b.phase = 'revealed';
            b.phaseT = 0;
            b.shown = 0;
            b.tickAcc = 0;
            audio.cubeReveal(b.prize);
          }
        } else if (b.phase === 'revealed') {
          b.phaseT += dt;
          if (b.shown < b.prize) {
            b.shown = Math.min(b.prize, b.shown + (b.prize * dt) / 0.7);
            b.tickAcc += dt;
            if (b.tickAcc > 0.09) {
              b.tickAcc = 0;
              audio.tick();
            }
          }
        }
      }
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

    // supernova overlay (no shake)
    if (this.supernova) {
      drawSupernovaField(ctx, this.t, this.supernova.zoom, this.supernova.boxes, this.supernova.fieldT, this.reducedMotion);
    }
  }

  private drawGrid(): void {
    const { ctx } = this;
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
  private onPointerDown(e: PointerEvent): void {
    audio.unlock();
    audio.startAmbient();
    if (this.state === 'supernova' && this.supernova && !this.supernova.done) {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * LW;
      const y = ((e.clientY - rect.top) / rect.height) * LH;
      this.pickBoxAt(x, y);
      return;
    }
    if (this.state === 'busy') this.skip();
  }

  private pickBoxAt(x: number, y: number): void {
    const sn = this.supernova;
    if (!sn || sn.picks.length >= 5) return;
    for (let i = 0; i < sn.boxes.length; i++) {
      const b = sn.boxes[i]!;
      if (b.picked) continue;
      if (Math.hypot(b.x - x, b.y - y) < 58) {
        b.picked = true;
        b.phase = 'shaking';
        b.phaseT = 0;
        b.ringT = 0.001;
        sn.picks.push(i);
        audio.pick(2);
        audio.supernovaMusicLayer(sn.picks.length);
        if (!this.reducedMotion) spawnSparks(this.particles, b.x, b.y, 18, '#22d3ee');
        const left = 5 - sn.picks.length;
        this.cb.picksStatus(left > 0 ? this.S.picksLeft(left) : '');
        if (sn.picks.length >= 5) void this.finishPicks();
        return;
      }
    }
  }

  private async finishPicks(): Promise<void> {
    const sn = this.supernova;
    if (!sn || sn.done) return;
    sn.done = true;
    // let the cube bursts + reveals play out, then the drop hits
    audio.supernovaMusicDrop();
    await this.wait(1500);
    for (const b of sn.boxes) if (!b.picked) b.dim = true;
    this.cb.picksStatus('');
    const sumX = sn.picks.reduce((s, i) => s + sn.prizes[i]!, 0);
    const gamble = await this.cb.gambleChoice(`×${fmtX(sumX)}`);
    // zoom out
    if (!this.reducedMotion) {
      await this.tween(350, k => {
        sn.zoom = 1 - k;
      });
    } else {
      sn.zoom = 0;
    }
    this.supernova = null;
    this.state = 'busy';
    sn.resolve({ picks: sn.picks, gamble });
  }

  /**
   * Interactive supernova overlay. Resolves with the 5 picked indices and
   * the player's gamble choice.
   */
  presentSupernovaPicks(prizes: number[]): Promise<{ picks: number[]; gamble: boolean }> {
    return new Promise(resolve => {
      const pos = quantumCubePositions();
      const boxes: QuantumCube[] = pos.map((p, i) => ({
        x: p.x,
        y: p.y,
        prize: prizes[i]!,
        phase: 'idle',
        picked: false,
        dim: false,
        dimT: 0,
        phaseT: 0,
        ringT: 0,
        seed: Math.random(),
        appearDelay: 0.3 + i * 0.06,
        shown: 0,
        tickAcc: 0,
      }));
      this.supernova = { boxes, zoom: 0, fieldT: 0, prizes, picks: [], resolve, done: false };
      this.state = 'supernova';
      const intro = async (): Promise<void> => {
        // cross into the other universe: adaptive music starts instantly
        audio.supernovaMusicStart();
        if (!this.reducedMotion && !this.skipFlag && !this.dead) {
          // cinematic beat: tension riser, then detonation
          audio.tensionRiser(750);
          await this.wait(700);
        }
        this.flash = 1;
        this.addShake(10, 700);
        audio.supernova();
        this.cb.winBanner(2, this.S.supernova, '', '');
        if (!this.reducedMotion) {
          // zoom punch with overshoot, then settle
          await this.tween(520, k => {
            if (this.supernova) this.supernova.zoom = k * 1.1;
          }, easeOutCubic);
          await this.tween(220, k => {
            if (this.supernova) this.supernova.zoom = 1.1 - k * 0.1;
          }, easeOutCubic);
        } else if (this.supernova) {
          this.supernova.zoom = 1;
        }
        this.cb.picksStatus(this.S.pickStars);
      };
      void intro();
    });
  }

  /**
   * Demo shortcut: jump straight into the supernova cinematic (?bonus=supernova).
   * No spin, no bet deducted — pure showcase of the bonus round.
   */
  async demoSupernova(): Promise<void> {
    // wait for the host handshake to settle (demo fallback ~1500ms) before
    // forcing the idle-only bonus path
    for (let i = 0; i < 20 && this.state !== 'idle'; i++) await this.wait(500);
    if (this.state !== 'idle') return;
    this.state = 'busy';
    this.skipFlag = false;
    this.cb.setBusy(true, this.S.forging);
    this.cb.clearBanner();
    const bet = this.bet;
    const prizes = shufflePrizes(this.rng, this.artifacts);
    const res = await this.presentSupernovaPicks(prizes);
    const pickSumX = res.picks.reduce((s, i) => s + prizes[i]!, 0);
    this.balance += pickSumX * bet;
    this.cb.setBalance(this.balanceText());
    this.cb.winBanner(2, this.S.supernova, `×${fmtX(pickSumX)}`, '');
    await this.wait(1800);
    this.cb.clearBanner();
    this.cb.pushHistory({ bet, winX: pickSumX, win: pickSumX * bet, supernova: true });
    this.state = 'idle';
    this.cb.setBusy(false);
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

    let picks: number[] = [];
    let gambleChoice = false;
    let gambleWon: boolean | null = null;
    let pickSumX = 0;
    if (spin.supernova) {
      const res = await this.presentSupernovaPicks(spin.supernova.prizes);
      picks = res.picks;
      gambleChoice = res.gamble;
      pickSumX = picks.reduce((s, i) => s + spin.supernova!.prizes[i]!, 0);
      if (gambleChoice) {
        gambleWon = gambleFlip(this.rng);
        if (gambleWon) {
          audio.gambleWin();
          this.cb.winBanner(1, this.S.gambleWon, `×${fmtX(pickSumX * 2)}`, '');
        } else {
          audio.gambleLose();
          this.cb.winBanner(0, this.S.gambleLost, '×0', '');
        }
        await this.wait(1400);
        this.cb.clearBanner();
      }
    }

    const fin: FinalizedSpin = finalizeSpin(spin, picks, gambleChoice, gambleWon);
    await this.presentWin(fin, bet);

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
    this.cb.pushHistory({ bet, winX: fin.totalWinX, win: fin.totalWinX * bet, supernova: !!spin.supernova });
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

    if (countStars(g0) >= 4) {
      // supernova will trigger after cascade evaluation; brief beat
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
