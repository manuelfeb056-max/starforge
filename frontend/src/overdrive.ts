/**
 * FURNACE OVERDRIVE — the "rescue in uncertain times" bonus.
 * Pure game math, no DOM, no side effects. Erasable TypeScript so the same
 * file runs in Node for RTP validation.
 *
 * CHARGE BAR: every paid base spin feeds the forge. Losing spins feed it
 * fastest (the rescue fantasy), wins feed it slowly, scatter (nova) spins
 * add a surge, huge wins barely move it.
 *   loss (winX <= 0)  -> +U[1.6, 2.4]
 *   win               -> +U[0.4, 0.8]
 *   nova trigger      -> +3.0 (on top of the win fill)
 *   win >= 10x        -> +0.15 (flat, replaces the win fill)
 *   win >= 25x        -> +0.05 (flat)
 * Expected fill ~1.01/spin => a full bar every ~99 spins (measured).
 * Free spins (rescue/reheat) never charge the bar.
 *
 * When the bar hits 100 it fires automatically: a forge wheel with 6
 * segments. Segment weights adapt to the player's recent temperature:
 *   cold (net < 0 over last 20 paid spins)  -> rescue + instant favored
 *   hot  (net >= 0)                         -> win-mult + hell favored
 *
 * Segments:
 *   rescue  — 2-3 free spins, every win x2-x3 (the comeback)
 *   winmult — x2-x3 on the sum of the last 2 paid spins' wins
 *   second  — a boosted NOVA FURNACE (+2 respins, high-tilted value pool)
 *   instant — flat x2-x12 prize
 *   hell    — inner wheel: x8-x120 (rare, the dream)
 *   reheat  — bar back to 50% + 1 free spin (the "weak" segment that keeps
 *             the tension alive)
 */
import { ART, finalizeSpin, runSpin, type ByteRng } from './engine.ts';
import { playNova } from './nova.ts';

export const OD_CHARGE_MAX = 100;
/** Uniform fill ranges (percentage points of the bar). */
export const OD_FILL_LOSS: [number, number] = [1.6, 2.4];
export const OD_FILL_WIN: [number, number] = [0.4, 0.8];
export const OD_FILL_NOVA = 3.0;
export const OD_FILL_BIG10 = 0.15;
export const OD_FILL_BIG25 = 0.05;
/** Recent-history window for adaptive weighting (paid spins). */
export const OD_HEAT_WINDOW = 20;
/** Paid-spin win window feeding the win-mult segment. */
export const OD_WINMULT_WINDOW = 2;

export type OdHeat = 'cold' | 'hot';
export type OdSegment = 'rescue' | 'winmult' | 'second' | 'instant' | 'hell' | 'reheat';

export const OD_SEGMENTS: OdSegment[] = ['rescue', 'winmult', 'second', 'instant', 'hell', 'reheat'];

/** Cold: losing streak -> rescue + instant + reheat favored. */
const SEG_W_COLD: Record<OdSegment, number> = {
  rescue: 28, winmult: 12, second: 10, instant: 24, hell: 2, reheat: 24,
};
/** Hot: winning streak -> win-mult + hell favored. */
const SEG_W_HOT: Record<OdSegment, number> = {
  rescue: 12, winmult: 28, second: 20, instant: 14, hell: 8, reheat: 18,
};

export function odWeights(heat: OdHeat): Record<OdSegment, number> {
  return heat === 'cold' ? { ...SEG_W_COLD } : { ...SEG_W_HOT };
}

/** Instant-prize pool (xbet) and weights. EV = 4.0. */
const INSTANT_X = [2, 3, 5, 8, 12] as const;
const INSTANT_W = [35, 30, 20, 10, 5] as const;
/** Hell-mode inner wheel (xbet) and weights. EV = 13.9. */
export const HELL_X = [6, 10, 20, 40, 80] as const;
const HELL_W = [45, 30, 15, 7, 3] as const;

/** Weighted pick from parallel arrays via byte draw (fine granularity). */
function wpick<T>(rng: ByteRng, xs: readonly T[], ws: readonly number[]): T {
  const total = ws.reduce((s, w) => s + w, 0);
  const r = (rng.nextUint16() / 65536) * total;
  let acc = 0;
  for (let i = 0; i < xs.length; i++) {
    acc += ws[i]!;
    if (r < acc) return xs[i]!;
  }
  return xs[0]!;
}

function wrange(rng: ByteRng, lo: number, hi: number): number {
  return lo + (rng.nextUint16() / 65536) * (hi - lo);
}

/** Spin the wheel: returns the landed segment (heat-adaptive weights). */
export function spinWheel(rng: ByteRng, heat: OdHeat): OdSegment {
  const w = odWeights(heat);
  const total = OD_SEGMENTS.reduce((s, k) => s + w[k], 0);
  const r = (rng.nextUint16() / 65536) * total;
  let acc = 0;
  for (const k of OD_SEGMENTS) {
    acc += w[k];
    if (r < acc) return k;
  }
  return 'rescue';
}

/** The resolved overdrive award. The UI replays/executes it; the MC prices it. */
export interface OdPlan {
  segment: OdSegment;
  heat: OdHeat;
  /** rescue: free-spin count and win multiplier. */
  rescueN: number;
  rescueMult: number;
  /** winmult: multiplier and the base (sum of last paid-spin wins). */
  winMult: number;
  winBase: number;
  /** second: boosted furnace flag (always true; kept for clarity). */
  secondBoost: boolean;
  /** instant: flat xbet prize. */
  instantX: number;
  /** hell: inner-wheel xbet prize. */
  hellPrizeX: number;
}

/**
 * Build the overdrive award plan. `lastWins` = recent paid spins' totalWinX
 * (most recent LAST); only the newest OD_WINMULT_WINDOW entries are used.
 */
export function planOverdrive(rng: ByteRng, heat: OdHeat, lastWins: number[]): OdPlan {
  const segment = spinWheel(rng, heat);
  const winBase = lastWins.slice(-OD_WINMULT_WINDOW).reduce((s, x) => s + x, 0);
  return {
    segment,
    heat,
    rescueN: 2, // fixed: the comeback is sharp but short
    rescueMult: 2 + Math.floor((rng.nextUint16() / 65536) * 2), // 2..3
    winMult: 2 + Math.floor((rng.nextUint16() / 65536) * 2), // 2..3
    winBase,
    secondBoost: true,
    instantX: wpick(rng, INSTANT_X, INSTANT_W),
    hellPrizeX: wpick(rng, HELL_X, HELL_W),
  };
}

/**
 * Price an overdrive plan in xbet (for Monte Carlo). Rescue free spins and
 * the second-chance furnace are simulated for real; artifacts apply to
 * rescue spins (they are base spins) but not to flat awards.
 */
export function priceOverdrive(rng: ByteRng, plan: OdPlan, artifacts: number): number {
  switch (plan.segment) {
    case 'rescue': {
      let total = 0;
      for (let i = 0; i < plan.rescueN; i++) {
        const spin = runSpin(rng, artifacts);
        let novaWinX = 0;
        if (spin.nova) {
          const temple = (artifacts & ART.TEMPLE) !== 0;
          novaWinX = playNova(rng, temple).totalX;
        }
        total += finalizeSpin(spin, novaWinX).totalWinX * plan.rescueMult;
      }
      return total;
    }
    case 'winmult':
      return plan.winMult * plan.winBase;
    case 'second': {
      const temple = (artifacts & ART.TEMPLE) !== 0;
      return playNova(rng, temple, true).totalX;
    }
    case 'instant':
      return plan.instantX;
    case 'hell':
      return plan.hellPrizeX;
    case 'reheat': {
      // 1 free spin at face value + the 50% recharge is equity, not cash:
      // the MC recharges the tracker to 50 after pricing.
      const spin = runSpin(rng, artifacts);
      let novaWinX = 0;
      if (spin.nova) {
        const temple = (artifacts & ART.TEMPLE) !== 0;
        novaWinX = playNova(rng, temple).totalX;
      }
      return finalizeSpin(spin, novaWinX).totalWinX;
    }
  }
}

// ---------------------------------------------------------------------------
// Charge tracker — shared by the game UI and the Monte Carlo simulator.
// ---------------------------------------------------------------------------

export interface OdState {
  charge: number;
  /** Net (winX - 1) of the last OD_HEAT_WINDOW paid spins, oldest first. */
  recent: number[];
  /** totalWinX of recent paid spins, oldest first (for win-mult). */
  lastWins: number[];
}

const freshOd = (): OdState => ({ charge: 0, recent: [], lastWins: [] });

export class OdTracker {
  state: OdState = freshOd();

  get charge(): number {
    return this.state.charge;
  }

  heat(): OdHeat {
    const net = this.state.recent.reduce((s, x) => s + x, 0);
    return net < 0 ? 'cold' : 'hot';
  }

  /**
   * Feed one paid spin. Returns true when the bar just filled (the caller
   * fires the overdrive, then calls `discharge()`).
   */
  addSpin(rng: ByteRng, winX: number, nova: boolean): boolean {
    let fill: number;
    if (winX >= 25) fill = OD_FILL_BIG25;
    else if (winX >= 10) fill = OD_FILL_BIG10;
    else if (winX <= 0) fill = wrange(rng, OD_FILL_LOSS[0], OD_FILL_LOSS[1]);
    else fill = wrange(rng, OD_FILL_WIN[0], OD_FILL_WIN[1]);
    if (nova) fill += OD_FILL_NOVA;
    this.state.charge = Math.min(OD_CHARGE_MAX, this.state.charge + fill);

    this.state.recent.push(winX - 1);
    if (this.state.recent.length > OD_HEAT_WINDOW) this.state.recent.shift();
    this.state.lastWins.push(winX);
    if (this.state.lastWins.length > OD_WINMULT_WINDOW) this.state.lastWins.shift();

    return this.state.charge >= OD_CHARGE_MAX;
  }

  /** After the overdrive resolves: empty the bar, or 50% on reheat. */
  discharge(reheat: boolean): void {
    this.state.charge = reheat ? OD_CHARGE_MAX / 2 : 0;
  }

  reset(): void {
    this.state = freshOd();
  }

  serialize(): string {
    return JSON.stringify(this.state);
  }

  load(raw: string | null): void {
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as Partial<OdState>;
      if (typeof p.charge === 'number') this.state.charge = Math.min(OD_CHARGE_MAX, Math.max(0, p.charge));
      if (Array.isArray(p.recent)) this.state.recent = p.recent.filter(x => typeof x === 'number').slice(-OD_HEAT_WINDOW);
      if (Array.isArray(p.lastWins)) this.state.lastWins = p.lastWins.filter(x => typeof x === 'number').slice(-OD_WINMULT_WINDOW);
    } catch {
      this.state = freshOd();
    }
  }
}
