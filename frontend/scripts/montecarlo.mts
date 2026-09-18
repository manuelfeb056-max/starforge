/**
 * Monte Carlo validation of the STARFORGE engine against math-spec RTP targets:
 *   fresh (no artifacts)  >= 0.93
 *   steady (all artifacts) ~= 0.96 declared
 * Uses the REAL src/engine.ts via Node type-stripping.
 * Usage: node scripts/montecarlo.mts [spins]
 */
import { ART, MAX_PAYOUT_X, cryptoRng, finalizeSpin, gamble, runSpin } from '../src/engine.ts';

const spins = Number(process.argv[2] ?? 2_000_000);

function simulate(artifacts: number, label: string): void {
  const rng = cryptoRng();
  const pickIdx = [0, 1, 2, 3, 4]; // always 5 of 12; Temple boosts prizes x1.10
  let totalX = 0;
  let totalX2 = 0;
  let maxX = 0;
  let supernovaHits = 0;
  let gambleWins = 0;
  let gambles = 0;
  let clampHits = 0;
  for (let i = 0; i < spins; i++) {
    const spin = runSpin(rng, artifacts);
    let picks: number[] = [];
    let gambleChoice = false;
    let gambleWon: boolean | null = null;
    if (spin.supernova) {
      supernovaHits++;
      // strategy: pick first 5, gamble when pickSum >= 18 (volatility play; EV-neutral)
      picks = pickIdx;
      const sum = spin.supernova.prizes.slice(0, 5).reduce((s, p) => s + p, 0);
      gambleChoice = sum >= 18;
      if (gambleChoice) {
        gambles++;
        gambleWon = gamble(rng);
        if (gambleWon) gambleWins++;
      }
    }
    const fin = finalizeSpin(spin, picks, gambleChoice, gambleWon);
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
  console.log(`RTP        : ${rtp.toFixed(5)}  (SE ±${se.toFixed(5)})`);
  console.log(`max win    : ${maxX.toFixed(2)}x   clamp hits: ${clampHits}`);
  console.log(
    `supernova  : ${supernovaHits} (${((100 * supernovaHits) / spins).toFixed(2)}%)  gambles: ${gambles} won ${gambleWins}`,
  );
  console.log('');
}

simulate(0, 'FRESH (no artifacts)');
simulate(ART.BRASA | ART.YUNQUE | ART.TEMPLE, 'STEADY (all artifacts)');
