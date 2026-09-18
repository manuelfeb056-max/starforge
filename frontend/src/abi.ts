/**
 * Minimal ABI decoder for the STARFORGE gameState:
 *   abi.encode(uint8 stage, uint256 gridWinWad, uint16[12] prizes,
 *              uint256 picksSumWad, uint8 artifacts)
 * Layout: 16 words x 32 bytes = 512 bytes. Static types only, no offsets.
 */

export interface DecodedGameState {
  stage: number;
  gridWinWad: bigint;
  prizes: number[]; // 12 x uint16
  picksSumWad: bigint;
  artifacts: number;
}

const WORD = 64; // hex chars per 32-byte word

function wordAt(hex: string, i: number): bigint {
  return BigInt('0x' + hex.slice(i * WORD, (i + 1) * WORD));
}

/** Decode a 0x-prefixed gameState hex string. Throws on malformed input. */
export function decodeGameState(raw: string): DecodedGameState {
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length < WORD * 16) {
    throw new Error(`gameState: expected >=512 bytes, got ${hex.length / 2}`);
  }
  const stage = Number(wordAt(hex, 0));
  const gridWinWad = wordAt(hex, 1);
  const prizes: number[] = [];
  for (let i = 0; i < 12; i++) {
    const v = wordAt(hex, 2 + i);
    if (v > 0xffffn) throw new Error(`gameState: prize[${i}] exceeds uint16`);
    prizes.push(Number(v));
  }
  const picksSumWad = wordAt(hex, 14);
  const artifacts = Number(wordAt(hex, 15));
  if (artifacts > 0x07) throw new Error(`gameState: artifacts bitmask > 0x07 (${artifacts})`);
  return { stage, gridWinWad, prizes, picksSumWad, artifacts };
}

/** 1 raw byte -> HexString gameData. */
export function encodeGameData(artifactsBitmask: number): `0x${string}` {
  const b = artifactsBitmask & 0xff;
  return `0x${b.toString(16).padStart(2, '0')}` as `0x${string}`;
}

/** 6 raw bytes [pick0..pick4, gambleFlag] -> HexString actionData. */
export function encodeActionData(picks: number[], gambleFlag: 0 | 1): `0x${string}` {
  if (picks.length !== 5 || new Set(picks).size !== 5 || picks.some(p => p < 0 || p > 11)) {
    throw new Error('actionData: need 5 distinct picks in [0,11]');
  }
  const bytes = [...picks, gambleFlag];
  return `0x${bytes.map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
}

/** Bet amount (token units, integer) -> base-unit string via decimals. */
export function encodeWager(amountUnits: number, decimals: number): string {
  if (!Number.isInteger(amountUnits) || amountUnits <= 0) throw new Error('wager must be a positive integer');
  return (BigInt(amountUnits) * 10n ** BigInt(decimals)).toString();
}

/** Base-unit string -> human token units. */
export function formatWad(wad: string | bigint | undefined, decimals: number | undefined, symbol?: string): string {
  if (wad === undefined) return '—';
  const dec = decimals ?? 18;
  const v = typeof wad === 'bigint' ? wad : BigInt(wad);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(dec);
  const int = abs / base;
  const frac = (abs % base).toString().padStart(dec, '0').slice(0, 4).replace(/0+$/, '');
  const num = `${neg ? '-' : ''}${int.toString()}${frac ? '.' + frac : ''}`;
  return symbol ? `${num} ${symbol}` : num;
}
