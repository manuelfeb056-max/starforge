var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res2) => function __init() {
  return fn && (res2 = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res2;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/engine.ts
var engine_exports = {};
__export(engine_exports, {
  ART: () => ART,
  CASCADE_CAP: () => CASCADE_CAP,
  CELLS: () => CELLS,
  COLS: () => COLS,
  MAX_PAYOUT_X: () => MAX_PAYOUT_X,
  MINERALS: () => MINERALS,
  PATTERNS: () => PATTERNS,
  ROWS: () => ROWS,
  SUPERNOVA_FIELD: () => SUPERNOVA_FIELD,
  SUPERNOVA_PICKS: () => SUPERNOVA_PICKS,
  SUPERNOVA_POOL: () => SUPERNOVA_POOL,
  SUPERNOVA_TRIGGER_STARS: () => SUPERNOVA_TRIGGER_STARS,
  SYM: () => SYM,
  TEMPLE_PRIZE_MULT: () => TEMPLE_PRIZE_MULT,
  countStars: () => countStars,
  cryptoRng: () => cryptoRng,
  drawGrid: () => drawGrid,
  drawRange: () => drawRange,
  drawSymbol: () => drawSymbol,
  evaluateStep: () => evaluateStep,
  finalizeSpin: () => finalizeSpin,
  gamble: () => gamble,
  runSpin: () => runSpin,
  shufflePrizes: () => shufflePrizes,
  supernovaPicks: () => supernovaPicks
});
function cryptoRng() {
  let buf = new Uint8Array(0);
  let pos = 0;
  const refill = () => {
    buf = new Uint8Array(512);
    globalThis.crypto.getRandomValues(buf);
    pos = 0;
  };
  const nextByte = () => {
    if (pos >= buf.length) refill();
    return buf[pos++];
  };
  return {
    nextByte,
    nextUint16: () => nextByte() << 8 | nextByte()
  };
}
function drawRange(rng, n) {
  const limit = Math.floor(256 / n) * n;
  for (; ; ) {
    const b = rng.nextByte();
    if (b < limit) return b % n;
  }
}
function drawSymbol(rng) {
  let v = rng.nextUint16();
  while (v >= SYMBOL_LIMIT) v = rng.nextUint16();
  let t = v % TOTAL_WEIGHT;
  for (let s = 0; s < WEIGHTS.length; s++) {
    const w = WEIGHTS[s];
    if (t < w) return s;
    t -= w;
  }
  return 0;
}
function drawGrid(rng) {
  const grid = new Array(CELLS);
  for (let i = 0; i < CELLS; i++) grid[i] = drawSymbol(rng);
  return grid;
}
function evaluateStep(grid, artifacts) {
  const wins = [];
  const winCells = [];
  const yunque = (artifacts & ART.YUNQUE) !== 0;
  const brasa = (artifacts & ART.BRASA) !== 0;
  const winningMinerals = /* @__PURE__ */ new Set();
  for (const m of MINERALS) {
    let count = 0;
    for (let i = 0; i < CELLS; i++) if (grid[i] === m) count++;
    if (count >= 8) {
      const tier = tierOf(count);
      const base = PAYTABLE[m][tier];
      const payX2 = tier === 2 && yunque ? base * 1.05 : base;
      wins.push({ mineral: m, count, tier, payX: payX2 });
      winningMinerals.add(m);
    }
  }
  for (let i = 0; i < CELLS; i++) {
    if (winningMinerals.has(grid[i])) winCells.push(i);
  }
  let pattern = null;
  for (const p of PATTERNS) {
    let mineral = -1;
    let ok = true;
    for (const c of p.cells) {
      const s = grid[c];
      if (s === SYM.STAR) {
        ok = false;
        break;
      }
      if (mineral === -1) mineral = s;
      else if (mineral !== s) {
        ok = false;
        break;
      }
    }
    if (ok && mineral !== -1) {
      pattern = { name: p.name, payX: p.payX * (brasa ? 1.25 : 1), cells: [...p.cells] };
      break;
    }
  }
  const payX = wins.reduce((s, w) => s + w.payX, 0) + (pattern ? pattern.payX : 0);
  return { wins, pattern, winCells, payX };
}
function refillGrid(grid, removed, rng) {
  const next = new Array(CELLS);
  for (let col = 0; col < COLS; col++) {
    const survivors = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const i = row * COLS + col;
      if (!removed[i]) survivors.push(grid[i]);
    }
    let r = ROWS - 1;
    for (const s of survivors) {
      next[r * COLS + col] = s;
      r--;
    }
    while (r >= 0) {
      next[r * COLS + col] = drawSymbol(rng);
      r--;
    }
  }
  return next;
}
function shufflePrizes(rng, artifacts = 0) {
  const mult = artifacts & ART.TEMPLE ? TEMPLE_PRIZE_MULT : 1;
  const pool = [...SUPERNOVA_POOL].map((p) => p * mult);
  for (let i = pool.length - 1; i >= 1; i--) {
    const j = drawRange(rng, i + 1);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool;
}
function supernovaPicks(prizes, picks) {
  return picks.reduce((s, p) => s + prizes[p], 0);
}
function gamble(rng) {
  return rng.nextByte() % 2 === 1;
}
function countStars(grid) {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (grid[i] === SYM.STAR) n++;
  return n;
}
function runSpin(rng, artifacts) {
  const grid0 = drawGrid(rng);
  const grids = [grid0];
  const steps = [];
  let grid = grid0;
  let gridWinX = 0;
  let patternWinX = 0;
  for (let step = 0; step < CASCADE_CAP; step++) {
    const res2 = evaluateStep(grid, artifacts);
    steps.push(res2);
    gridWinX += res2.wins.reduce((s, w) => s + w.payX, 0);
    if (res2.pattern) patternWinX += res2.pattern.payX;
    if (res2.payX <= 0 || res2.winCells.length === 0) break;
    const removed = new Array(CELLS).fill(false);
    for (const c of res2.winCells) removed[c] = true;
    grid = refillGrid(grid, removed, rng);
    grids.push(grid);
  }
  const supernova = countStars(grid0) >= SUPERNOVA_TRIGGER_STARS ? { prizes: shufflePrizes(rng, artifacts) } : null;
  return { grids, steps, supernova, gridWinX, patternWinX, totalWinX: gridWinX + patternWinX };
}
function finalizeSpin(spin, picks, gambleChoice, gambleWon) {
  let pickSumX = 0;
  let supernovaWinX = 0;
  if (spin.supernova) {
    pickSumX = supernovaPicks(spin.supernova.prizes, picks);
    supernovaWinX = gambleChoice ? gambleWon ? pickSumX * 2 : 0 : pickSumX;
  }
  const totalWinX = Math.min(spin.gridWinX + spin.patternWinX + supernovaWinX, MAX_PAYOUT_X);
  return { ...spin, pickSumX, gambled: gambleChoice, gambleWon, supernovaWinX, totalWinX };
}
var COLS, ROWS, CELLS, SYM, MINERALS, ART, MAX_PAYOUT_X, CASCADE_CAP, WEIGHTS, TOTAL_WEIGHT, SYMBOL_LIMIT, PAYTABLE, idx, PATTERNS, SUPERNOVA_POOL, SUPERNOVA_TRIGGER_STARS, SUPERNOVA_PICKS, SUPERNOVA_FIELD, TEMPLE_PRIZE_MULT, tierOf;
var init_engine = __esm({
  "src/engine.ts"() {
    "use strict";
    COLS = 6;
    ROWS = 5;
    CELLS = 30;
    SYM = {
      COPPER: 0,
      IRON: 1,
      NICKEL: 2,
      SILVER: 3,
      GOLD: 4,
      PLATINUM: 5,
      NEUTRONIUM: 6,
      STAR: 7
    };
    MINERALS = [0, 1, 2, 3, 4, 5, 6];
    ART = { BRASA: 1, YUNQUE: 2, TEMPLE: 4 };
    MAX_PAYOUT_X = 1e3;
    CASCADE_CAP = 2;
    WEIGHTS = [30, 26, 22, 16, 12, 8, 5, 3];
    TOTAL_WEIGHT = 122;
    SYMBOL_LIMIT = 65514;
    PAYTABLE = [
      [0.165, 0.4125, 1.65],
      // copper
      [0.2475, 0.66, 2.475],
      // iron
      [0.4125, 0.825, 3.3],
      // nickel
      [0.66, 1.2375, 4.95],
      // silver
      [0.825, 2.0625, 8.25],
      // gold
      [1.65, 4.125, 16.5],
      // platinum
      [4.125, 9.9, 41.25]
      // neutronium
    ];
    idx = (col, row) => row * COLS + col;
    PATTERNS = [
      { name: "herradura", payX: 15, cells: [idx(1, 1), idx(1, 2), idx(1, 3), idx(2, 3), idx(3, 3)] },
      { name: "diamante", payX: 8, cells: [idx(2, 0), idx(2, 4), idx(0, 2), idx(4, 2), idx(2, 2)] },
      { name: "equis", payX: 4, cells: [idx(1, 1), idx(3, 3), idx(2, 2), idx(1, 3), idx(3, 1)] },
      { name: "cruz", payX: 2, cells: [idx(2, 1), idx(2, 2), idx(2, 3), idx(1, 2), idx(3, 2)] }
    ];
    SUPERNOVA_POOL = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6, 6];
    SUPERNOVA_TRIGGER_STARS = 4;
    SUPERNOVA_PICKS = 5;
    SUPERNOVA_FIELD = 12;
    TEMPLE_PRIZE_MULT = 1.1;
    tierOf = (count) => count >= 12 ? 2 : count >= 10 ? 1 : 0;
  }
});

// src/render.ts
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function ensureStarfield() {
  if (starfield) return;
  const rnd = mulberry32(24301);
  starfield = [];
  for (let i = 0; i < 200; i++) {
    starfield.push({ x: rnd() * LW, y: rnd() * LH, r: 0.4 + rnd() * 1.6, tw: rnd() * Math.PI * 2, sp: 0.2 + rnd() * 0.8 });
  }
  constLines = [];
  for (let i = 0; i < 26; i++) {
    const a = starfield[Math.floor(rnd() * starfield.length)];
    let best = null;
    let bestD = 1e9;
    for (const b of starfield) {
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (b !== a && d < bestD && d < 220 * 220) {
        bestD = d;
        best = b;
      }
    }
    if (best) constLines.push([a, best]);
  }
}
function drawBackground(ctx, t, o = {}) {
  ensureStarfield();
  const sx = o.shakeX ?? 0;
  const sy = o.shakeY ?? 0;
  ctx.save();
  ctx.translate(sx, sy);
  const g3 = ctx.createLinearGradient(0, 0, 0, LH);
  g3.addColorStop(0, PAL.void0);
  g3.addColorStop(1, PAL.void1);
  ctx.fillStyle = g3;
  ctx.fillRect(-20, -20, LW + 40, LH + 40);
  const drift = o.reducedMotion ? 0 : t * 8e-3;
  const neb = (x, y, r, c1, c2, a) => {
    const ng = ctx.createRadialGradient(x, y, 0, x, y, r);
    ng.addColorStop(0, c1);
    ng.addColorStop(1, c2);
    ctx.globalAlpha = a;
    ctx.fillStyle = ng;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };
  neb(300 + Math.sin(drift * 2) * 30, 200, 420, "rgba(139,92,246,0.55)", "rgba(139,92,246,0)", 0.15);
  neb(1050 + Math.cos(drift * 1.6) * 40, 320, 460, "rgba(255,107,26,0.5)", "rgba(255,107,26,0)", 0.13);
  neb(680, 640, 380, "rgba(139,92,246,0.4)", "rgba(139,92,246,0)", 0.1);
  ctx.strokeStyle = "rgba(139,92,246,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, b] of constLines) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  for (const s of starfield) {
    const px = (s.x + (o.reducedMotion ? 0 : t * 2 * s.sp)) % LW;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.tw));
    ctx.globalAlpha = tw * 0.9;
    ctx.fillStyle = "#dfe6ff";
    ctx.beginPath();
    ctx.arc(px, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const flick = o.reducedMotion ? 0.85 : 0.78 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 17.7);
  const fg = ctx.createRadialGradient(LW / 2, LH + 60, 0, LW / 2, LH + 60, 620);
  fg.addColorStop(0, `rgba(255,107,26,${0.34 * flick})`);
  fg.addColorStop(0.5, `rgba(255,107,26,${0.12 * flick})`);
  fg.addColorStop(1, "rgba(255,107,26,0)");
  ctx.fillStyle = fg;
  ctx.fillRect(0, LH - 480, LW, 480);
  const vg = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.35, LW / 2, LH / 2, LH * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(2,2,8,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(-20, -20, LW + 40, LH + 40);
  ctx.restore();
  if (o.flash && o.flash > 0) {
    ctx.fillStyle = `rgba(255,247,230,${Math.min(1, o.flash)})`;
    ctx.fillRect(0, 0, LW, LH);
  }
}
function drawAnvil(ctx, x, y, w, h) {
  const g3 = ctx.createLinearGradient(x, y, x, y + h);
  g3.addColorStop(0, "#17162b");
  g3.addColorStop(0.5, "#101024");
  g3.addColorStop(1, "#0a0a1c");
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = g3;
  ctx.fill();
  const bg = ctx.createLinearGradient(x, y, x + w, y + h);
  bg.addColorStop(0, "rgba(255,179,71,0.5)");
  bg.addColorStop(0.5, "rgba(138,135,163,0.28)");
  bg.addColorStop(1, "rgba(255,107,26,0.45)");
  ctx.strokeStyle = bg;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  const rivet = (rx, ry) => {
    const rg = ctx.createRadialGradient(rx - 2, ry - 2, 0, rx, ry, 9);
    rg.addColorStop(0, "#ffe9c4");
    rg.addColorStop(0.5, "#8a6a3a");
    rg.addColorStop(1, "#2a1e10");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(rx, ry, 8, 0, Math.PI * 2);
    ctx.fill();
  };
  rivet(x + 20, y + 20);
  rivet(x + w - 20, y + 20);
  rivet(x + 20, y + h - 20);
  rivet(x + w - 20, y + h - 20);
}
function glyphPath(ctx, sym, cx, cy, r) {
  ctx.beginPath();
  switch (sym) {
    case 0:
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.95, cy + r * 0.75);
      ctx.lineTo(cx - r * 0.95, cy + r * 0.75);
      ctx.closePath();
      break;
    case 1:
      ctx.rect(cx - r * 0.8, cy - r * 0.55, r * 1.6, r * 1.1);
      break;
    case 2:
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i - Math.PI / 6;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 3:
      ctx.arc(cx, cy, r, Math.PI * 0.32, Math.PI * 1.68);
      ctx.arc(cx + r * 0.45, cy, r * 0.78, Math.PI * 1.62, Math.PI * 0.38, true);
      ctx.closePath();
      break;
    case 4:
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      break;
    case 5:
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx - r, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy - r);
      break;
    case 6:
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.8, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.8, cy);
      ctx.closePath();
      break;
  }
}
function drawSunRays(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 4 * i;
    ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g3 = Math.min(255, Math.max(0, (n >> 8 & 255) + amt));
  const b = Math.min(255, Math.max(0, (n & 255) + amt));
  return `#${(r << 16 | g3 << 8 | b).toString(16).padStart(6, "0")}`;
}
function drawMineral(ctx, sym, cx, cy, size, t, o = {}) {
  const base = MINERAL_COLORS[sym] ?? "#888";
  const s = size * (o.scale ?? 1);
  const half = s / 2;
  const r = s * 0.2;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.dim) ctx.globalAlpha *= 0.35;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  const g3 = ctx.createLinearGradient(cx, cy - half, cx, cy + half);
  g3.addColorStop(0, shade(base, 70));
  g3.addColorStop(0.45, base);
  g3.addColorStop(1, shade(base, -70));
  roundRect(ctx, cx - half, cy - half, s, s, r);
  ctx.fillStyle = g3;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  const ig = ctx.createRadialGradient(cx, cy - half * 0.5, 0, cx, cy - half * 0.5, half * 1.1);
  ig.addColorStop(0, "rgba(255,255,255,0.35)");
  ig.addColorStop(1, "rgba(255,255,255,0)");
  roundRect(ctx, cx - half, cy - half, s, s, r);
  ctx.fillStyle = ig;
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy - half + 2);
  ctx.lineTo(cx + 9, cy - half + 2);
  ctx.lineTo(cx, cy - half + 12);
  ctx.closePath();
  ctx.fill();
  if (sym === 6) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    ctx.save();
    ctx.globalAlpha = (o.alpha ?? 1) * (0.35 + 0.3 * pulse);
    ctx.strokeStyle = PAL.violet;
    ctx.lineWidth = 3 + 2 * pulse;
    roundRect(ctx, cx - half - 4, cy - half - 4, s + 8, s + 8, r + 4);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(2.5, s * 0.045);
  ctx.lineJoin = "round";
  glyphPath(ctx, sym, cx, cy + 1.5, s * 0.24);
  ctx.stroke();
  ctx.strokeStyle = shade(base, 85);
  ctx.lineWidth = Math.max(1.5, s * 0.028);
  glyphPath(ctx, sym, cx, cy, s * 0.24);
  ctx.stroke();
  if (sym === 4) {
    ctx.strokeStyle = shade(base, 85);
    ctx.lineWidth = Math.max(1.5, s * 0.028);
    drawSunRays(ctx, cx, cy, s * 0.24);
    ctx.stroke();
  }
  ctx.restore();
  if (o.winGlow && o.winGlow > 0) {
    ctx.save();
    ctx.globalAlpha = o.winGlow * 0.85;
    ctx.strokeStyle = PAL.hotWhite;
    ctx.lineWidth = 4;
    roundRect(ctx, cx - half - 3, cy - half - 3, s + 6, s + 6, r + 3);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function starPath(ctx, cx, cy, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = rot + Math.PI / 5 * i - Math.PI / 2;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function drawScatterStar(ctx, cx, cy, size, t, o = {}) {
  const r = size / 2 * (o.scale ?? 1);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.dim) ctx.globalAlpha *= 0.35;
  const rot = o.rot ?? t * 0.5;
  const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
  gg.addColorStop(0, "rgba(255,247,230,0.55)");
  gg.addColorStop(0.4, "rgba(255,179,71,0.22)");
  gg.addColorStop(1, "rgba(255,179,71,0)");
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  const bg = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  bg.addColorStop(0, "#fffdf4");
  bg.addColorStop(0.6, PAL.emberGold);
  bg.addColorStop(1, "#c77b1e");
  starPath(ctx, cx, cy, r, rot);
  ctx.fillStyle = bg;
  ctx.shadowColor = "rgba(255,200,100,0.8)";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
function drawSymbol2(ctx, sym, cx, cy, size, t, o = {}) {
  if (sym <= 6) drawMineral(ctx, sym, cx, cy, size, t, o);
  else drawScatterStar(ctx, cx, cy, size, t, o);
}
function drawCrucible(ctx, x, y, w, h, progress, t, flash, reducedMotion) {
  const wall = 10;
  const vg = ctx.createLinearGradient(x, y, x + w, y);
  vg.addColorStop(0, "#1b1a33");
  vg.addColorStop(0.5, "#2c2a4d");
  vg.addColorStop(1, "#141325");
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = vg;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,179,71,0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const ix = x + wall;
  const iw = w - wall * 2;
  const ih = h - wall * 2 - 8;
  const iy = y + wall + 4;
  const fillH = Math.max(0, Math.min(1, progress)) * ih;
  const surfY = iy + ih - fillH;
  if (fillH > 2) {
    ctx.save();
    roundRect(ctx, ix, iy, iw, ih, 14);
    ctx.clip();
    const lg = ctx.createLinearGradient(0, surfY, 0, iy + ih);
    lg.addColorStop(0, PAL.emberGold);
    lg.addColorStop(0.35, PAL.molten);
    lg.addColorStop(1, "#7a2400");
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(ix, iy + ih);
    ctx.lineTo(ix, surfY);
    const amp = reducedMotion ? 0 : 5;
    const wl = iw / 3.2;
    for (let px = 0; px <= iw; px += 4) {
      const py = surfY + Math.sin(px / wl + t * 3.1) * amp + Math.sin(px / (wl * 0.5) - t * 4.3) * amp * 0.4;
      ctx.lineTo(ix + px, py);
    }
    ctx.lineTo(ix + iw, iy + ih);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,247,230,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= iw; px += 4) {
      const py = surfY + Math.sin(px / wl + t * 3.1) * amp + Math.sin(px / (wl * 0.5) - t * 4.3) * amp * 0.4;
      if (px === 0) ctx.moveTo(ix + px, py);
      else ctx.lineTo(ix + px, py);
    }
    ctx.stroke();
    ctx.shadowColor = PAL.molten;
    ctx.shadowBlur = 24;
    ctx.fillStyle = "rgba(255,107,26,0.12)";
    ctx.fillRect(ix, surfY - 26, iw, 26);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, flash);
    roundRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = "#fff7e6";
    ctx.fill();
    ctx.restore();
  }
}
function novaStarPositions() {
  const pos = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const fx = col / 3;
      const x = LW * (0.22 + fx * 0.56);
      const arc = Math.sin(fx * Math.PI) * -46;
      const y = LH * (0.3 + row * 0.17) + arc;
      pos.push({ x, y });
    }
  }
  return pos;
}
function drawSupernovaField(ctx, t, zoom, stars, reducedMotion) {
  ctx.fillStyle = `rgba(4,3,14,${0.82 * Math.min(1, zoom * 2)})`;
  ctx.fillRect(0, 0, LW, LH);
  if (!reducedMotion && zoom > 0) {
    ensureStarfield();
    const cx = LW / 2;
    const cy = LH / 2;
    ctx.save();
    ctx.lineWidth = 1.6;
    for (const s of starfield) {
      const dx = s.x - cx;
      const dy = s.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const lead = zoom * 130 * (0.4 + s.sp * 0.6);
      const x2 = s.x + ux * lead;
      const y2 = s.y + uy * lead;
      const a = Math.min(0.75, zoom * 0.8);
      const grad = ctx.createLinearGradient(s.x, s.y, x2, y2);
      grad.addColorStop(0, `rgba(223,230,255,0)`);
      grad.addColorStop(1, `rgba(223,230,255,${a})`);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }
  const cg = ctx.createRadialGradient(LW / 2, LH * 0.42, 0, LW / 2, LH * 0.42, 420);
  cg.addColorStop(0, "rgba(139,92,246,0.28)");
  cg.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, LW, LH);
  for (const st of stars) {
    ctx.save();
    const tw = reducedMotion ? 0.85 : 0.65 + 0.35 * Math.sin(t * 2.4 + st.x * 0.01 + st.y * 0.013);
    if (st.dim) ctx.globalAlpha = 0.22;
    else ctx.globalAlpha = tw;
    const R = 26;
    const gg = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, R * 2.2);
    gg.addColorStop(0, st.picked ? "rgba(255,247,230,0.9)" : "rgba(139,92,246,0.55)");
    gg.addColorStop(1, "rgba(139,92,246,0)");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(st.x, st.y, R * 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (st.picked && !st.revealed) {
      const k = Math.max(0.05, 1 - st.pickT * 3);
      starPath(ctx, st.x, st.y, R * k, t * 4);
      ctx.fillStyle = "#fff7e6";
      ctx.shadowColor = "#fff7e6";
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (st.revealed) {
      starPath(ctx, st.x, st.y, R * 0.45, 0);
      ctx.fillStyle = "rgba(255,247,230,0.9)";
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = PAL.hotWhite;
      ctx.font = `700 30px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = PAL.molten;
      ctx.shadowBlur = 12;
      ctx.fillText(`\xD7${st.prize}`, st.x, st.y - R * 1.15);
      ctx.shadowBlur = 0;
    } else {
      starPath(ctx, st.x, st.y, R, t * 0.6 + st.x);
      const sg = ctx.createLinearGradient(st.x, st.y - R, st.x, st.y + R);
      sg.addColorStop(0, "#ffffff");
      sg.addColorStop(0.55, "#cfd6ff");
      sg.addColorStop(1, PAL.violet);
      ctx.fillStyle = sg;
      ctx.shadowColor = PAL.violet;
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (st.ringT > 0 && st.ringT < 1) {
      ctx.globalAlpha = (1 - st.ringT) * 0.9;
      ctx.strokeStyle = "#fff7e6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(st.x, st.y, 12 + st.ringT * 90, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
function drawRays(ctx, cx, cy, t, color, alpha, reducedMotion) {
  if (reducedMotion) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.12);
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2;
    const a1 = (i + 0.5) / n * Math.PI * 2;
    const grad = ctx.createRadialGradient(0, 0, 40, 0, 0, 520);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(255,179,71,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 520, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function spawnEmbers(parts, x, y, n, spread = 160, up = -260) {
  const colors = ["#ff6b1a", "#ffb347", "#fff7e6", "#ff8c3a"];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * spread;
    const life = 0.5 + Math.random() * 0.7;
    parts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.6 + up * Math.random(),
      life,
      maxLife: life,
      size: 2 + Math.random() * 4,
      color: colors[Math.random() * colors.length | 0],
      grav: 320,
      drag: 0.98
    });
  }
}
function spawnSparks(parts, x, y, n, color = "#22d3ee") {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    const life = 0.3 + Math.random() * 0.4;
    parts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life,
      maxLife: life,
      size: 1.5 + Math.random() * 2.5,
      color,
      grav: 60,
      drag: 0.96
    });
  }
}
function updateParticles(parts, dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    p.vy += p.grav * dt;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
function drawParticles(ctx, parts) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of parts) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
var LW, LH, PAL, MINERAL_COLORS, starfield, constLines;
var init_render = __esm({
  "src/render.ts"() {
    "use strict";
    LW = 1280;
    LH = 800;
    PAL = {
      void0: "#050510",
      void1: "#0d0b26",
      molten: "#ff6b1a",
      emberGold: "#ffb347",
      hotWhite: "#fff7e6",
      cyan: "#22d3ee",
      violet: "#8b5cf6",
      steel: "#e8e6f0",
      muted: "#8a87a3"
    };
    MINERAL_COLORS = [
      "#b87333",
      // copper
      "#9aa5b1",
      // iron
      "#7dd3a8",
      // nickel
      "#c9d4e3",
      // silver
      "#f5c542",
      // gold
      "#e8fbff",
      // platinum
      "#8b5cf6"
      // neutronium
    ];
    starfield = null;
    constLines = null;
  }
});

// src/audio.ts
var AudioEngine, audio;
var init_audio = __esm({
  "src/audio.ts"() {
    "use strict";
    AudioEngine = class {
      ctx = null;
      master = null;
      ambientNodes = [];
      ambientStarted = false;
      muted = false;
      constructor() {
        try {
          this.muted = localStorage.getItem("starforge-muted") === "1";
        } catch {
          this.muted = false;
        }
      }
      /** Must be called from a user gesture at least once. */
      unlock() {
        if (this.ctx) {
          if (this.ctx.state === "suspended") void this.ctx.resume();
          return;
        }
        const AC = window.AudioContext ?? window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
      }
      setMuted(m) {
        this.muted = m;
        try {
          localStorage.setItem("starforge-muted", m ? "1" : "0");
        } catch {
        }
        if (this.master && this.ctx) {
          this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
        }
      }
      now() {
        return this.ctx ? this.ctx.currentTime : 0;
      }
      env(gain, t, peak, attack, decay) {
        gain.gain.setValueAtTime(1e-4, t);
        gain.gain.exponentialRampToValueAtTime(Math.max(peak, 2e-4), t + attack);
        gain.gain.exponentialRampToValueAtTime(1e-4, t + attack + decay);
      }
      tone(opts) {
        if (!this.ctx || !this.master || this.muted) return;
        const t = this.now() + (opts.delay ?? 0);
        const osc = this.ctx.createOscillator();
        const g3 = this.ctx.createGain();
        osc.type = opts.type ?? "sine";
        osc.frequency.setValueAtTime(opts.freq, t);
        if (opts.freqEnd !== void 0) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + (opts.attack ?? 0.01) + (opts.decay ?? 0.3));
        this.env(g3, t, opts.peak ?? 0.2, opts.attack ?? 5e-3, opts.decay ?? 0.3);
        osc.connect(g3).connect(this.master);
        osc.start(t);
        osc.stop(t + (opts.attack ?? 5e-3) + (opts.decay ?? 0.3) + 0.05);
      }
      noise(opts) {
        if (!this.ctx || !this.master || this.muted) return;
        const t = this.now() + (opts.delay ?? 0);
        const dur = (opts.attack ?? 5e-3) + (opts.decay ?? 0.2) + 0.05;
        const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = opts.filterType ?? "lowpass";
        filter.frequency.setValueAtTime(opts.filterFreq ?? 1200, t);
        if (opts.filterEnd !== void 0) filter.frequency.exponentialRampToValueAtTime(opts.filterEnd, t + dur);
        filter.Q.value = opts.q ?? 0.8;
        const g3 = this.ctx.createGain();
        this.env(g3, t, opts.peak ?? 0.2, opts.attack ?? 5e-3, opts.decay ?? 0.2);
        src.connect(filter).connect(g3).connect(this.master);
        src.start(t);
        src.stop(t + dur);
      }
      /** Symbol drop tick; pitch varies by column. */
      drop(column) {
        this.noise({ peak: 0.12, decay: 0.06, filterFreq: 900 + column * 220, filterType: "bandpass", q: 2 });
      }
      /** Win chime arpeggio; tier 0/1/2 -> higher base note + longer arp. */
      win(tier) {
        const base = [523.25, 659.25, 783.99][tier] ?? 523.25;
        const scale = [0, 2, 4, 7, 9, 12, 16];
        const notes = tier === 0 ? 3 : tier === 1 ? 5 : 7;
        for (let i = 0; i < notes; i++) {
          const semitone = scale[i % scale.length] + 12 * Math.floor(i / scale.length);
          this.tone({
            freq: base * Math.pow(2, semitone / 12),
            type: i % 2 ? "triangle" : "sine",
            peak: 0.22,
            decay: 0.5,
            delay: i * 0.07
          });
        }
      }
      /** Cascade rising whoosh. */
      cascade() {
        this.noise({ peak: 0.14, attack: 0.05, decay: 0.35, filterFreq: 400, filterEnd: 4e3, filterType: "bandpass", q: 1.2 });
      }
      /** Deep anvil slam (Yunque-boosted scatter win): 55Hz thunk, short. */
      slam() {
        this.tone({ freq: 58, freqEnd: 40, type: "sine", peak: 0.4, attack: 4e-3, decay: 0.28 });
        this.noise({ peak: 0.18, decay: 0.1, filterFreq: 900, filterType: "lowpass" });
      }
      /** Wild ignite (Brasa): quick flame burst. */
      ignite() {
        this.noise({ peak: 0.2, attack: 0.02, decay: 0.25, filterFreq: 1800, filterEnd: 500, filterType: "bandpass", q: 1.4 });
        this.tone({ freq: 220, freqEnd: 440, type: "triangle", peak: 0.12, attack: 0.02, decay: 0.25 });
      }
      /** Forge: deep metallic thunk (55Hz) + noise burst + shimmer. */
      forge() {
        this.tone({ freq: 55, freqEnd: 38, type: "sine", peak: 0.5, attack: 5e-3, decay: 0.5 });
        this.noise({ peak: 0.25, decay: 0.18, filterFreq: 2500, filterType: "highpass" });
        this.tone({ freq: 1567, type: "sine", peak: 0.08, decay: 0.8, delay: 0.08 });
        this.tone({ freq: 2093, type: "sine", peak: 0.06, decay: 0.9, delay: 0.16 });
      }
      /** Supernova: sawtooth riser 200->2000Hz + explosion. */
      supernova() {
        this.tone({ freq: 200, freqEnd: 2e3, type: "sawtooth", peak: 0.16, attack: 0.6, decay: 0.1 });
        this.noise({ peak: 0.4, attack: 0.01, decay: 0.9, filterFreq: 6e3, filterEnd: 120, delay: 0.55 });
        this.tone({ freq: 90, freqEnd: 30, type: "sine", peak: 0.5, attack: 0.01, decay: 1, delay: 0.55 });
      }
      /** Pick ping; pitch rises with prize size. */
      pick(prizeX) {
        const freq = 880 * Math.pow(2, Math.min(prizeX, 6) / 6);
        this.tone({ freq, type: "sine", peak: 0.25, decay: 0.4 });
        this.tone({ freq: freq * 2, type: "sine", peak: 0.1, decay: 0.3 });
      }
      gambleWin() {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => this.tone({ freq: f, type: "triangle", peak: 0.22, decay: 0.4, delay: i * 0.09 }));
      }
      gambleLose() {
        this.tone({ freq: 330, freqEnd: 110, type: "triangle", peak: 0.2, attack: 0.02, decay: 0.6 });
      }
      button() {
        this.tone({ freq: 1200, type: "sine", peak: 0.08, decay: 0.05 });
      }
      /** Very subtle low thud — never punish a loss. */
      lose() {
        this.tone({ freq: 70, freqEnd: 50, type: "sine", peak: 0.1, attack: 0.01, decay: 0.25 });
      }
      /** Low cosmic pad loop; starts on first interaction. */
      startAmbient() {
        if (!this.ctx || !this.master || this.ambientStarted) return;
        this.ambientStarted = true;
        const t = this.now();
        const g3 = this.ctx.createGain();
        g3.gain.value = 0;
        g3.gain.setTargetAtTime(0.05, t, 3);
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 12;
        lfo.connect(lfoGain);
        for (const f of [55, 55.7, 110.4]) {
          const osc = this.ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = f;
          lfoGain.connect(osc.frequency);
          osc.connect(g3);
          osc.start(t);
          this.ambientNodes.push(osc);
        }
        lfo.start(t);
        this.ambientNodes.push(lfo);
        g3.connect(this.master);
      }
    };
    audio = new AudioEngine();
  }
});

// src/crucible.ts
var KEY, THRESHOLDS, fresh, Crucible;
var init_crucible = __esm({
  "src/crucible.ts"() {
    "use strict";
    init_engine();
    KEY = "starforge-crucible-v1";
    THRESHOLDS = [
      { bit: ART.BRASA, key: "brasa", threshold: 25 },
      { bit: ART.YUNQUE, key: "yunque", threshold: 75 },
      { bit: ART.TEMPLE, key: "temple", threshold: 150 }
    ];
    fresh = () => ({ essence: 0, forged: [false, false, false] });
    Crucible = class {
      state = fresh();
      constructor() {
        this.load();
      }
      load() {
        try {
          const raw = localStorage.getItem(KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (typeof parsed.essence === "number") this.state.essence = Math.max(0, parsed.essence);
          if (Array.isArray(parsed.forged) && parsed.forged.length === 3) {
            this.state.forged = [!!parsed.forged[0], !!parsed.forged[1], !!parsed.forged[2]];
          }
        } catch {
          this.state = fresh();
        }
      }
      save() {
        try {
          localStorage.setItem(KEY, JSON.stringify(this.state));
        } catch {
        }
      }
      /** Bitmask for gameData byte AND the demo engine. */
      get bitmask() {
        let m = 0;
        THRESHOLDS.forEach((t, i) => {
          if (this.state.forged[i]) m |= t.bit;
        });
        return m;
      }
      forgedKeys() {
        const out = [];
        THRESHOLDS.forEach((t, i) => {
          if (this.state.forged[i]) out.push(t.key);
        });
        return out;
      }
      /** Next unforged threshold, or null when all forged. */
      nextThreshold() {
        for (let i = 0; i < THRESHOLDS.length; i++) {
          if (!this.state.forged[i]) {
            const t = THRESHOLDS[i];
            return { key: t.key, threshold: t.threshold };
          }
        }
        return null;
      }
      /** Progress 0..1 toward the next artifact (1 when all forged). */
      progress() {
        const next = this.nextThreshold();
        if (!next) return 1;
        const prev = this.prevThresholdValue(next.key);
        return Math.min(1, Math.max(0, (this.state.essence - prev) / (next.threshold - prev)));
      }
      prevThresholdValue(key) {
        let prev = 0;
        for (const t of THRESHOLDS) {
          if (t.key === key) return prev;
          prev = t.threshold;
        }
        return prev;
      }
      /**
       * Add essence from a finished spin. Returns the artifact keys forged by
       * this spin (usually 0 or 1).
       */
      addEssence(x) {
        const forged = [];
        this.state.essence += x;
        THRESHOLDS.forEach((t, i) => {
          if (!this.state.forged[i] && this.state.essence >= t.threshold) {
            this.state.forged[i] = true;
            forged.push(t.key);
          }
        });
        this.save();
        return forged;
      }
      reset() {
        this.state = fresh();
        this.save();
      }
    };
  }
});

// src/i18n.ts
var es, en, STR;
var init_i18n = __esm({
  "src/i18n.ts"() {
    "use strict";
    es = {
      tagline: "La Forja Estelar",
      balance: "Saldo",
      demo: "DEMO",
      bet: "Apuesta",
      forge: "FORJAR",
      forging: "FORJANDO\u2026",
      maxBetNote: "Apuesta m\xE1xima limitada por la b\xF3veda",
      lastWin: "\xDAltima victoria",
      history: "Historial",
      noWins: "Sin victorias a\xFAn \u2014 la forja espera.",
      crucible: "Crisol",
      essence: "Esencia",
      nextArtifact: "Siguiente artefacto",
      allForged: "Forja completa",
      legendary: "FORJA LEGENDARIA",
      supernova: "\xA1SUPERNOVA!",
      pickStars: "Elige 5 estrellas",
      picksLeft: (n) => `Elige ${n} m\xE1s`,
      collect: "RECOGER",
      doubleOrNothing: "DOBLE O NADA",
      gamblePrompt: (x) => `\xBFApostar ${x}? 50/50: doble o nada.`,
      gambleWon: "\xA1DOBLADO!",
      gambleLost: "La forja reclama su parte",
      waitingHost: "Esperando a la red\u2026",
      sessionSettling: "Revelando resultado\u2026",
      newRound: "Ronda lista",
      soundOn: "Sonido activado",
      soundOff: "Sonido silenciado",
      infoTitle: "C\xF3mo jugar",
      rtpLine: "RTP 96.0% (estable) / \u226593% sin artefactos. La demo usa la misma matem\xE1tica que el contrato on-chain.",
      resetProgress: "Reiniciar progresi\xF3n",
      resetDone: "Progresi\xF3n reiniciada",
      close: "Cerrar",
      artifactBrasa: "Brasa",
      artifactYunque: "Yunque",
      artifactTemple: "Temple",
      artifactBrasaDesc: "Constelaciones \xD71.25",
      artifactYunqueDesc: "Scatter 12+ \xD71.05",
      artifactTempleDesc: "Supernova: premios \xD71.10",
      forged: "\xA1Forjado!",
      winX: (x) => `${x}\xD7`,
      credits: "cr\xE9ditos",
      cancelled: "Ronda cancelada",
      forfeited: "Ronda expirada",
      connectFail: "Sin anfitri\xF3n \u2014 modo demo",
      clickToSkip: "clic para saltar"
    };
    en = {
      tagline: "The Star Forge",
      balance: "Balance",
      demo: "DEMO",
      bet: "Bet",
      forge: "FORGE",
      forging: "FORGING\u2026",
      maxBetNote: "Max bet limited by the vault",
      lastWin: "Last win",
      history: "History",
      noWins: "No wins yet \u2014 the forge awaits.",
      crucible: "Crucible",
      essence: "Essence",
      nextArtifact: "Next artifact",
      allForged: "Forge complete",
      legendary: "LEGENDARY FORGE",
      supernova: "SUPERNOVA!",
      pickStars: "Pick 5 stars",
      picksLeft: (n) => `Pick ${n} more`,
      collect: "COLLECT",
      doubleOrNothing: "DOUBLE OR NOTHING",
      gamblePrompt: (x) => `Gamble ${x}? 50/50: double or nothing.`,
      gambleWon: "DOUBLED!",
      gambleLost: "The forge claims its share",
      waitingHost: "Waiting for the network\u2026",
      sessionSettling: "Revealing outcome\u2026",
      newRound: "Round ready",
      soundOn: "Sound on",
      soundOff: "Sound muted",
      infoTitle: "How to play",
      rtpLine: "RTP 96.0% (steady) / \u226593% fresh. The demo uses the same math as the on-chain contract.",
      resetProgress: "Reset progression",
      resetDone: "Progression reset",
      close: "Close",
      artifactBrasa: "Ember",
      artifactYunque: "Anvil",
      artifactTemple: "Temper",
      artifactBrasaDesc: "Constellation pays \xD71.25",
      artifactYunqueDesc: "Tier-3 (12+) scatter \xD71.05",
      artifactTempleDesc: "Supernova prizes \xD71.10",
      forged: "Forged!",
      winX: (x) => `${x}\xD7`,
      credits: "credits",
      cancelled: "Round cancelled",
      forfeited: "Round expired",
      connectFail: "No host \u2014 demo mode",
      clickToSkip: "click to skip"
    };
    STR = { es, en };
  }
});

// src/game.ts
var game_exports = {};
__export(game_exports, {
  BETS: () => BETS,
  GRID_X: () => GRID_X,
  GRID_Y: () => GRID_Y,
  Game: () => Game
});
var BETS, PITCH, CELL, GRID_X, GRID_Y, $, easeOutCubic, easeInCubic, easeOutBack, fmtInt, fmtX, Game;
var init_game = __esm({
  "src/game.ts"() {
    "use strict";
    init_engine();
    init_render();
    init_audio();
    init_crucible();
    init_i18n();
    BETS = [1, 2, 5, 10, 25, 50, 100];
    PITCH = 116;
    CELL = 104;
    GRID_X = 298;
    GRID_Y = 116;
    $ = (id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`missing #${id}`);
      return el;
    };
    easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
    easeInCubic = (k) => k * k * k;
    easeOutBack = (k) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    };
    fmtInt = (n) => Math.floor(n).toLocaleString("en-US");
    fmtX = (x) => (Math.round(x * 100) / 100).toString();
    Game = class {
      canvas;
      ctx;
      cb;
      locale = "es";
      mode = "demo";
      state = "idle";
      crucible = new Crucible();
      rng = cryptoRng();
      balance = 1e3;
      betIdx = 2;
      // 5
      reducedMotion = false;
      raf = 0;
      t = 0;
      lastTs = 0;
      dead = false;
      skipFlag = false;
      particles = [];
      cells = [];
      gridOn = false;
      shakeT = 0;
      shakeDur = 0;
      shakeMag = 0;
      flash = 0;
      crucibleFlash = 0;
      raysT = -1;
      // >=0 while big-win rays show
      supernova = null;
      constructor(canvas, cb2, locale) {
        this.canvas = canvas;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        this.ctx = ctx;
        this.cb = cb2;
        this.locale = locale;
        this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        try {
          const b = localStorage.getItem("starforge-bet");
          if (b !== null) {
            const i = BETS.indexOf(Number(b));
            if (i >= 0) this.betIdx = i;
          }
        } catch {
        }
        const g3 = drawGrid(this.rng);
        this.cells = g3.map((sym) => ({ sym, dy: 0, alpha: 0.5, scale: 1, glow: 0, shimmer: false }));
        this.gridOn = true;
        canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
      }
      get S() {
        return STR[this.locale];
      }
      get bet() {
        return BETS[this.betIdx];
      }
      get artifacts() {
        return this.crucible.bitmask;
      }
      // ------------------------------------------------------------------ loop
      start() {
        this.resize();
        window.addEventListener("resize", () => this.resize());
        this.lastTs = performance.now();
        const loop = (ts) => {
          if (this.dead) return;
          const dt = Math.min(0.05, (ts - this.lastTs) / 1e3);
          this.lastTs = ts;
          this.t += dt;
          this.update(dt);
          this.render();
          this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
      }
      destroy() {
        this.dead = true;
        cancelAnimationFrame(this.raf);
      }
      resize() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (!w || !h) return;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
      }
      update(dt) {
        updateParticles(this.particles, dt);
        if (this.shakeT < this.shakeDur) this.shakeT += dt;
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
        if (this.crucibleFlash > 0) this.crucibleFlash = Math.max(0, this.crucibleFlash - dt * 1.8);
        if (this.raysT >= 0) {
          this.raysT += dt;
          if (this.raysT > 3.2) this.raysT = -1;
        }
        if (this.supernova) {
          for (const st of this.supernova.stars) {
            if (st.picked) {
              st.pickT += dt;
              if (st.pickT > 0.32) st.revealed = true;
              if (st.ringT < 1) st.ringT = Math.min(1, st.ringT + dt * 2.4);
            }
          }
        }
      }
      render() {
        const { ctx } = this;
        const s = this.canvas.width / LW;
        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.clearRect(0, 0, LW, LH);
        let shx = 0;
        let shy = 0;
        if (this.shakeT < this.shakeDur && !this.reducedMotion) {
          const k = 1 - this.shakeT / this.shakeDur;
          shx = (Math.random() * 2 - 1) * this.shakeMag * k;
          shy = (Math.random() * 2 - 1) * this.shakeMag * k;
        }
        drawBackground(ctx, this.t, { shakeX: shx, shakeY: shy, flash: this.flash, reducedMotion: this.reducedMotion });
        ctx.save();
        ctx.translate(shx, shy);
        drawCrucible(ctx, 48, 168, 120, 232, this.crucible.progress(), this.t, this.crucibleFlash, this.reducedMotion);
        drawAnvil(ctx, 256, 88, 768, 624);
        if (this.gridOn) this.drawGrid();
        if (this.raysT >= 0) {
          drawRays(ctx, LW / 2, LH * 0.42, this.t, "rgba(255,179,71,0.5)", Math.max(0, 0.8 - this.raysT * 0.25), this.reducedMotion);
        }
        drawParticles(ctx, this.particles);
        ctx.restore();
        if (this.supernova) {
          drawSupernovaField(ctx, this.t, this.supernova.zoom, this.supernova.stars, this.reducedMotion);
        }
      }
      drawGrid() {
        const { ctx } = this;
        const at = this.reducedMotion ? 0 : this.t;
        for (let i = 0; i < CELLS; i++) {
          const c = this.cells[i];
          const col = i % COLS;
          const row = i / COLS | 0;
          const cx = GRID_X + col * PITCH + CELL / 2;
          const cy = GRID_Y + row * PITCH + CELL / 2 + c.dy;
          if (c.shimmer && !this.reducedMotion) {
            const p = 0.5 + 0.5 * Math.sin(this.t * 9 + i);
            ctx.save();
            ctx.globalAlpha = 0.35 + 0.4 * p;
            ctx.strokeStyle = "#22d3ee";
            ctx.lineWidth = 3;
            ctx.strokeRect(GRID_X + col * PITCH + 4, GRID_Y + row * PITCH + 4 + c.dy, CELL - 8, CELL - 8);
            ctx.restore();
          }
          if (c.alpha <= 0.01) continue;
          drawSymbol2(ctx, c.sym, cx, cy, CELL * 0.86, at, {
            alpha: c.alpha,
            scale: c.scale,
            winGlow: c.glow
          });
        }
      }
      cellCenter(i) {
        const col = i % COLS;
        const row = i / COLS | 0;
        return { x: GRID_X + col * PITCH + CELL / 2, y: GRID_Y + row * PITCH + CELL / 2 };
      }
      // ------------------------------------------------------------- sequencing
      skip() {
        this.skipFlag = true;
      }
      wait(ms) {
        return new Promise((res2) => {
          let m = this.reducedMotion ? Math.min(ms, 80) : ms;
          if (this.skipFlag || m <= 0 || this.dead) return res2();
          const t02 = performance.now();
          const tick = () => {
            if (this.skipFlag || this.dead) return res2();
            if (performance.now() - t02 >= m) return res2();
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }
      tween(durMs, onU, ease = easeOutCubic) {
        return new Promise((res2) => {
          const dur = this.reducedMotion ? Math.min(durMs, 90) : durMs;
          const t02 = performance.now();
          const step = () => {
            if (this.dead) return res2();
            if (this.skipFlag) {
              onU(1);
              return res2();
            }
            const k = (performance.now() - t02) / dur;
            if (k >= 1) {
              onU(1);
              return res2();
            }
            onU(ease(k));
            requestAnimationFrame(step);
          };
          step();
        });
      }
      addShake(mag, durMs) {
        if (this.reducedMotion) return;
        this.shakeMag = mag;
        this.shakeDur = durMs / 1e3;
        this.shakeT = 0;
      }
      // ------------------------------------------------------------------ input
      onPointerDown(e) {
        audio.unlock();
        audio.startAmbient();
        if (this.state === "supernova" && this.supernova && !this.supernova.done) {
          const rect = this.canvas.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width * LW;
          const y = (e.clientY - rect.top) / rect.height * LH;
          this.pickStarAt(x, y);
          return;
        }
        if (this.state === "busy") this.skip();
      }
      pickStarAt(x, y) {
        const sn2 = this.supernova;
        if (!sn2 || sn2.picks.length >= 5) return;
        for (let i = 0; i < sn2.stars.length; i++) {
          const st = sn2.stars[i];
          if (st.picked) continue;
          if (Math.hypot(st.x - x, st.y - y) < 52) {
            st.picked = true;
            st.pickT = 0;
            st.ringT = 1e-3;
            sn2.picks.push(i);
            audio.pick(st.prize);
            if (!this.reducedMotion) spawnSparks(this.particles, st.x, st.y, 26, "#8b5cf6");
            const left = 5 - sn2.picks.length;
            this.cb.picksStatus(left > 0 ? this.S.picksLeft(left) : "");
            if (sn2.picks.length >= 5) void this.finishPicks();
            return;
          }
        }
      }
      async finishPicks() {
        const sn2 = this.supernova;
        if (!sn2 || sn2.done) return;
        sn2.done = true;
        await this.wait(750);
        for (const st of sn2.stars) if (!st.picked) st.dim = true;
        this.cb.picksStatus("");
        const sumX = sn2.picks.reduce((s, i) => s + sn2.prizes[i], 0);
        const gamble2 = await this.cb.gambleChoice(`\xD7${fmtX(sumX)}`);
        if (!this.reducedMotion) {
          await this.tween(350, (k) => {
            sn2.zoom = 1 - k;
          });
        } else {
          sn2.zoom = 0;
        }
        this.supernova = null;
        this.state = "busy";
        sn2.resolve({ picks: sn2.picks, gamble: gamble2 });
      }
      /**
       * Interactive supernova overlay. Resolves with the 5 picked indices and
       * the player's gamble choice.
       */
      presentSupernovaPicks(prizes) {
        return new Promise((resolve) => {
          const pos = novaStarPositions();
          const stars = pos.map((p, i) => ({
            x: p.x,
            y: p.y,
            prize: prizes[i],
            picked: false,
            revealed: false,
            dim: false,
            pickT: 0,
            ringT: 0
          }));
          this.supernova = { stars, zoom: 0, prizes, picks: [], resolve, done: false };
          this.state = "supernova";
          this.flash = 1;
          audio.supernova();
          this.cb.winBanner(2, this.S.supernova, "", "");
          if (!this.reducedMotion) {
            void this.tween(650, (k) => {
              if (this.supernova) this.supernova.zoom = k;
            });
          } else if (this.supernova) {
            this.supernova.zoom = 1;
          }
          this.cb.picksStatus(this.S.pickStars);
        });
      }
      // --------------------------------------------------------------- demo spin
      setBetIdx(i) {
        this.betIdx = Math.max(0, Math.min(BETS.length - 1, i));
        try {
          localStorage.setItem("starforge-bet", String(BETS[this.betIdx]));
        } catch {
        }
      }
      async demoSpin() {
        if (this.state !== "idle") return;
        const bet = this.bet;
        if (bet > this.balance) {
          this.cb.toast(this.S.balance + " \u2014");
          return;
        }
        this.state = "busy";
        this.skipFlag = false;
        this.cb.setBusy(true, this.S.forging);
        this.cb.clearBanner();
        this.balance -= bet;
        this.cb.setBalance(this.balanceText());
        const spin = runSpin(this.rng, this.artifacts);
        await this.animateGrid(spin);
        let picks = [];
        let gambleChoice = false;
        let gambleWon = null;
        let pickSumX = 0;
        if (spin.supernova) {
          const res2 = await this.presentSupernovaPicks(spin.supernova.prizes);
          picks = res2.picks;
          gambleChoice = res2.gamble;
          pickSumX = picks.reduce((s, i) => s + spin.supernova.prizes[i], 0);
          if (gambleChoice) {
            gambleWon = gamble(this.rng);
            if (gambleWon) {
              audio.gambleWin();
              this.cb.winBanner(1, this.S.gambleWon, `\xD7${fmtX(pickSumX * 2)}`, "");
            } else {
              audio.gambleLose();
              this.cb.winBanner(0, this.S.gambleLost, "\xD70", "");
            }
            await this.wait(1400);
            this.cb.clearBanner();
          }
        }
        const fin = finalizeSpin(spin, picks, gambleChoice, gambleWon);
        await this.presentWin(fin, bet);
        const forged = this.crucible.addEssence(fin.totalWinX);
        this.cb.crucibleChanged();
        if (forged.length > 0) {
          audio.forge();
          this.crucibleFlash = 1;
          this.addShake(9, 380);
          this.cb.forgeIgnite(forged);
          await this.wait(900);
        }
        this.balance += fin.totalWinX * bet;
        this.cb.setBalance(this.balanceText());
        this.cb.pushHistory({ bet, winX: fin.totalWinX, win: fin.totalWinX * bet, supernova: !!spin.supernova });
        this.state = "idle";
        this.cb.setBusy(false);
      }
      balanceText() {
        return this.mode === "demo" ? `${fmtInt(this.balance)} ${this.S.demo}` : fmtInt(this.balance);
      }
      refreshBalanceText() {
        this.cb.setBalance(this.balanceText());
      }
      async animateGrid(spin) {
        const S = this.S;
        const g0 = spin.grids[0];
        this.cells = g0.map((sym) => ({ sym, dy: -900, alpha: 1, scale: 1, glow: 0, shimmer: false }));
        this.gridOn = true;
        const starCells = [];
        for (let i = 0; i < CELLS; i++) if (g0[i] === SYM.STAR) starCells.push(i);
        const delayOf = (i) => {
          const col = i % COLS;
          const row = i / COLS | 0;
          return (col * ROWS + row) * 40;
        };
        starCells.sort((a, b) => delayOf(a) - delayOf(b));
        const thirdStarAt = starCells.length >= 3 ? delayOf(starCells[2]) + 300 : Infinity;
        const dropOne = async (i) => {
          const col = i % COLS;
          await this.wait(delayOf(i));
          if (this.skipFlag || this.dead) return;
          audio.drop(col);
          const c = this.cells[i];
          const dist = 900;
          await this.tween(340, (k) => {
            c.dy = -dist * (1 - k);
            c.scale = 0.7 + 0.3 * k;
          }, easeOutBack);
          c.dy = 0;
          c.scale = 1;
        };
        const drops = g0.map((_, i) => dropOne(i));
        if (thirdStarAt !== Infinity && !this.reducedMotion) {
          setTimeout(() => {
            if (this.skipFlag || this.dead || this.state !== "busy") return;
            for (let i = 0; i < CELLS; i++) {
              if (delayOf(i) > thirdStarAt) this.cells[i].shimmer = true;
            }
            setTimeout(() => {
              for (const c of this.cells) c.shimmer = false;
            }, 900);
          }, thirdStarAt);
        }
        await Promise.all(drops);
        for (const c of this.cells) {
          c.dy = 0;
          c.scale = 1;
          c.shimmer = false;
        }
        if (countStars(g0) >= 4) {
          await this.wait(250);
        }
        for (let s = 0; s < spin.steps.length; s++) {
          const step = spin.steps[s];
          if (step.payX <= 0) break;
          const winSet = new Set(step.winCells);
          const patSet = new Set(step.pattern ? step.pattern.cells : []);
          await this.tween(520, (k) => {
            const p = Math.abs(Math.sin(k * Math.PI * 2));
            for (const i of winSet) {
              const c = this.cells[i];
              c.glow = p;
              c.scale = 1 + 0.12 * p;
            }
            for (const i of patSet) {
              const c = this.cells[i];
              c.glow = Math.max(c.glow, p);
            }
          });
          for (const i of winSet) {
            this.cells[i].glow = 0;
            this.cells[i].scale = 1;
          }
          const tier = step.payX >= 50 ? 2 : step.payX >= 10 ? 1 : 0;
          this.cb.payBadge(`+${fmtX(step.payX)}\xD7`);
          audio.win(tier);
          if ((this.artifacts & ART.YUNQUE) !== 0 && step.wins.some((w) => w.tier === 2)) {
            this.addShake(6, 150);
            audio.slam();
          }
          if (!this.reducedMotion) {
            for (const i of winSet) {
              const { x, y } = this.cellCenter(i);
              spawnEmbers(this.particles, x, y, 10);
            }
            if ((this.artifacts & ART.BRASA) !== 0 && step.pattern) {
              for (const i of step.pattern.cells) {
                const { x, y } = this.cellCenter(i);
                spawnEmbers(this.particles, x, y, 14);
              }
              audio.ignite();
            }
          } else {
            audio.cascade();
          }
          await this.tween(300, (k) => {
            for (const i of winSet) {
              const c = this.cells[i];
              c.alpha = 1 - k;
              c.scale = 1 - 0.5 * k;
            }
          }, easeInCubic);
          for (const i of winSet) this.cells[i].alpha = 0;
          const next = spin.grids[s + 1];
          if (!next) break;
          if (!this.reducedMotion) audio.cascade();
          const removed = new Set(step.winCells);
          const falls = this.computeFalls(spin.grids[s], next, removed);
          for (let i = 0; i < CELLS; i++) this.cells[i].sym = next[i];
          const fallAnims = [];
          for (let col = 0; col < COLS; col++) {
            for (let row = 0; row < ROWS; row++) {
              const i = row * COLS + col;
              const dist = falls[i];
              if (dist <= 0) {
                this.cells[i].alpha = 1;
                this.cells[i].scale = 1;
                continue;
              }
              fallAnims.push(
                (async (ii, d, dl) => {
                  await this.wait(dl);
                  if (this.skipFlag || this.dead) return;
                  const c = this.cells[ii];
                  c.alpha = 1;
                  await this.tween(300, (k) => {
                    c.dy = -d * (1 - k);
                  }, easeInCubic);
                  c.dy = 0;
                  c.scale = 1;
                })(i, dist, col * 45)
              );
            }
          }
          await Promise.all(fallAnims);
          for (const c of this.cells) {
            c.dy = 0;
            c.alpha = 1;
            c.scale = 1;
            c.glow = 0;
          }
          void S;
        }
      }
      /** Per-cell fall distance (px) for a cascade refill. */
      computeFalls(oldGrid, newGrid, removed) {
        const falls = new Array(CELLS).fill(0);
        for (let col = 0; col < COLS; col++) {
          const survRows = [];
          for (let row = ROWS - 1; row >= 0; row--) {
            const i = row * COLS + col;
            if (!removed.has(i)) survRows.push(row);
          }
          for (let j = 0; j < ROWS; j++) {
            const newRow = ROWS - 1 - j;
            const i = newRow * COLS + col;
            if (j < survRows.length) {
              const oldRow = survRows[j];
              falls[i] = Math.max(0, (newRow - oldRow) * PITCH);
            } else {
              falls[i] = (newRow + 1) * PITCH + 120;
            }
            void oldGrid;
            void newGrid;
          }
        }
        return falls;
      }
      async presentWin(fin, bet) {
        const S = this.S;
        const x = fin.totalWinX;
        if (x <= 0) {
          audio.lose();
          return;
        }
        const amount = x * bet;
        const tier = x >= 50 ? 2 : x >= 10 ? 1 : 0;
        const title = tier === 2 ? S.legendary : tier === 1 ? `\xD7${fmtX(x)}` : S.lastWin;
        if (tier === 2) {
          this.flash = 0.9;
          this.addShake(7, 500);
          this.raysT = 0;
        } else if (tier === 1) {
          this.raysT = 0;
        }
        if (!this.reducedMotion) {
          for (let k = 0; k < 3; k++) {
            spawnEmbers(this.particles, LW / 2 + (Math.random() - 0.5) * 300, LH * 0.42, 24);
          }
        }
        audio.win(tier);
        const el = $("banner-amount");
        const dur = this.reducedMotion || this.skipFlag ? 60 : tier === 2 ? 2200 : tier === 1 ? 1500 : 900;
        this.cb.winBanner(tier, title, "", tier === 2 ? `\xD7${fmtX(x)}` : "");
        await this.tween(dur, (k) => {
          el.textContent = fmtInt(amount * k);
        }, easeOutCubic);
        el.textContent = fmtInt(amount);
        await this.wait(tier === 2 ? 1600 : 1100);
        this.cb.clearBanner();
      }
      // ---------------------------------------------------------- host-mode API
      /** Generic celebration when the contract settles (grid unknown client-side). */
      async hostPresentWin(totalWinX, betUnits) {
        if (this.state !== "idle" && this.state !== "hostwait") return;
        this.state = "busy";
        this.skipFlag = false;
        this.cb.setBusy(true, this.S.sessionSettling);
        this.cb.clearBanner();
        const fin = { totalWinX };
        await this.presentWin(fin, betUnits);
        this.state = "idle";
        this.cb.setBusy(false);
      }
      hostSetWaiting() {
        this.state = "hostwait";
        this.cb.setBusy(true, this.S.waitingHost);
      }
      hostSetIdle() {
        if (this.state === "hostwait") {
          this.state = "idle";
          this.cb.setBusy(false);
        }
      }
    };
  }
});

// scripts/smoke-game.mts
var gradientStub = () => ({ addColorStop: () => void 0 });
var ctxStub = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return gradientStub;
      if (prop === "measureText") return () => ({ width: 10 });
      if (prop === "getImageData") return () => ({ data: [] });
      if (typeof prop === "string") return () => void 0;
      return void 0;
    },
    set() {
      return true;
    }
  }
);
function makeEl() {
  return {
    textContent: "",
    innerHTML: "",
    className: "",
    hidden: false,
    style: {},
    classList: { add: () => void 0, remove: () => void 0, toggle: () => void 0, contains: () => false },
    addEventListener: () => void 0,
    removeEventListener: () => void 0,
    setAttribute: () => void 0,
    offsetWidth: 100,
    appendChild: () => void 0
  };
}
var els = /* @__PURE__ */ new Map();
var listeners = /* @__PURE__ */ new Map();
var canvasEl = {
  ...makeEl(),
  clientWidth: 1280,
  clientHeight: 800,
  width: 0,
  height: 0,
  getContext: () => ctxStub,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
  addEventListener: (t, f) => {
    const arr = listeners.get(t) ?? [];
    arr.push(f);
    listeners.set(t, arr);
  }
};
var g = globalThis;
g.window = {
  matchMedia: () => ({ matches: true }),
  // reduced motion => fast
  devicePixelRatio: 1,
  addEventListener: () => void 0,
  removeEventListener: () => void 0,
  AudioContext: void 0
};
g.document = {
  getElementById: (id) => {
    if (id === "cv") return canvasEl;
    let el = els.get(id);
    if (!el) {
      el = makeEl();
      els.set(id, el);
    }
    return el;
  },
  createElement: () => makeEl(),
  addEventListener: () => void 0,
  documentElement: { lang: "es" },
  activeElement: null,
  body: makeEl()
};
var store = /* @__PURE__ */ new Map();
g.localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => void store.set(k, v),
  removeItem: (k) => void store.delete(k)
};
try {
  Object.defineProperty(g, "navigator", { value: { language: "es-ES" }, configurable: true });
} catch {
}
g.requestAnimationFrame = (f) => {
  setTimeout(() => {
    try {
      f(performance.now());
    } catch (e) {
      console.error("RAF ERR", e);
    }
  }, 0);
  return 1;
};
g.cancelAnimationFrame = () => void 0;
var { Game: Game2 } = await Promise.resolve().then(() => (init_game(), game_exports));
var { ART: ART2, cryptoRng: cryptoRng2, shufflePrizes: shufflePrizes2 } = await Promise.resolve().then(() => (init_engine(), engine_exports));
var cb = {
  setBusy: () => void 0,
  setBalance: () => void 0,
  pushHistory: () => void 0,
  forgeIgnite: () => void 0,
  payBadge: () => void 0,
  winBanner: () => void 0,
  clearBanner: () => void 0,
  picksStatus: () => void 0,
  gambleChoice: async () => true,
  // always gamble in the test
  toast: () => void 0,
  crucibleChanged: () => void 0,
  canAfford: () => true
};
var game = new Game2(canvasEl, cb, "es");
game.start();
function clickCanvas(x, y) {
  const arr = listeners.get("pointerdown") ?? [];
  for (const f of arr) f({ clientX: x, clientY: y });
}
var spins = 0;
var t0 = Date.now();
for (let i = 0; i < 60; i++) {
  spins++;
  await game.demoSpin();
}
console.log(`ran ${spins} base spins in ${Date.now() - t0}ms, no exceptions`);
var g2 = game;
var p2 = g2.presentSupernovaPicks([10, 20, 40, 80, 160, 320, 640, 1280, 2500, 5e3, 1e4, 2e4]);
await new Promise((r) => setTimeout(r, 10));
var sn = g2.supernova;
if (!sn || sn.stars.length !== 12) throw new Error("supernova overlay missing");
clickCanvas(sn.stars[0].x, sn.stars[0].y);
clickCanvas(sn.stars[0].x, sn.stars[0].y);
for (const st of sn.stars.slice(1, 5)) clickCanvas(st.x, st.y);
await new Promise((r) => setTimeout(r, 10));
var res = await p2;
console.log(`supernova resolved: picks=[${res.picks}] gamble=${res.gamble}`);
if (res.picks.length !== 5) throw new Error("expected 5 picks");
cb.gambleChoice = async () => false;
var p3 = g2.presentSupernovaPicks([10, 20, 40, 80, 160, 320, 640, 1280, 2500, 5e3, 1e4, 2e4]);
await new Promise((r) => setTimeout(r, 10));
var sn3 = g2.supernova;
for (const st of sn3.stars.slice(0, 5)) clickCanvas(st.x, st.y);
var res3 = await p3;
console.log(`supernova (decline gamble): picks=[${res3.picks}] gamble=${res3.gamble}`);
var basePool = shufflePrizes2(cryptoRng2(), 0).sort((a, b) => a - b);
var templePool = shufflePrizes2(cryptoRng2(), ART2.TEMPLE).sort((a, b) => a - b);
console.log("base pool sorted  :", basePool.map((p) => p.toFixed(1)).join(","));
console.log("temple pool sorted:", templePool.map((p) => p.toFixed(1)).join(","));
for (let i = 0; i < 12; i++) {
  if (Math.abs(templePool[i] - basePool[i] * 1.1) > 1e-9) throw new Error("temple prize boost wrong");
}
game.hostPresentWin(250, 10);
console.log(`after hostPresentWin: balance=${game.balance.toFixed(1)} essence=${game.crucible.state.essence.toFixed(1)} forged=[${game.crucible.state.forged}]`);
game.destroy();
console.log("GAME SMOKE OK");
