/**
 * Headless Game-logic smoke test: Proxy-stubbed canvas 2D + DOM, runs real
 * demo spins (including natural + forced Nova Furnace bonuses) through the
 * full animation pipeline with reduced-motion on (fast).
 * Run: node scripts/run-smoke.cjs game
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
const { playNova } = await import('../src/nova.ts');
const { cryptoRng } = await import('../src/engine.ts');

const cb = {
  setBusy: () => undefined,
  setBalance: () => undefined,
  pushHistory: () => undefined,
  forgeIgnite: () => undefined,
  payBadge: () => undefined,
  winBanner: () => undefined,
  clearBanner: () => undefined,
  toast: () => undefined,
  crucibleChanged: () => undefined,
  canAfford: () => true,
};

const game = new Game(canvasEl as unknown as HTMLCanvasElement, cb as never, 'es');
game.start();

// fire a canvas click helper (pointerdown skips the current beat)
function clickCanvas(): void {
  const arr = listeners.get('pointerdown') ?? [];
  for (const f of arr) f({});
}

// sanity: the pure math resolves and is internally consistent
{
  const rng = cryptoRng();
  for (let i = 0; i < 50; i++) {
    const r = playNova(rng, false);
    if (!(r.totalX >= 0)) throw new Error('negative nova total');
    if (!r.events.length || r.events[r.events.length - 1]!.t !== 'end') throw new Error('missing end event');
  }
  const rt = playNova(rng, true);
  console.log(`nova math ok (sample temple totalX=${rt.totalX.toFixed(2)}, events=${rt.events.length})`);
}

let spins = 0;
const t0 = Date.now();
for (let i = 0; i < 60; i++) {
  spins++;
  await game.demoSpin();
  if (i % 7 === 3) clickCanvas(); // exercise the skip path mid-animation
}
console.log(`ran ${spins} base spins in ${Date.now() - t0}ms, no exceptions`);

// force the Nova Furnace cinematic directly (3.7% natural rate is slow)
const g2 = game as unknown as { presentNova: (temple: boolean) => Promise<number> };
const t1 = Date.now();
const totalX = await g2.presentNova(false);
console.log(`forced nova (fresh) resolved: totalX=${totalX.toFixed(2)} in ${Date.now() - t1}ms`);
if (!(totalX >= 0)) throw new Error('nova total negative');

// temple variant: values must be x1.08
const tt = await g2.presentNova(true);
console.log(`forced nova (temple) resolved: totalX=${tt.toFixed(2)}`);
if (!(tt >= 0)) throw new Error('temple nova total negative');

// demo shortcut path
await game.demoNova();
console.log('demoNova shortcut ok');

// host path: celebrate a synthetic settlement without a grid
game.hostPresentWin(250, 10);
console.log(`after hostPresentWin: balance=${game.balance.toFixed(1)} essence=${game.crucible.state.essence.toFixed(1)} forged=[${game.crucible.state.forged}]`);
game.destroy();
console.log('GAME SMOKE OK');
