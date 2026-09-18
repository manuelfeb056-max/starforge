/** Exact binomial E[pay] per mineral for the initial drop vs simulated step-0. */
import { MINERALS, SYM, cryptoRng, drawGrid, evaluateStep } from '../src/engine.ts';

const WEIGHTS = [30, 26, 22, 16, 12, 8, 5, 3];
const TOTAL = 122;
const PAY = [
  [0.2, 0.5, 2],
  [0.3, 0.8, 3],
  [0.5, 1.0, 4],
  [0.8, 1.5, 6],
  [1.0, 2.5, 10],
  [2.0, 5.0, 20],
  [5.0, 12.0, 50],
];
const NAMES = ['copper', 'iron', 'nickel', 'silver', 'gold', 'platinum', 'neutronium'];

function binomPMF(n: number, k: number, p: number): number {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

console.log('mineral      exact E[pay]   sim step0 E[pay]');
const rng = cryptoRng();
const N = 400000;
const simSum = new Array(7).fill(0);
for (let i = 0; i < N; i++) {
  const g = drawGrid(rng);
  const st = evaluateStep(g, 0);
  for (const w of st.wins) simSum[w.mineral] += w.payX;
}
for (let m = 0; m < 7; m++) {
  const p = (WEIGHTS[m] as number) / TOTAL;
  let exact = 0;
  for (let k = 8; k <= 30; k++) {
    const tier = k >= 12 ? 2 : k >= 10 ? 1 : 0;
    exact += binomPMF(30, k, p) * (PAY[m] as number[])[tier]!;
  }
  console.log(
    `${NAMES[m]!.padEnd(12)} ${exact.toFixed(5).padStart(12)} ${(simSum[m]! / N).toFixed(5).padStart(17)}`,
  );
}
