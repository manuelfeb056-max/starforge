/**
 * Full-model Monte Carlo for STARFORGE v3: base game + NOVA FURNACE (v3) +
 * FURNACE OVERDRIVE, with the charge-bar cycle and adaptive wheel weights.
 * Uses the REAL src/*.ts via Node type-stripping.
 * Usage: node scripts/montecarlo.mts [spins]
 */
import { ART, MAX_PAYOUT_X, cryptoRng, finalizeSpin, runSpin } from '../src/engine.ts';
import { playNova } from '../src/nova.ts';
import { OdTracker, planOverdrive, priceOverdrive, type OdSegment } from '../src/overdrive.ts';

const spins = Number(process.argv[2] ?? 3_000_000);

function simulate(artifacts: number, label: string): void {
  const rng = cryptoRng();
  const temple = (artifacts & ART.TEMPLE) !== 0;
  const od = new OdTracker();
  let totalX = 0;
  let totalX2 = 0;
  let maxX = 0;
  let basePaid = 0;
  let novaHits = 0;
  let novaPaid = 0;
  let odHits = 0;
  let odPaid = 0;
  let clampHits = 0;
  let cycleSpins = 0;
  const segHits: Record<OdSegment, number> = { rescue: 0, winmult: 0, second: 0, instant: 0, hell: 0, reheat: 0 };
  const segPaid: Record<OdSegment, number> = { rescue: 0, winmult: 0, second: 0, instant: 0, hell: 0, reheat: 0 };
  const heatCold = { n: 0 };

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
    basePaid += spin.gridWinX + spin.patternWinX;
    totalX += x;
    if (x > maxX) maxX = x;
    if (x >= MAX_PAYOUT_X) clampHits++;

    // overdrive charge (paid spins only)
    cycleSpins++;
    if (od.addSpin(rng, x, spin.nova)) {
      const heat = od.heat();
      if (heat === 'cold') heatCold.n++;
      const plan = planOverdrive(rng, heat, od.state.lastWins);
      const award = priceOverdrive(rng, plan, artifacts);
      odHits++;
      odPaid += award;
      segHits[plan.segment]++;
      segPaid[plan.segment] += award;
      totalX += award;
      totalX2 += 2 * x * award + award * award; // (x+award)^2 - x^2 correction below
      od.discharge(plan.segment === 'reheat');
      cycleSpins = 0;
      if (x + award > maxX) maxX = x + award;
    }
    totalX2 += x * x;
  }
  const rtp = totalX / spins;
  const variance = totalX2 / spins - rtp * rtp;
  const se = Math.sqrt(Math.max(0, variance) / spins);
  console.log(`--- ${label} (${spins.toLocaleString()} spins) ---`);
  console.log(`RTP        : ${(rtp * 100).toFixed(3)}%  (SE ±${(se * 100).toFixed(3)}%)`);
  console.log(`max win    : ${maxX.toFixed(2)}x   clamp hits: ${clampHits}`);
  console.log(
    `base       : contrib ${((basePaid / spins) * 100).toFixed(2)}%`,
  );
  console.log(
    `nova       : ${novaHits} (${((100 * novaHits) / spins).toFixed(3)}%)  avg ${(novaPaid / Math.max(1, novaHits)).toFixed(2)}x  contrib ${((novaPaid / spins) * 100).toFixed(2)}%`,
  );
  console.log(
    `overdrive  : ${odHits} (cycle ~${(spins / Math.max(1, odHits)).toFixed(0)} spins)  avg ${(odPaid / Math.max(1, odHits)).toFixed(2)}x  contrib ${((odPaid / spins) * 100).toFixed(3)}%  cold ${(100 * heatCold.n / Math.max(1, odHits)).toFixed(1)}%`,
  );
  for (const s of Object.keys(segHits) as OdSegment[]) {
    const h = segHits[s];
    console.log(
      `  ${s.padEnd(8)}: ${(100 * h / Math.max(1, odHits)).toFixed(1)}%  avg ${(segPaid[s] / Math.max(1, h)).toFixed(2)}x`,
    );
  }
  console.log('');
}

simulate(0, 'FRESH (no artifacts)');
simulate(ART.BRASA | ART.YUNQUE | ART.TEMPLE, 'STEADY (all artifacts)');
