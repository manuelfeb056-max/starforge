/**
 * STARFORGE host bridge — connects the game to the casino host via the
 * vendored SDK (penpal). Snapshot-driven: derive, never accumulate.
 */
import {
  computeMaxWager,
  connectGameToHost,
  observeGameContentSize,
  SessionPhase,
  type ContentSizeObserver,
  type GuestBridgeConnection,
  type HostApiV1,
  type HostSnapshotV1,
} from './sdk/guest';
import { decodeGameState, encodeActionData, encodeGameData, encodeWager, formatWad } from './abi';
import { detectLocale, type Locale } from './i18n';
import { BETS, type Game } from './game';

export interface HostUI {
  setBalance(text: string): void;
  setBusy(busy: boolean, label?: string): void;
  toast(msg: string): void;
  setMaxBetNote(visible: boolean): void;
  applyBetClamp(maxUnits: number | null): void;
  setLocale(locale: Locale): void;
  reportSize(): void;
}

const CONNECT_TIMEOUT_MS = 1500;

export interface HostLink {
  conn: GuestBridgeConnection;
  hostApi: HostApiV1;
}

/** Race connectGameToHost against a 1500ms timeout. Null => demo mode. */
export async function connectWithTimeout(
  onSnapshot: (snap: HostSnapshotV1 | null) => void,
): Promise<HostLink | null> {
  let conn: GuestBridgeConnection;
  try {
    conn = connectGameToHost({ setState: async snap => onSnapshot(snap) });
  } catch {
    return null;
  }
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), CONNECT_TIMEOUT_MS));
  const hostApi = await Promise.race([conn.promise, timeout]);
  if (!hostApi) {
    try {
      conn.destroy();
    } catch {
      /* ignore */
    }
    return null;
  }
  return { conn, hostApi };
}

type SessionTrack = {
  sessionKey: string;
  sessionId: string;
  betUnits: number;
  picksSubmitted: boolean;
};

/**
 * Drives host-mode play from snapshots. The game renders; this class owns
 * the session lifecycle (open -> action -> settle -> reveal).
 */
export class HostDriver {
  private link: HostLink;
  private game: Game;
  private ui: HostUI;
  private snapshot: HostSnapshotV1 | null = null;
  private track: SessionTrack | null = null;
  private sizeObserver: ContentSizeObserver | null = null;
  private recovering = false;

  constructor(link: HostLink, game: Game, ui: HostUI) {
    this.link = link;
    this.game = game;
    this.ui = ui;
    this.sizeObserver = observeGameContentSize(link.hostApi);
  }

  get decimals(): number {
    return this.snapshot?.token?.decimals ?? 18;
  }

  get ready(): boolean {
    return this.snapshot?.wallet?.status === 'ready';
  }

  reportSize(): void {
    this.sizeObserver?.report();
  }

  onSnapshot(snap: HostSnapshotV1 | null): void {
    this.snapshot = snap;
    if (!snap) return;
    const locale = detectLocale(snap.ui?.locale);
    this.ui.setLocale(locale);

    // balance (read-only display)
    const bal = snap.balances?.smartVaultBalance;
    this.ui.setBalance(formatWad(bal, snap.token?.decimals, snap.token?.symbol));

    // max-bet clamp
    const maxWager = computeMaxWager(snap, { maxMultiplierX: 1000 });
    if (maxWager.kind === 'limit') {
      const maxUnits = Number(maxWager.maxWager / 10n ** BigInt(this.decimals));
      this.ui.applyBetClamp(maxUnits);
      this.ui.setMaxBetNote(true);
    } else {
      this.ui.applyBetClamp(null);
      this.ui.setMaxBetNote(maxWager.kind === 'unknown');
    }

    // refresh-mid-round recovery: adopt a live session for our game
    if (!this.track && !this.recovering) {
      const live = (snap.sessions?.items ?? []).find(
        it =>
          it.gameAddress?.toLowerCase() === snap.integration?.gameAddress?.toLowerCase() &&
          it.phaseName !== undefined &&
          !([SessionPhase.SETTLED, SessionPhase.FORFEITED, SessionPhase.CANCELLED] as number[]).includes(
            it.phase as number,
          ),
      );
      if (live) {
        this.recovering = true;
        this.track = { sessionKey: live.sessionKey, sessionId: live.sessionId, betUnits: 0, picksSubmitted: false };
        void this.driveSession(live.sessionId);
      }
    }

    // drive the tracked session
    if (this.track) {
      const item = (snap.sessions?.items ?? []).find(i => i.sessionKey === this.track!.sessionKey);
      if (item) void this.driveSession(item.sessionId, item);
    }
    this.ui.reportSize();
  }

  /** FORJAR in host mode. */
  async spin(betUnits: number): Promise<void> {
    if (this.track || !this.ready) return;
    const wager = encodeWager(betUnits, this.decimals);
    const gameData = encodeGameData(this.game.artifacts);
    this.game.hostSetWaiting();
    try {
      const { sessionKey } = await this.link.hostApi.openSession({ wager, gameData });
      this.track = { sessionKey, sessionId: '', betUnits, picksSubmitted: false };
    } catch (err) {
      this.game.hostSetIdle();
      this.ui.toast(err instanceof Error ? err.message : 'openSession failed');
    }
  }

  private findItem(sessionId: string): HostSnapshotV1['sessions']['items'][number] | undefined {
    return (this.snapshot?.sessions?.items ?? []).find(i => i.sessionId === sessionId);
  }

  private async driveSession(sessionId: string, known?: HostSnapshotV1['sessions']['items'][number]): Promise<void> {
    const t = this.track;
    if (!t) return;
    const item = known ?? this.findItem(sessionId);
    if (!item) return;
    if (!t.sessionId) t.sessionId = item.sessionId;

    const phase = item.phaseName;
    if (phase === 'WAITING_PLAYER_ACTION' && !t.picksSubmitted) {
      // Bonus stage (stage=1): the on-chain contract still runs its legacy
      // pick mechanic. The interactive pick UI was retired with the Nova
      // Furnace rebuild (the furnace is the demo experience), so host mode
      // auto-submits 5 random picks and collects to let the session settle.
      let decoded;
      try {
        if (!item.raw?.gameState) return;
        decoded = decodeGameState(item.raw.gameState);
      } catch {
        return;
      }
      if (decoded.stage !== 1) return;
      t.picksSubmitted = true; // claim synchronously to avoid double-submit
      try {
        const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
        }
        const actionData = encodeActionData(pool.slice(0, 5), 0);
        await this.link.hostApi.submitAction({ sessionId: item.sessionId, actionData });
      } catch (err) {
        t.picksSubmitted = false;
        this.ui.toast(err instanceof Error ? err.message : 'submitAction failed');
      }
      return;
    }

    if (phase === 'SETTLED') {
      const done = t;
      this.track = null;
      this.recovering = false;
      try {
        if (item.raw?.gameState) {
          const decoded = decodeGameState(item.raw.gameState);
          const dec = this.decimals;
          const gridX = Number(decoded.gridWinWad) / 10 ** dec;
          const picksX = Number(decoded.picksSumWad) / 10 ** dec;
          const betUnits = done.betUnits || 1;
          const totalWinX = (gridX + picksX) / betUnits;
          await this.game.hostPresentWin(Math.max(0, totalWinX), betUnits);
        }
      } catch (err) {
        this.ui.toast(err instanceof Error ? err.message : 'settle decode failed');
      } finally {
        try {
          await this.link.hostApi.revealOutcome({ sessionId: item.sessionId });
        } catch {
          /* ignore */
        }
        this.game.hostSetIdle();
      }
      return;
    }

    if (phase === 'FORFEITED' || phase === 'CANCELLED') {
      this.track = null;
      this.recovering = false;
      this.game.hostSetIdle();
      this.ui.toast(phase === 'FORFEITED' ? 'forfeited' : 'cancelled');
    }
  }

  get betOptions(): number[] {
    return BETS;
  }
}
