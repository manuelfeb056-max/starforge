/** Quick Nova Furnace calibration: EV per trigger + trigger rate. */
import { cryptoRng, runSpin, countStars, SYM } from '../src/engine.ts';
import { playNova, NOVA_TRIGGER_STARS } from '../src/nova.ts';

const rng = cryptoRng();
const N = 200_000;
let sum = 0, sum2 = 0, trig = 0, maxX = 0;
let totSym = 0, totSpec = 0, totResp = 0;
for (let i = 0; i < N; i++) {
  const r = playNova(rng, false);
  sum += r.totalX; sum2 += r.totalX * r.totalX;
  if (r.totalX > maxX) maxX = r.totalX;
  totSym += r.symbols; totSpec += r.specials; totResp += r.respins;
}
const ev = sum / N;
const se = Math.sqrt(sum2 / N - ev * ev) / Math.sqrt(N);
console.log(`nova EV/trigger (fresh): ${ev.toFixed(3)} ± ${se.toFixed(3)}  max ${maxX.toFixed(1)}x`);
console.log(`avg symbols ${ (totSym/N).toFixed(2) }  specials ${ (totSpec/N).toFixed(2) }  respins ${ (totResp/N).toFixed(2) }`);

// temple
let s2 = 0;
for (let i = 0; i < 50_000; i++) s2 += playNova(rng, true).totalX;
console.log(`nova EV/trigger (temple): ${(s2/50_000).toFixed(3)}`);

// trigger rate
let t2 = 0;
const M = 300_000;
for (let i = 0; i < M; i++) {
  const g = runSpin(rng, 0);
  // count stars on initial grid only
  let stars = 0;
  for (let c = 0; c < 30; c++) if (g.grids[0]![c] === SYM.STAR) stars++;
  if (stars >= NOVA_TRIGGER_STARS) t2++;
}
console.log(`trigger rate: ${(100*t2/M).toFixed(3)}%  -> bonus RTP contrib fresh ≈ ${(t2/M*ev*100).toFixed(2)}%`);
void countStars;
