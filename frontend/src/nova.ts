/**
 * NOVA FURNACE — Money-Train-style respin bonus with a star-forge skin.
 * Pure game math, no DOM, no side effects. Erasable TypeScript so the same
 * file runs in Node for RTP validation.
 *
 * Rules (v3 — high-ceiling edition):
 *  - 5x4 forge grid (20 cells). Trigger: 3+ stars on the initial base drop.
 *  - Start with 3 respins. Every respin, each empty cell independently
 *    receives a core with probability LAND_P. Any new core resets respins
 *    to 3; a blank respin decrements. Bonus ends at 0 respins or full grid.
 *  - Core kinds (all specials are ONE-SHOT on landing, then remain as values):
 *      value     — energy core worth its xbet value at the end.
 *      collector — IMÁN: absorbs the sum of ALL other visible cores'
 *                  CURRENT values (value cores AND specials) the moment it
 *                  lands. Copies, does not drain.
 *      payer     — AMPLIFICADOR: on landing, pays its value x3 to each of
 *                  3-5 random other cores, INCLUDING specials. A pumped
 *                  collector is worth double trouble.
 *      sniper    — FRANCOTIRADOR: on landing, doubles up to 3 random other
 *                  cores, INCLUDING specials. Doubling an already-loaded
 *                  collector is the jackpot moment.
 *  - Rare core tiers (x25 / x50 / x100) sit at the top of the value pool at
 *    very low weight: the x100 dream is real but rare.
 *  - Specials resolve in landing order, so chains explode: payer pumps a
 *    collector, then a sniper doubles it, then another collector absorbs the
 *    doubled collector... The spin-level 1000x cap applies at finalization
 *    (engine.ts).
 *  - Temple artifact: all drawn values x1.08.
 *  - Second-chance (Overdrive) boost: +2 start respins and a value pool
 *    tilted toward the high tiers.
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
export const NOVA_TEMPLE_MULT = 1.04;
/** Value cores at or above this are styled as RARE in the UI. */
export const NOVA_RARE_VALUE = 25;

// ---- tuning knobs (calibrated by Monte Carlo; see docs/RTP_MATH.md) --------
/** Per empty cell, per respin, probability a core lands. */
export const NOVA_LAND_P = 0.026;
/** Kind weights: value, collector, payer, sniper. */
const KIND_W = [97.2, 0.93, 0.93, 0.94] as const;
/**
 * Value table (xbet) and weights. EV = 0.962 per drawn value core; fewer
 * small hits than v2 (land chance and small-tier weights both reduced) while
 * the rare x25/x50/x100 tiers open a real 500x+ ceiling.
 */
const VALUE_X = [0.08, 0.2, 0.5, 1.2, 3.0, 8.0, 25, 50, 100] as const;
const VALUE_W = [52, 25, 13, 6, 2.6, 1.1, 0.22, 0.06, 0.02] as const;
/** Second-chance boost tilts the value pool toward high tiers. */
const VALUE_W_BOOST = [46, 24, 15, 8, 4, 2, 0.7, 0.2, 0.1] as const;
/** Extra start respins on a second-chance (Overdrive) furnace. */
export const NOVA_BOOST_RESPINS = 1;

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
  /** Start respins (3, or 5 on a boosted second-chance furnace). */
  startRespins: number;
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

function drawValue(rng: ByteRng, temple: boolean, boost: boolean): number {
  const W = boost ? VALUE_W_BOOST : VALUE_W;
  const total = W.reduce((s, w) => s + w, 0);
  // 16-bit granularity so the rare x50/x100 tiers are actually reachable
  const r = (rng.nextUint16() / 65536) * total;
  let acc = 0;
  for (let i = 0; i < VALUE_X.length; i++) {
    acc += W[i]!;
    if (r < acc) return VALUE_X[i]! * (temple ? NOVA_TEMPLE_MULT : 1);
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

/**
 * @param boost second-chance mode (Overdrive): +2 start respins and a
 *        high-tilted value pool.
 */
export function playNova(rng: ByteRng, temple: boolean, boost = false): NovaResult {
  const events: NovaEvent[] = [];
  const cores: Core[] = [];
  const occupied = new Array<boolean>(NOVA_CELLS).fill(false);
  let respins = NOVA_START_RESPINS + (boost ? NOVA_BOOST_RESPINS : 0);
  const startRespins = respins;
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
        const value = drawValue(rng, temple, boost);
        const core: Core = { cell, kind, value };
        cores.push(core);
        occupied[cell] = true;
        landed.push(core);
        events.push({ t: 'land', cell, kind, value });
        if (kind !== 'value') specials++;
      }
    }
    if (landed.length > 0) respins = startRespins;

    // one-shot specials resolve in landing order — chains explode here
    for (const core of landed) {
      if (core.kind === 'collector') {
        // absorbs the CURRENT value of every other core, specials included
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
        // pays its value x3 to 3-5 random other cores, specials included
        const others = cores.filter(c => c !== core);
        const k = 3 + rint(rng, 3); // 3..5
        const targets = pickN(rng, others, k);
        const add = core.value * 2;
        for (const t of targets) t.value += add;
        events.push({ t: 'payerFire', cell: core.cell, targets: targets.map(t => t.cell), add });
      } else if (core.kind === 'sniper') {
        // doubles up to 3 random other cores, specials included
        const others = cores.filter(c => c !== core);
        const targets = pickN(rng, others, 2);
        for (const t of targets) t.value *= 2;
        events.push({ t: 'sniperFire', cell: core.cell, targets: targets.map(t => t.cell) });
      }
    }
  }

  const totalX = cores.reduce((s, c) => s + c.value, 0);
  events.push({ t: 'end', totalX, full: cores.length === NOVA_CELLS });
  return { events, totalX, respins: n, symbols: cores.length, specials, startRespins };
}
