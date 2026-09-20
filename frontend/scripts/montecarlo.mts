/**
 * Monte Carlo validation of the STARFORGE engine against math-spec RTP targets:
 *   fresh (no artifacts)  in [93.94%, 97.59%]
 *   steady (all artifacts) in [93.94%, 97.59%] (declared max 97.59%)
 * Uses the REAL src/engine.ts + src/nova.ts via Node type-stripping.
 * Usage: node scripts/montecarlo.mts [spins]
 */
import { ART, MAX_PAYOUT_X, cryptoRng, finalizeSpin, runSpin } from '../src/engine.ts';
import { playNova } from '../src/nova.ts';

const spins = Number(process.argv[2] ?? 2_000_000);

function simulate(artifacts: number, label: string): void {
  const rng = cryptoRng();
  const temple = (artifacts & ART.TEMPLE) !== 0;
  let totalX = 0;
  let totalX2 = 0;
  let maxX = 0;
  let novaHits = 0;
  let novaPaid = 0;
  let clampHits = 0;
  for (let i = 0; i < spins; i++) {
    const spin = runSpin(rng, artifacts);
    let novaWinX = 0;
    if (spin.nova) {
      novaHits++;
      const res = playNova(rng, temple);
      novaWinX = res.totalX;
      novaPaid += novaWinX;
    }
    const fin = finalizeSpin(spin, novaWinX);
    const x = fin.totalWinX;
    totalX += x;
    totalX2 += x * x;
    if (x > maxX) maxX = x;
    if (x >= MAX_PAYOUT_X) clampHits++;
  }
  const rtp = totalX / spins;
  const variance = totalX2 / spins - rtp * rtp;
  const se = Math.sqrt(variance / spins);
  console.log(`--- ${label} (${spins.toLocaleString()} spins) ---`);
  console.log(`RTP        : ${(rtp * 100).toFixed(3)}%  (SE ±${(se * 100).toFixed(3)}%)`);
  console.log(`max win    : ${maxX.toFixed(2)}x   clamp hits: ${clampHits}`);
  console.log(
    `nova       : ${novaHits} (${((100 * novaHits) / spins).toFixed(3)}%)  avg ${(novaPaid / Math.max(1, novaHits)).toFixed(2)}x  contrib ${((novaPaid / spins) * 100).toFixed(2)}%`,
  );
  console.log('');
}

simulate(0, 'FRESH (no artifacts)');
simulate(ART.BRASA | ART.YUNQUE | ART.TEMPLE, 'STEADY (all artifacts)');
