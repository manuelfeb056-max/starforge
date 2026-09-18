/**
 * Headless smoke test: stubs browser globals, then verifies
 *  1. connectWithTimeout() resolves null after ~1500ms with no host (demo fallback)
 *  2. ABI gameState decode/encode round-trips
 * Run: node scripts/smoke-host.mts
 */

// ---- minimal browser stubs (must precede imports) ----
const win: Record<string, unknown> = {
  origin: 'http://localhost:4173',
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  postMessage: () => undefined,
};
win.parent = win;
(globalThis as Record<string, unknown>).window = win;
(globalThis as Record<string, unknown>).document = { referrer: '' };
try {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true });
} catch {
  /* node already provides one */
}
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { connectWithTimeout } = await import('../src/host.ts');
const { decodeGameState, encodeActionData, encodeGameData, encodeWager } = await import('../src/abi.ts');

const t0 = Date.now();
const link = await connectWithTimeout(() => undefined);
const dt = Date.now() - t0;
console.log(`connectWithTimeout -> ${link === null ? 'null (demo)' : 'HOST'} in ${dt}ms`);
if (link !== null) throw new Error('expected null without a host');
if (dt < 1400 || dt > 2500) throw new Error(`timeout out of range: ${dt}ms`);

// ---- ABI round-trip: abi.encode(uint8, uint256, uint16[12], uint256, uint8)
const word = (v: bigint): string => v.toString(16).padStart(64, '0');
const prizes = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6, 6];
const hex =
  '0x' +
  word(1n) + // stage
  word(2500000000000000000n) + // gridWinWad = 2.5
  prizes.map(p => word(BigInt(p))).join('') +
  word(15000000000000000000n) + // picksSumWad = 15
  word(7n); // artifacts
const dec = decodeGameState(hex);
console.log('decoded:', JSON.stringify({ stage: dec.stage, prizes: dec.prizes, artifacts: dec.artifacts }));
if (dec.stage !== 1) throw new Error('stage');
if (dec.prizes.join(',') !== prizes.join(',')) throw new Error('prizes');
if (dec.artifacts !== 7) throw new Error('artifacts');
if (dec.gridWinWad !== 2500000000000000000n) throw new Error('gridWinWad');
if (dec.picksSumWad !== 15000000000000000000n) throw new Error('picksSumWad');

let threw = false;
try {
  decodeGameState('0x1234');
} catch {
  threw = true;
}
if (!threw) throw new Error('short gameState should throw');

console.log('encodeGameData(5) =', encodeGameData(5));
console.log('encodeActionData([0,3,5,7,11],1) =', encodeActionData([0, 3, 5, 7, 11], 1));
console.log('encodeWager(25, 6) =', encodeWager(25, 6));
if (encodeGameData(5) !== '0x05') throw new Error('gameData');
if (encodeActionData([0, 3, 5, 7, 11], 1) !== '0x000305070b01') throw new Error('actionData');
if (encodeWager(25, 6) !== '25000000') throw new Error('wager');

console.log('SMOKE OK');
