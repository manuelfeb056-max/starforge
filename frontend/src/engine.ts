/**
 * STARFORGE engine — pure game math, no DOM, no side effects.
 *
 * Implements `math-spec.json` (v1.0.0-mathspec) EXACTLY. This file is the
 * single source of truth for the demo; the on-chain contract and the Python
 * Monte Carlo simulator must match it. Kept in erasable TypeScript so the
 * same file can be executed by Node for RTP validation.
 *
 * Grid layout: 6 cols x 5 rows, row-major index = row*COLS + col.
 * Symbol ids: 0 copper, 1 iron, 2 nickel, 3 silver, 4 gold, 5 platinum,
 *             6 neutronium, 7 star (scatter). There is NO wild symbol.
 */

export const COLS = 6;
export const ROWS = 5;
export const CELLS = 30;

export const SYM = {
  COPPER: 0,
  IRON: 1,
  NICKEL: 2,
  SILVER: 3,
  GOLD: 4,
  PLATINUM: 5,
  NEUTRONIUM: 6,
  STAR: 7,
} as const;

export const MINERALS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Mineral = (typeof MINERALS)[number];

/** Artifact bitmask bits (matches gameData bitmask + contract). */
export const ART = { BRASA: 1, YUNQUE: 2, TEMPLE: 4 } as const;

export const MAX_PAYOUT_X = 1000;
/** Cascade cap is ALWAYS 2 (Temple no longer raises it). */
export const CASCADE_CAP = 2;

/** Base symbol weights. Order: Cu,Fe,Ni,Ag,Au,Pt,Nt,Star. */
const WEIGHTS = [30, 26, 22, 16, 12, 8, 5, 3] as const;
const TOTAL_WEIGHT = 122;
/** uint16 rejection limit: floor(65536/122)*122 = 65514 (per math-spec). */
const SYMBOL_LIMIT = 65514;

/** Paytable in xbet, tiers [8-9, 10-11, 12+], indexed by mineral id.
 *  FINAL tuned values (2026-09-18): verified fresh 93.94% / steady ~97.4% by 10M Monte Carlo.
 *  Must match StarforgeGame.sol PAY_* constants and math-spec.json. */
const PAYTABLE: number[][] = [
  [0.165, 0.4125, 1.65], // copper
  [0.2475, 0.66, 2.475], // iron
  [0.4125, 0.825, 3.3], // nickel
  [0.66, 1.2375, 4.95], // silver
  [0.825, 2.0625, 8.25], // gold
  [1.65, 4.125, 16.5], // platinum
  [4.125, 9.9, 41.25], // neutronium
];

/** Constellation patterns as (col,row) cells, checked highest-pay first. */
export type PatternDef = { name: string; payX: number; cells: number[] };
const idx = (col: number, row: number): number => row * COLS + col;
export const PATTERNS: PatternDef[] = [
  { name: 'herradura', payX: 15, cells: [idx(1, 1), idx(1, 2), idx(1, 3), idx(2, 3), idx(3, 3)] },
  { name: 'diamante', payX: 8, cells: [idx(2, 0), idx(2, 4), idx(0, 2), idx(4, 2), idx(2, 2)] },
  { name: 'equis', payX: 4, cells: [idx(1, 1), idx(3, 3), idx(2, 2), idx(1, 3), idx(3, 1)] },
  { name: 'cruz', payX: 2, cells: [idx(2, 1), idx(2, 2), idx(2, 3), idx(1, 2), idx(3, 2)] },
];

/** Supernova prize pool (xbet), sum = 36, E[pick sum] = 5*36/12 = 15. */
export const SUPERNOVA_POOL = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6, 6] as const;
export const SUPERNOVA_TRIGGER_STARS = 4;
/** Always 5 picks of 12. Temple boosts every prize x1.10 instead. */
export const SUPERNOVA_PICKS = 5;
export const SUPERNOVA_FIELD = 12;
/** Temple multiplier applied to every supernova prize. */
export const TEMPLE_PRIZE_MULT = 1.1;

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

/** Byte-stream RNG. Implementations: crypto (demo), VRF-derived (contract). */
export interface ByteRng {
  nextByte(): number; // uniform in [0,256)
  nextUint16(): number; // uniform in [0,65536)
}

/** Buffered crypto.getRandomValues stream (works in browser + Node 24). */
export function cryptoRng(): ByteRng {
  let buf = new Uint8Array(0);
  let pos = 0;
  const refill = (): void => {
    buf = new Uint8Array(512);
    globalThis.crypto.getRandomValues(buf);
    pos = 0;
  };
  const nextByte = (): number => {
    if (pos >= buf.length) refill();
    return buf[pos++] as number;
  };
  return {
    nextByte,
    nextUint16: () => (nextByte() << 8) | nextByte(),
  };
}

/** Rejection-sampled uniform int in [0, n). Per-range limit = floor(256/n)*n. */
export function drawRange(rng: ByteRng, n: number): number {
  const limit = Math.floor(256 / n) * n;
  for (;;) {
    const b = rng.nextByte();
    if (b < limit) return b % n;
  }
}

// ---------------------------------------------------------------------------
// Symbol draws
// ---------------------------------------------------------------------------

/**
 * Draw one symbol id via uint16 rejection sampling (limit 65514 = 537*122),
 * then a cumulative-weight lookup over the 8 weighted symbols. Since
 * 65514 is an exact multiple of 122, `v % 122` is exactly uniform.
 */
export function drawSymbol(rng: ByteRng): number {
  let v = rng.nextUint16();
  while (v >= SYMBOL_LIMIT) v = rng.nextUint16();
  let t = v % TOTAL_WEIGHT;
  for (let s = 0; s < WEIGHTS.length; s++) {
    const w = WEIGHTS[s] as number;
    if (t < w) return s;
    t -= w;
  }
  return 0; // unreachable
}

/** Draw the initial 6x5 grid. */
export function drawGrid(rng: ByteRng): number[] {
  const grid: number[] = new Array(CELLS);
  for (let i = 0; i < CELLS; i++) grid[i] = drawSymbol(rng);
  return grid;
}

// ---------------------------------------------------------------------------
// Step evaluation
// ---------------------------------------------------------------------------

export type ScatterWin = {
  mineral: Mineral;
  count: number;
  tier: 0 | 1 | 2;
  payX: number; // includes Yunque +5% when tier === 2
};

export type PatternWin = { name: string; payX: number; cells: number[] };

export type StepResult = {
  wins: ScatterWin[];
  pattern: PatternWin | null;
  /** Cell indices that dissolve (winning minerals only; stars persist). */
  winCells: number[];
  /** Total pay of this step in xbet (scatter + pattern). */
  payX: number;
};

const tierOf = (count: number): 0 | 1 | 2 => (count >= 12 ? 2 : count >= 10 ? 1 : 0);

/**
 * Evaluate one cascade step: scatter pays per mineral (8+ anywhere; the star
 * never pays), then the single highest matching constellation pattern.
 * Yunque: +5% on tier-3 (12+) scatter pays ONLY. Brasa: constellation
 * pattern pays x1.25.
 */
export function evaluateStep(grid: number[], artifacts: number): StepResult {
  const wins: ScatterWin[] = [];
  const winCells: number[] = [];
  const yunque = (artifacts & ART.YUNQUE) !== 0;
  const brasa = (artifacts & ART.BRASA) !== 0;

  const winningMinerals = new Set<number>();

  for (const m of MINERALS) {
    let count = 0;
    for (let i = 0; i < CELLS; i++) if (grid[i] === m) count++;
    if (count >= 8) {
      const tier = tierOf(count);
      const base = (PAYTABLE[m] as number[])[tier] as number;
      const payX = tier === 2 && yunque ? base * 1.05 : base;
      wins.push({ mineral: m, count, tier, payX });
      winningMinerals.add(m);
    }
  }

  for (let i = 0; i < CELLS; i++) {
    if (winningMinerals.has(grid[i] as number)) winCells.push(i);
  }

  // Constellations: highest-pay first, only one pays per step. All 5 cells
  // must hold the SAME mineral; a star (or any different mineral) voids it.
  let pattern: PatternWin | null = null;
  for (const p of PATTERNS) {
    let mineral = -1;
    let ok = true;
    for (const c of p.cells) {
      const s = grid[c] as number;
      if (s === SYM.STAR) {
        ok = false;
        break;
      }
      if (mineral === -1) mineral = s;
      else if (mineral !== s) {
        ok = false;
        break;
      }
    }
    if (ok && mineral !== -1) {
      pattern = { name: p.name, payX: p.payX * (brasa ? 1.25 : 1), cells: [...p.cells] };
      break;
    }
  }

  const payX = wins.reduce((s, w) => s + w.payX, 0) + (pattern ? pattern.payX : 0);
  return { wins, pattern, winCells, payX };
}

// ---------------------------------------------------------------------------
// Cascades
// ---------------------------------------------------------------------------

/** Refill: compact surviving symbols per column, draw new symbols on top. */
function refillGrid(grid: number[], removed: boolean[], rng: ByteRng): number[] {
  const next = new Array<number>(CELLS);
  for (let col = 0; col < COLS; col++) {
    const survivors: number[] = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const i = row * COLS + col;
      if (!removed[i]) survivors.push(grid[i] as number);
    }
    let r = ROWS - 1;
    for (const s of survivors) {
      next[r * COLS + col] = s;
      r--;
    }
    while (r >= 0) {
      next[r * COLS + col] = drawSymbol(rng);
      r--;
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Supernova
// ---------------------------------------------------------------------------

/** Fisher-Yates shuffle of the prize pool with per-range rejection sampling.
 * Temple: every prize x1.10 (picks stay 5 of 12). */
export function shufflePrizes(rng: ByteRng, artifacts = 0): number[] {
  const mult = artifacts & ART.TEMPLE ? TEMPLE_PRIZE_MULT : 1;
  const pool: number[] = [...SUPERNOVA_POOL].map(p => p * mult);
  for (let i = pool.length - 1; i >= 1; i--) {
    const j = drawRange(rng, i + 1);
    const tmp = pool[i] as number;
    pool[i] = pool[j] as number;
    pool[j] = tmp;
  }
  return pool;
}

/** Sum of the 5 picked prizes (indices must be distinct, in [0,12)). */
export function supernovaPicks(prizes: number[], picks: number[]): number {
  return picks.reduce((s, p) => s + (prizes[p] as number), 0);
}

/** Fair double-or-nothing coin flip: first randomness byte % 2 (256 | 2, no rejection). */
export function gamble(rng: ByteRng): boolean {
  return rng.nextByte() % 2 === 1;
}

// ---------------------------------------------------------------------------
// Full spin
// ---------------------------------------------------------------------------

export type SpinResult = {
  /** grids[0] = initial drop; grids[k+1] = grid after step k's cascade refill. */
  grids: number[][];
  steps: StepResult[];
  supernova: { prizes: number[] } | null;
  /** Supernova prize sum BEFORE any gamble (xbet). Set post-picks by the UI. */
  gridWinX: number;
  patternWinX: number;
  totalWinX: number; // grid + patterns + supernova picks, clamped to 1000x
};

export function countStars(grid: number[]): number {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (grid[i] === SYM.STAR) n++;
  return n;
}

/**
 * Run one full spin through the cascade ladder. Supernova prizes are drawn
 * (when triggered) but NOT picked/gambled here — the UI resolves picks and
 * the optional double-or-nothing, then calls finalizeSpin.
 */
export function runSpin(rng: ByteRng, artifacts: number): SpinResult {
  const grid0 = drawGrid(rng);
  const grids: number[][] = [grid0];
  const steps: StepResult[] = [];

  let grid = grid0;
  let gridWinX = 0;
  let patternWinX = 0;
  for (let step = 0; step < CASCADE_CAP; step++) {
    const res = evaluateStep(grid, artifacts);
    steps.push(res);
    gridWinX += res.wins.reduce((s, w) => s + w.payX, 0);
    if (res.pattern) patternWinX += res.pattern.payX;
    if (res.payX <= 0 || res.winCells.length === 0) break;
    const removed = new Array<boolean>(CELLS).fill(false);
    for (const c of res.winCells) removed[c] = true;
    grid = refillGrid(grid, removed, rng);
    grids.push(grid);
  }

  const supernova =
    countStars(grid0) >= SUPERNOVA_TRIGGER_STARS ? { prizes: shufflePrizes(rng, artifacts) } : null;

  return { grids, steps, supernova, gridWinX, patternWinX, totalWinX: gridWinX + patternWinX };
}

export type FinalizedSpin = SpinResult & {
  pickSumX: number;
  gambled: boolean;
  gambleWon: boolean | null;
  supernovaWinX: number; // final supernova contribution (post-gamble)
};

/**
 * Finalize a spin after the player picks 5 supernova prizes (empty picks when
 * no supernova) and optionally gambles. Clamps the total to 1000x.
 */
export function finalizeSpin(
  spin: SpinResult,
  picks: number[],
  gambleChoice: boolean,
  gambleWon: boolean | null,
): FinalizedSpin {
  let pickSumX = 0;
  let supernovaWinX = 0;
  if (spin.supernova) {
    pickSumX = supernovaPicks(spin.supernova.prizes, picks);
    supernovaWinX = gambleChoice ? (gambleWon ? pickSumX * 2 : 0) : pickSumX;
  }
  const totalWinX = Math.min(spin.gridWinX + spin.patternWinX + supernovaWinX, MAX_PAYOUT_X);
  return { ...spin, pickSumX, gambled: gambleChoice, gambleWon, supernovaWinX, totalWinX };
}
