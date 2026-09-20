/**
 * NOVA FURNACE — Money-Train-style respin bonus with a star-forge skin.
 * Pure game math, no DOM, no side effects. Erasable TypeScript so the same
 * file runs in Node for RTP validation.
 *
 * Rules:
 *  - 5x4 forge grid (20 cells). Trigger: 4+ stars on the initial base drop.
 *  - Start with 3 respins. Every respin, each empty cell independently
 *    receives a core with probability LAND_P. Any new core resets respins
 *    to 3; a blank respin decrements. Bonus ends at 0 respins or full grid.
 *  - Core kinds (all specials are ONE-SHOT on landing, then remain as values):
 *      value     — energy core worth its xbet value at the end.
 *      collector — IMÁN: absorbs the sum of all other visible cores into
 *                  its own value the moment it lands.
 *      payer     — AMPLIFICADOR: on landing, pays its value x3 to each of
 *                  3-5 random other cores.
 *      sniper    — FRANCOTIRADOR: on landing, doubles up to 3 random
 *                  value cores.
 *  - Temple artifact: all drawn values x1.10.
 *  - Total = sum of all core values. The spin-level 1000x cap applies at
 *    finalization (engine.ts).
 *
 * The whole bonus is simulated up-front into an event log; the UI replays
 * the log for animation, so math and presentation can never diverge.
 */
import { drawRange, type ByteRng } from './engine.ts';

export const NOVA_COLS = 5;
export const NOVA_ROWS = 4;
export const NOVA_CELLS = 20;
export const NOVA_START_RESPINS = 3;
export const NOVA_TRIGGER_STARS = 3;
/** Temple multiplier on drawn values. */
export const NOVA_TEMPLE_MULT = 1.08;

// ---- tuning knobs (calibrated by Monte Carlo; see docs/RTP_MATH.md) --------
/** Per empty cell, per respin, probability a core lands. */
export const NOVA_LAND_P = 0.05;
/** Kind weights: value, collector, payer, sniper. */
const KIND_W = [96, 1.5, 1.25, 1.25] as const;
/** Value table (xbet) and weights. EV = 0.224 (fractional: 3+ trigger). */
const VALUE_X = [0.15, 0.32, 0.65] as const;
const VALUE_W = [70, 23, 7] as const;

export type NovaKind = 'value' | 'collector' | 'payer' | 'sniper';

export type NovaEvent =
  | { t: 'respin'; n: number; left: number }
  | { t: 'land'; cell: number; kind: NovaKind; value: number }
  | { t: 'payerFire'; cell: number; targets: number[]; add: number }
  | { t: 'sniperFire'; cell: number; targets: number[] }
  | { t: 'collectFire'; cell: number; from: number[]; gained: number; newValue: number }
  | { t: 'end'; totalX: number; full: boolean };

export interface NovaResult {
  events: NovaEvent[];
  totalX: number;
  respins: number;
  symbols: number;
  specials: number;
}

interface Core {
  cell: number;
  kind: NovaKind;
  value: number;
}

function drawKind(rng: ByteRng): NovaKind {
  const total = KIND_W[0]! + KIND_W[1]! + KIND_W[2]! + KIND_W[3]!;
  let r = (rng.nextByte() / 256) * total;
  // byte-granularity draw is fine for kind selection (not a pay draw)
  if ((r -= KIND_W[0]!) < 0) return 'value';
  if ((r -= KIND_W[1]!) < 0) return 'collector';
  if ((r -= KIND_W[2]!) < 0) return 'payer';
  return 'sniper';
}

function drawValue(rng: ByteRng, temple: boolean): number {
  const total = VALUE_W.reduce((s, w) => s + w, 0);
  let r = (rng.nextByte() / 256) * total;
  for (let i = 0; i < VALUE_X.length; i++) {
    r -= VALUE_W[i]!;
    if (r < 0) return VALUE_X[i]! * (temple ? NOVA_TEMPLE_MULT : 1);
  }
  return VALUE_X[0]! * (temple ? NOVA_TEMPLE_MULT : 1);
}

/** Uniform int in [0, n) via rejection sampling (matches engine.drawRange). */
const rint = (rng: ByteRng, n: number): number => drawRange(rng, n);

/** Pick k distinct random elements from arr (k <= arr.length). */
function pickN<T>(rng: ByteRng, arr: T[], k: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  const n = Math.min(k, pool.length);
  for (let i = 0; i < n; i++) {
    const j = rint(rng, pool.length);
    out.push(pool.splice(j, 1)[0]!);
  }
  return out;
}

/** Uniform double in [0,1). */
const coin = (rng: ByteRng): number => rng.nextByte() / 256;

export function playNova(rng: ByteRng, temple: boolean): NovaResult {
  const events: NovaEvent[] = [];
  const cores: Core[] = [];
  const occupied = new Array<boolean>(NOVA_CELLS).fill(false);
  let respins = NOVA_START_RESPINS;
  let n = 0;
  let specials = 0;

  const emptyCells = (): number[] => {
    const out: number[] = [];
    for (let c = 0; c < NOVA_CELLS; c++) if (!occupied[c]) out.push(c);
    return out;
  };

  while (respins > 0) {
    const empty = emptyCells();
    if (empty.length === 0) break;
    n++;
    respins--;
    events.push({ t: 'respin', n, left: respins });

    // landings
    const landed: Core[] = [];
    for (const cell of empty) {
      if (coin(rng) < NOVA_LAND_P) {
        const kind = drawKind(rng);
        const value = drawValue(rng, temple);
        const core: Core = { cell, kind, value };
        cores.push(core);
        occupied[cell] = true;
        landed.push(core);
        events.push({ t: 'land', cell, kind, value });
        if (kind !== 'value') specials++;
      }
    }
    if (landed.length > 0) respins = NOVA_START_RESPINS;

    // one-shot specials resolve in landing order
    for (const core of landed) {
      if (core.kind === 'collector') {
        const others = cores.filter(c => c !== core);
        const gained = others.reduce((s, c) => s + c.value, 0);
        core.value += gained;
        events.push({
          t: 'collectFire',
          cell: core.cell,
          from: others.map(c => c.cell),
          gained,
          newValue: core.value,
        });
      } else if (core.kind === 'payer') {
        const others = cores.filter(c => c !== core);
        const k = 3 + rint(rng, 3); // 3..5
        const targets = pickN(rng, others, k);
        const add = core.value * 3;
        for (const t of targets) t.value += add;
        events.push({ t: 'payerFire', cell: core.cell, targets: targets.map(t => t.cell), add });
      } else if (core.kind === 'sniper') {
        const values = cores.filter(c => c !== core && c.kind === 'value');
        const targets = pickN(rng, values, 3);
        for (const t of targets) t.value *= 2;
        events.push({ t: 'sniperFire', cell: core.cell, targets: targets.map(t => t.cell) });
      }
    }
  }

  const totalX = cores.reduce((s, c) => s + c.value, 0);
  events.push({ t: 'end', totalX, full: cores.length === NOVA_CELLS });
  return { events, totalX, respins: n, symbols: cores.length, specials };
}
