/**
 * STARFORGE bootstrap — DOM chrome, demo/host race, info panel.
 * Demo mode (no host within 1500ms) is the judged experience.
 */
import './style.css';
import { Game, BETS, type GameCallbacks, type WinEntry } from './game';
import { connectWithTimeout, HostDriver, type HostUI } from './host';
import { audio } from './audio';
import { STR, detectLocale, type Locale } from './i18n';
import { MINERAL_COLORS } from './render';
import type { ArtifactKey } from './crucible';
import { PATTERNS } from './engine';
import type { HostSnapshotV1 } from './sdk/guest';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

let locale: Locale = detectLocale();
const S = (): (typeof STR)[Locale] => STR[locale];

const fmtInt = (n: number): string => Math.floor(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------
// info panel content
// ---------------------------------------------------------------------------

const PAYTABLE_ROWS: Array<[number, number[]]> = [
  [0, [0.2, 0.5, 2]],
  [1, [0.3, 0.8, 3]],
  [2, [0.5, 1.0, 4]],
  [3, [0.8, 1.5, 6]],
  [4, [1.0, 2.5, 10]],
  [5, [2.0, 5.0, 20]],
  [6, [5.0, 12.0, 50]],
];
const MINERAL_LABEL: Record<Locale, string[]> = {
  es: ['Cobre', 'Hierro', 'Níquel', 'Plata', 'Oro', 'Platino', 'Neutronio'],
  en: ['Copper', 'Iron', 'Nickel', 'Silver', 'Gold', 'Platinum', 'Neutronium'],
};

function patternSVG(cells: number[]): string {
  const cw = 15;
  let rects = '';
  const hit = new Set(cells);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      const i = row * 6 + col;
      const on = hit.has(i);
      rects += `<rect x="${col * (cw + 2)}" y="${row * (cw + 2)}" width="${cw}" height="${cw}" rx="3" fill="${on ? '#ff6b1a' : 'rgba(138,135,163,0.18)'}" ${on ? 'filter="url(#pglow)"' : ''}/>`;
    }
  }
  return `<svg viewBox="0 0 ${6 * (cw + 2)} ${5 * (cw + 2)}"><defs><filter id="pglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${rects}</svg>`;
}

function infoHTML(): string {
  const L = locale;
  const labels = MINERAL_LABEL[L];
  const payRows = PAYTABLE_ROWS.map(
    ([m, tiers]) =>
      `<tr><td><span class="symdot" style="background:${MINERAL_COLORS[m]}"></span>${labels[m]}</td><td>×${tiers[0]}</td><td>×${tiers[1]}</td><td>×${tiers[2]}</td></tr>`,
  ).join('');
  const patCards = PATTERNS.map(
    p =>
      `<div class="pattern-card">${patternSVG(p.cells)}<div class="pname">${p.name}</div><div class="ppay">×${p.payX}</div></div>`,
  ).join('');
  const artRows = [
    ['brasa', 25, L === 'es' ? 'Constelaciones pagan ×1.25' : 'Constellation pays ×1.25'],
    ['yunque', 75, L === 'es' ? 'Scatter 12+ ×1.05' : 'Tier-3 (12+) scatter ×1.05'],
    ['temple', 150, L === 'es' ? 'Supernova: premios ×1.10' : 'Supernova prizes ×1.10'],
  ]
    .map(([k, th, d]) => `<li><b style="color:var(--ember)">${k}</b> — ${d} <span class="muted">(${th} ${L === 'es' ? 'esencia' : 'essence'})</span></li>`)
    .join('');

  if (L === 'es') {
    return `
      <h3>PAGOS SCATTER</h3>
      <p>8 o más del mismo mineral <b>en cualquier posición</b> de la parrilla 6×5 pagan. Niveles por cantidad: <b>8–9 / 10–11 / 12+</b>. Varios minerales pueden pagar en el mismo paso; las victorias se suman. La estrella (scatter) nunca paga scatter.</p>
      <table class="paytable"><tr><th>Mineral</th><th>8–9</th><th>10–11</th><th>12+</th></tr>${payRows}</table>
      <h3>CONSTELACIONES</h3>
      <p>Tras cada evaluación scatter se comprueban estas formaciones fijas. Si las 5 celdas tienen el <b>mismo mineral</b> (la estrella lo invalida), paga el bono. Solo la constelación de mayor valor paga por paso.</p>
      <div class="patterns-grid">${patCards}</div>
      <h3>SUPERNOVA</h3>
      <p><b>4+ estrellas en la caída inicial</b> abren la supernova: 12 estrellas ocultan premios de ×1 a ×6 (suman 36; <b>×1.10</b> con Temple forjado). Eliges <b>5</b>. Después puedes <b>recoger</b> o jugarte la suma a <b>doble o nada</b> (50/50 justo: ×2 o ×0).</p>
      <h3>ARTEFACTOS DEL CRISOL</h3>
      <p>Cada giro suma su victoria total (en ×apuesta) como esencia. Al cruzar un umbral forjas un artefacto <b>permanente</b> de la sesión:</p>
      <ul>${artRows}</ul>
      <h3>JUEGO JUSTO</h3>
      <p class="muted">${STR.es.rtpLine}</p>
      <p class="muted">Resultados verificables on-chain (VRF). Pago máximo por giro: 1000× la apuesta.</p>`;
  }
  return `
      <h3>SCATTER PAYS</h3>
      <p>8 or more of the same mineral <b>anywhere</b> on the 6×5 grid pay. Count tiers: <b>8–9 / 10–11 / 12+</b>. Multiple minerals can pay on the same step; wins add up. The star (scatter) never pays scatter.</p>
      <table class="paytable"><tr><th>Mineral</th><th>8–9</th><th>10–11</th><th>12+</th></tr>${payRows}</table>
      <h3>CONSTELLATIONS</h3>
      <p>After each scatter evaluation these fixed formations are checked. If all 5 cells hold the <b>same mineral</b> (a star voids it), the bonus pays. Only the highest-value constellation pays per step.</p>
      <div class="patterns-grid">${patCards}</div>
      <h3>SUPERNOVA</h3>
      <p><b>4+ stars on the initial drop</b> open the supernova: 12 stars hide prizes from ×1 to ×6 (sum 36; <b>×1.10</b> with Temper forged). You pick <b>5</b>. Then <b>collect</b> or risk the sum <b>double or nothing</b> (fair 50/50: ×2 or ×0).</p>
      <h3>CRUCIBLE ARTIFACTS</h3>
      <p>Every spin adds its total win (in ×bet) as essence. Crossing a threshold forges a <b>permanent</b> session artifact:</p>
      <ul>${artRows}</ul>
      <h3>FAIR PLAY</h3>
      <p class="muted">${STR.en.rtpLine}</p>
      <p class="muted">On-chain verifiable outcomes (VRF). Max payout per spin: 1000× bet.</p>`;
}

// ---------------------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const canvas = $('cv') as HTMLCanvasElement;
  let busy = false;
  let hostReady = false;
  let isHost = false;
  let maxBetUnits: number | null = null;
  let driver: HostDriver | null = null;

  const history: WinEntry[] = [];

  const updateForgeButton = (): void => {
    const btn = $('btn-forge') as HTMLButtonElement;
    const cantAfford = !isHost && game.bet > game.balance;
    btn.disabled = busy || (isHost && !hostReady) || cantAfford || game.state !== 'idle';
    ($('bet-minus') as HTMLButtonElement).disabled = busy || game.state !== 'idle';
    ($('bet-plus') as HTMLButtonElement).disabled = busy || game.state !== 'idle';
  };

  const setBetLabel = (): void => {
    $('bet-val').textContent = String(game.bet);
  };

  const refreshCrucible = (): void => {
    $('essence-val').textContent = (Math.round(game.crucible.state.essence * 10) / 10).toString();
    const next = game.crucible.nextThreshold();
    $('next-artifact').textContent = next
      ? `${S().nextArtifact}: ${next.key} (${next.threshold})`
      : S().allForged;
    document.querySelectorAll('.artifact-slot').forEach(el => {
      const key = (el as HTMLElement).dataset.key as ArtifactKey;
      el.classList.toggle('forged', game.crucible.forgedKeys().includes(key));
    });
  };

  let toastTimer = 0;
  const callbacks: GameCallbacks = {
    setBusy(b, label) {
      busy = b;
      const btn = $('btn-forge') as HTMLButtonElement;
      btn.textContent = b ? label ?? S().forging : S().forge;
      updateForgeButton();
      driver?.reportSize();
    },
    setBalance(text) {
      $('balance-val').textContent = text;
    },
    pushHistory(e) {
      history.unshift(e);
      if (history.length > 8) history.pop();
      $('last-win-val').textContent = e.winX > 0 ? `+${fmtInt(e.win)}` : '—';
      $('history-empty').style.display = 'none';
      const ul = $('history-list');
      ul.innerHTML = '';
      for (const h of history) {
        const li = document.createElement('li');
        if (h.supernova) li.classList.add('sn');
        li.innerHTML = `<span class="hx">×${h.winX < 10 ? h.winX.toFixed(2) : Math.round(h.winX * 10) / 10}</span><span>bet ${h.bet}</span><span class="hw">+${fmtInt(h.win)}</span>`;
        ul.appendChild(li);
      }
      driver?.reportSize();
    },
    forgeIgnite(keys) {
      for (const k of keys) {
        const el = document.querySelector(`.artifact-slot[data-key="${k}"]`);
        el?.classList.add('forged', 'ignite');
        setTimeout(() => el?.classList.remove('ignite'), 1000);
      }
      refreshCrucible();
      callbacks.toast(keys.map(k => `${k}: ${S().forged}`).join(' · '));
    },
    payBadge(text) {
      const el = $('paybadge');
      el.textContent = text;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    },
    winBanner(tier, title, amountText, sub) {
      const b = $('banner');
      b.className = `show tier${tier}`;
      $('banner-title').textContent = title;
      $('banner-amount').textContent = amountText;
      $('banner-sub').textContent = sub;
      driver?.reportSize();
    },
    clearBanner() {
      $('banner').className = '';
    },
    picksStatus(text) {
      $('picks-status').textContent = text;
    },
    gambleChoice(amountText) {
      return new Promise<boolean>(resolve => {
        $('gamble-amount').textContent = amountText;
        $('gamble-overlay').classList.add('show');
        const done = (v: boolean) => {
          audio.button();
          $('gamble-overlay').classList.remove('show');
          resolve(v);
        };
        ($('btn-collect') as HTMLButtonElement).onclick = () => done(false);
        ($('btn-double') as HTMLButtonElement).onclick = () => done(true);
      });
    },
    toast(msg) {
      const el = $('toast');
      el.textContent = msg;
      el.classList.add('show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => el.classList.remove('show'), 2400);
    },
    crucibleChanged() {
      refreshCrucible();
    },
    canAfford() {
      return game.bet <= game.balance;
    },
  };

  const game = new Game(canvas, callbacks, locale);
  (window as unknown as { __starforge?: Game }).__starforge = game;

  const applyLocale = (l: Locale): void => {
    locale = l;
    game.locale = l;
    document.documentElement.lang = l;
    const t = STR[l];
    $('tagline').textContent = t.tagline.toUpperCase();
    $('balance-label').textContent = t.balance;
    $('crucible-title').textContent = t.crucible.toUpperCase();
    $('essence-label').textContent = t.essence;
    $('lastwin-label').textContent = t.lastWin.toUpperCase();
    $('history-label').textContent = t.history.toUpperCase();
    $('history-empty').textContent = t.noWins;
    $('bet-label').textContent = t.bet.toUpperCase();
    if (!busy) ($('btn-forge') as HTMLButtonElement).textContent = t.forge;
    $('btn-collect').textContent = t.collect;
    $('btn-double').textContent = t.doubleOrNothing;
    $('gamble-title').textContent = t.doubleOrNothing;
    $('info-title').textContent = t.infoTitle;
    $('btn-reset-progress').textContent = t.resetProgress;
    $('lang-toggle').textContent = l === 'es' ? 'EN' : 'ES';
    $('art-name-brasa').textContent = t.artifactBrasa;
    $('art-desc-brasa').textContent = t.artifactBrasaDesc;
    $('art-name-yunque').textContent = t.artifactYunque;
    $('art-desc-yunque').textContent = t.artifactYunqueDesc;
    $('art-name-temple').textContent = t.artifactTemple;
    $('art-desc-temple').textContent = t.artifactTempleDesc;
    $('maxbet-note').textContent = t.maxBetNote;
    $('info-body').innerHTML = infoHTML();
    refreshCrucible();
  };

  // ---- controls
  $('bet-minus').addEventListener('click', () => {
    audio.unlock();
    audio.button();
    game.setBetIdx(game.betIdx - 1);
    setBetLabel();
    updateForgeButton();
  });
  $('bet-plus').addEventListener('click', () => {
    audio.unlock();
    audio.button();
    let next = game.betIdx + 1;
    if (maxBetUnits !== null) {
      while (next < BETS.length - 1 && BETS[next]! > maxBetUnits) next--;
      if (BETS[next]! > maxBetUnits) next = game.betIdx;
    }
    game.setBetIdx(next);
    setBetLabel();
    updateForgeButton();
  });
  $('btn-forge').addEventListener('click', () => {
    audio.unlock();
    audio.startAmbient();
    audio.button();
    if (isHost && driver) void driver.spin(game.bet);
    else void game.demoSpin();
  });

  const soundBtn = $('btn-sound') as HTMLButtonElement;
  const paintSound = (): void => {
    soundBtn.textContent = audio.muted ? '🔇' : '🔊';
    soundBtn.setAttribute('aria-label', audio.muted ? S().soundOff : S().soundOn);
  };
  soundBtn.addEventListener('click', () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
    paintSound();
    audio.button();
  });
  paintSound();

  $('btn-info').addEventListener('click', () => {
    audio.button();
    $('info-body').innerHTML = infoHTML();
    $('info-modal').classList.add('show');
    driver?.reportSize();
  });
  $('info-close').addEventListener('click', () => {
    audio.button();
    $('info-modal').classList.remove('show');
    driver?.reportSize();
  });
  $('info-modal').addEventListener('click', e => {
    if (e.target === $('info-modal')) $('info-modal').classList.remove('show');
  });
  $('btn-reset-progress').addEventListener('click', () => {
    audio.button();
    game.crucible.reset();
    refreshCrucible();
    callbacks.toast(S().resetDone);
  });
  $('lang-toggle').addEventListener('click', () => {
    audio.button();
    applyLocale(locale === 'es' ? 'en' : 'es');
  });
  document.addEventListener('pointerdown', () => {
    audio.unlock();
    audio.startAmbient();
  }, { once: true });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // info modal only — the gamble overlay must resolve via a choice
      $('info-modal').classList.remove('show');
    }
    if ((e.key === ' ' || e.key === 'Enter') && document.activeElement === document.body) {
      ($('btn-forge') as HTMLButtonElement).click();
    }
  });

  // ---- boot
  applyLocale(locale);
  setBetLabel();
  refreshCrucible();
  game.refreshBalanceText();
  game.start();
  updateForgeButton();

  // ---- demo/host race
  const hostUI: HostUI = {
    setBalance: text => callbacks.setBalance(text),
    setBusy: (b, label) => callbacks.setBusy(b, label),
    toast: msg => {
      const key = msg as 'forfeited' | 'cancelled';
      callbacks.toast(key === 'forfeited' ? S().forfeited : key === 'cancelled' ? S().cancelled : msg);
    },
    setMaxBetNote: visible => $('maxbet-note').classList.toggle('show', visible),
    applyBetClamp(maxUnits) {
      maxBetUnits = maxUnits;
      if (maxUnits !== null) {
        let i = game.betIdx;
        while (i > 0 && BETS[i]! > maxUnits) i--;
        if (BETS[i]! > maxUnits) i = 0;
        game.setBetIdx(i);
        setBetLabel();
      }
      updateForgeButton();
    },
    setLocale(l) {
      if (l !== locale) applyLocale(l);
    },
    reportSize() {
      driver?.reportSize();
    },
  };

  let snapHolder: { snap: HostSnapshotV1 | null } = { snap: null };
  const onSnapshot = (snap: HostSnapshotV1 | null): void => {
    snapHolder.snap = snap;
    if (isHost && driver && snap) {
      const was = hostReady;
      hostReady = snap.wallet?.status === 'ready';
      if (was !== hostReady) updateForgeButton();
      driver.onSnapshot(snap);
    }
  };

  const link = await connectWithTimeout(onSnapshot);
  if (link) {
    // host mode
    isHost = true;
    game.mode = 'host';
    ($('demo-badge') as HTMLElement).hidden = true;
    driver = new HostDriver(link, game, hostUI);
    hostReady = snapHolder.snap?.wallet?.status === 'ready';
    if (snapHolder.snap) driver.onSnapshot(snapHolder.snap);
    updateForgeButton();
  } else {
    // standalone demo — the judged experience
    game.mode = 'demo';
    ($('demo-badge') as HTMLElement).hidden = false;
    game.refreshBalanceText();
    updateForgeButton();
  }
}

void main().catch(err => {
  console.error('[starforge] boot failed', err);
  document.body.innerHTML = `<pre style="color:#e8e6f0;padding:2rem">STARFORGE failed to start: ${err instanceof Error ? err.message : err}</pre>`;
});
