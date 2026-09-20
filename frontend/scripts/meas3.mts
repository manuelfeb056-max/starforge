import { drawGrid, countStars, cryptoRng } from '../src/engine.ts';
const rng = cryptoRng();
let n3 = 0, n4 = 0;
const N = 200000;
for (let i = 0; i < N; i++) {
  const g = drawGrid(rng);
  const c = countStars(g);
  if (c >= 3) n3++;
  if (c >= 4) n4++;
}
console.log(`P(3+) = ${(100*n3/N).toFixed(3)}%  P(4+) = ${(100*n4/N).toFixed(3)}%`);
