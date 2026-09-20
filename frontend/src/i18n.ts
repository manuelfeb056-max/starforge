/** Minimal ES/EN strings. Locale from host snapshot, else browser. */

export type Locale = 'es' | 'en';

export function detectLocale(hostLocale?: string): Locale {
  const src = (hostLocale ?? navigator.language ?? 'en').toLowerCase();
  return src.startsWith('es') ? 'es' : 'en';
}

export interface Strings {
  tagline: string;
  balance: string;
  demo: string;
  bet: string;
  forge: string;
  forging: string;
  maxBetNote: string;
  lastWin: string;
  history: string;
  noWins: string;
  crucible: string;
  essence: string;
  nextArtifact: string;
  allForged: string;
  legendary: string;
  supernova: string;
  pickStars: string;
  picksLeft: (n: number) => string;
  collect: string;
  doubleOrNothing: string;
  gamblePrompt: (x: string) => string;
  gambleWon: string;
  gambleLost: string;
  waitingHost: string;
  sessionSettling: string;
  newRound: string;
  soundOn: string;
  soundOff: string;
  infoTitle: string;
  rtpLine: string;
  resetProgress: string;
  resetDone: string;
  close: string;
  artifactBrasa: string;
  artifactYunque: string;
  artifactTemple: string;
  artifactBrasaDesc: string;
  artifactYunqueDesc: string;
  artifactTempleDesc: string;
  forged: string;
  winX: (x: string) => string;
  credits: string;
  cancelled: string;
  forfeited: string;
  connectFail: string;
  clickToSkip: string;
  welcomePlay: string;
  welcomeNote: string;
  welcomeRtp: string;
  rtpTitle: string;
}

const es: Strings = {
  tagline: 'La Forja Estelar',
  balance: 'Saldo',
  demo: 'DEMO',
  bet: 'Apuesta',
  forge: 'FORJAR',
  forging: 'FORJANDO…',
  maxBetNote: 'Apuesta máxima limitada por la bóveda',
  lastWin: 'Última victoria',
  history: 'Historial',
  noWins: 'Sin victorias aún — la forja espera.',
  crucible: 'Crisol',
  essence: 'Esencia',
  nextArtifact: 'Siguiente artefacto',
  allForged: 'Forja completa',
  legendary: 'FORJA LEGENDARIA',
  supernova: '¡SUPERNOVA!',
  pickStars: 'Elige 5 estrellas',
  picksLeft: (n: number) => `Elige ${n} más`,
  collect: 'RECOGER',
  doubleOrNothing: 'DOBLE O NADA',
  gamblePrompt: (x: string) => `¿Apostar ${x}? 50/50: doble o nada.`,
  gambleWon: '¡DOBLADO!',
  gambleLost: 'La forja reclama su parte',
  waitingHost: 'Esperando a la red…',
  sessionSettling: 'Revelando resultado…',
  newRound: 'Ronda lista',
  soundOn: 'Sonido activado',
  soundOff: 'Sonido silenciado',
  infoTitle: 'Cómo jugar',
  rtpLine: 'RTP 96.0% (estable) / ≥93% sin artefactos. La demo usa la misma matemática que el contrato on-chain.',
  resetProgress: 'Reiniciar progresión',
  resetDone: 'Progresión reiniciada',
  close: 'Cerrar',
  artifactBrasa: 'Brasa',
  artifactYunque: 'Yunque',
  artifactTemple: 'Temple',
  artifactBrasaDesc: 'Constelaciones ×1.25',
  artifactYunqueDesc: 'Scatter 12+ ×1.05',
  artifactTempleDesc: 'Supernova: premios ×1.10',
  forged: '¡Forjado!',
  winX: (x: string) => `${x}×`,
  credits: 'créditos',
  cancelled: 'Ronda cancelada',
  forfeited: 'Ronda expirada',
  connectFail: 'Sin anfitrión — modo demo',
  clickToSkip: 'clic para saltar',
  welcomePlay: 'ENTRAR A LA FORJA',
  welcomeNote: 'Tragamonedas 6×5 de forja cósmica. Forja minerales, desata la supernova, doble o nada.',
  welcomeRtp: 'RTP 96.0% · Matemática verificable on-chain',
  rtpTitle: 'Retorno teórico al jugador: 96.0% estable / ≥93% sin artefactos',
};

const en: Strings = {
  tagline: 'The Star Forge',
  balance: 'Balance',
  demo: 'DEMO',
  bet: 'Bet',
  forge: 'FORGE',
  forging: 'FORGING…',
  maxBetNote: 'Max bet limited by the vault',
  lastWin: 'Last win',
  history: 'History',
  noWins: 'No wins yet — the forge awaits.',
  crucible: 'Crucible',
  essence: 'Essence',
  nextArtifact: 'Next artifact',
  allForged: 'Forge complete',
  legendary: 'LEGENDARY FORGE',
  supernova: 'SUPERNOVA!',
  pickStars: 'Pick 5 stars',
  picksLeft: (n: number) => `Pick ${n} more`,
  collect: 'COLLECT',
  doubleOrNothing: 'DOUBLE OR NOTHING',
  gamblePrompt: (x: string) => `Gamble ${x}? 50/50: double or nothing.`,
  gambleWon: 'DOUBLED!',
  gambleLost: 'The forge claims its share',
  waitingHost: 'Waiting for the network…',
  sessionSettling: 'Revealing outcome…',
  newRound: 'Round ready',
  soundOn: 'Sound on',
  soundOff: 'Sound muted',
  infoTitle: 'How to play',
  rtpLine: 'RTP 96.0% (steady) / ≥93% fresh. The demo uses the same math as the on-chain contract.',
  resetProgress: 'Reset progression',
  resetDone: 'Progression reset',
  close: 'Close',
  artifactBrasa: 'Ember',
  artifactYunque: 'Anvil',
  artifactTemple: 'Temper',
  artifactBrasaDesc: 'Constellation pays ×1.25',
  artifactYunqueDesc: 'Tier-3 (12+) scatter ×1.05',
  artifactTempleDesc: 'Supernova prizes ×1.10',
  forged: 'Forged!',
  winX: (x: string) => `${x}×`,
  credits: 'credits',
  cancelled: 'Round cancelled',
  forfeited: 'Round expired',
  connectFail: 'No host — demo mode',
  clickToSkip: 'click to skip',
  welcomePlay: 'ENTER THE FORGE',
  welcomeNote: 'Scatter-pay 6×5 cosmic-forge slot. Forge minerals, trigger the supernova, double or nothing.',
  welcomeRtp: 'RTP 96.0% · On-chain verifiable math',
  rtpTitle: 'Theoretical return to player: 96.0% steady / ≥93% fresh',
};

export const STR: Record<Locale, Strings> = { es, en };
