/** Breakdown of RTP by component to audit the engine vs math-spec targets. */
import { cryptoRng, finalizeSpin, runSpin } from '../src/engine.ts';

const spins = Number(process.argv[2] ?? 500000);
const artifacts = Number(process.argv[3] ?? 0);
const pickIdx = [0, 1, 2, 3, 4];
const rng = cryptoRng();
let scatter = 0;
let pattern = 0;
let sn = 0;
let steps = 0;
let patternHits = 0;
const patternCounts: Record<string, number> = {};
for (let i = 0; i < spins; i++) {
  const s = runSpin(rng, artifacts);
  steps += s.steps.length;
  scatter += s.gridWinX;
  pattern += s.patternWinX;
  for (const st of s.steps) {
    if (st.pattern) {
      patternHits++;
      patternCounts[st.pattern.name] = (patternCounts[st.pattern.name] ?? 0) + 1;
    }
  }
  if (s.supernova) {
    const fin = finalizeSpin(s, pickIdx, false, null);
    sn += fin.supernovaWinX;
  }
}
console.log(`artifacts=${artifacts} spins=${spins}`);
console.log(`scatter  : ${(scatter / spins).toFixed(4)}  (target 0.66)`);
console.log(`patterns : ${(pattern / spins).toFixed(4)}  (target 0.06)  hits=${patternHits}`, patternCounts);
console.log(`supernova: ${(sn / spins).toFixed(4)}  (target 0.14)`);
console.log(`total    : ${((scatter + pattern + sn) / spins).toFixed(4)}`);
console.log(`avg steps: ${(steps / spins).toFixed(3)}`);
