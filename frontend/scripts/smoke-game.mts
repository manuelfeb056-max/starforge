/**
 * Headless Game-logic smoke test: Proxy-stubbed canvas 2D + DOM, runs real
 * demo spins (including forced supernova + gamble) through the full animation
 * pipeline with reduced-motion on (fast).
 * Run: node scripts/run-smoke.cjs game   (or: host)
 */

// ---- browser stubs ----
const gradientStub = () => ({ addColorStop: () => undefined });
const ctxStub: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradientStub;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'getImageData') return () => ({ data: [] });
      if (typeof prop === 'string') return () => undefined;
      return undefined;
    },
    set() {
      return true;
    },
  },
);

function makeEl() {
  return {
    textContent: '',
    innerHTML: '',
    className: '',
    hidden: false,
    style: {} as Record<string, string>,
    classList: { add: () => undefined, remove: () => undefined, toggle: () => undefined, contains: () => false },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setAttribute: () => undefined,
    offsetWidth: 100,
    appendChild: () => undefined,
  };
}
const els = new Map<string, ReturnType<typeof makeEl>>();
const listeners = new Map<string, Array<(e: unknown) => void>>();

const canvasEl = {
  ...makeEl(),
  clientWidth: 1280,
  clientHeight: 800,
  width: 0,
  height: 0,
  getContext: () => ctxStub,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
  addEventListener: (t: string, f: (e: unknown) => void) => {
    const arr = listeners.get(t) ?? [];
    arr.push(f);
    listeners.set(t, arr);
  },
};

const g = globalThis as Record<string, unknown>;
g.window = {
  matchMedia: () => ({ matches: true }), // reduced motion => fast
  devicePixelRatio: 1,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  AudioContext: undefined,
};
g.document = {
  getElementById: (id: string) => {
    if (id === 'cv') return canvasEl;
    let el = els.get(id);
    if (!el) {
      el = makeEl();
      els.set(id, el);
    }
    return el;
  },
  createElement: () => makeEl(),
  addEventListener: () => undefined,
  documentElement: { lang: 'es' },
  activeElement: null,
  body: makeEl(),
};
const store = new Map<string, string>();
g.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
try {
  Object.defineProperty(g, 'navigator', { value: { language: 'es-ES' }, configurable: true });
} catch { /* node already provides one */ }
const rafQ: Array<() => void> = [];
g.requestAnimationFrame = (f: (t: number) => void): number => {
  setTimeout(() => {
    try {
      f(performance.now());
    } catch (e) {
      console.error('RAF ERR', e);
    }
  }, 0);
  return 1;
};
g.cancelAnimationFrame = () => undefined;

const { Game } = await import('../src/game.ts');
const { ART, cryptoRng, shufflePrizes } = await import('../src/engine.ts');

const cb = {
  setBusy: () => undefined,
  setBalance: () => undefined,
  pushHistory: () => undefined,
  forgeIgnite: () => undefined,
  payBadge: () => undefined,
  winBanner: () => undefined,
  clearBanner: () => undefined,
  picksStatus: () => undefined,
  gambleChoice: async () => true, // always gamble in the test
  toast: () => undefined,
  crucibleChanged: () => undefined,
  canAfford: () => true,
};

const game = new Game(canvasEl as unknown as HTMLCanvasElement, cb as never, 'es');
game.start();

// fire a canvas click helper (pointerdown at logical coords)
function clickCanvas(x: number, y: number): void {
  const arr = listeners.get('pointerdown') ?? [];
  for (const f of arr) f({ clientX: x, clientY: y });
}

let spins = 0;
const t0 = Date.now();
for (let i = 0; i < 60; i++) {
  spins++;
  await game.demoSpin();
}
console.log(`ran ${spins} base spins in ${Date.now() - t0}ms, no exceptions`);

// force the supernova + gamble path directly (0.6% natural rate is too slow to wait for)
const g2 = game as unknown as {
  presentSupernovaPicks: (prizes: number[]) => Promise<{ picks: number[]; gamble: boolean }>;
  supernova: { stars: Array<{ x: number; y: number; picked: boolean }> } | null;
};
const p2 = g2.presentSupernovaPicks([10, 20, 40, 80, 160, 320, 640, 1280, 2500, 5000, 10000, 20000]);
await new Promise(r => setTimeout(r, 10));
const sn = g2.supernova;
if (!sn || sn.stars.length !== 12) throw new Error('supernova overlay missing');
// click the same star twice (idempotent) then 5 distinct stars
clickCanvas(sn.stars[0]!.x, sn.stars[0]!.y);
clickCanvas(sn.stars[0]!.x, sn.stars[0]!.y);
for (const st of sn.stars.slice(1, 5)) clickCanvas(st.x, st.y);
await new Promise(r => setTimeout(r, 10));
const res = await p2;
console.log(`supernova resolved: picks=[${res.picks}] gamble=${res.gamble}`);
if (res.picks.length !== 5) throw new Error('expected 5 picks');

// also exercise the lose-gamble variant
cb.gambleChoice = async () => false;
const p3 = g2.presentSupernovaPicks([10, 20, 40, 80, 160, 320, 640, 1280, 2500, 5000, 10000, 20000]);
await new Promise(r => setTimeout(r, 10));
const sn3 = g2.supernova!;
for (const st of sn3.stars.slice(0, 5)) clickCanvas(st.x, st.y);
const res3 = await p3;
console.log(`supernova (decline gamble): picks=[${res3.picks}] gamble=${res3.gamble}`);

// temple check: supernova prizes are x1.10 when temple is forged (picks stay 5)
const basePool = shufflePrizes(cryptoRng(), 0).sort((a, b) => a - b);
const templePool = shufflePrizes(cryptoRng(), ART.TEMPLE).sort((a, b) => a - b);
console.log('base pool sorted  :', basePool.map(p => p.toFixed(1)).join(','));
console.log('temple pool sorted:', templePool.map(p => p.toFixed(1)).join(','));
for (let i = 0; i < 12; i++) {
  if (Math.abs(templePool[i]! - basePool[i]! * 1.1) > 1e-9) throw new Error('temple prize boost wrong');
}

// host path: celebrate a synthetic settlement without a grid
game.hostPresentWin(250, 10);
console.log(`after hostPresentWin: balance=${game.balance.toFixed(1)} essence=${game.crucible.state.essence.toFixed(1)} forged=[${game.crucible.state.forged}]`);
game.destroy();
console.log('GAME SMOKE OK');
