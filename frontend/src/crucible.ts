/**
 * STARFORGE crucible — play-session progression (localStorage).
 * Essence += totalWinX per spin; crossing thresholds forges PERMANENT
 * artifacts for the session. Bitmask doubles as the contract `gameData` byte.
 */
import { ART } from './engine';

const KEY = 'starforge-crucible-v1';

/** Thresholds in xbet essence: brasa 25, yunque 75, temple 150. */
export const THRESHOLDS = [
  { bit: ART.BRASA, key: 'brasa', threshold: 25 },
  { bit: ART.YUNQUE, key: 'yunque', threshold: 75 },
  { bit: ART.TEMPLE, key: 'temple', threshold: 150 },
] as const;

export type ArtifactKey = (typeof THRESHOLDS)[number]['key'];

export interface CrucibleState {
  essence: number;
  forged: [boolean, boolean, boolean]; // brasa, yunque, temple (threshold order)
}

const fresh = (): CrucibleState => ({ essence: 0, forged: [false, false, false] });

export class Crucible {
  state: CrucibleState = fresh();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CrucibleState>;
      if (typeof parsed.essence === 'number') this.state.essence = Math.max(0, parsed.essence);
      if (Array.isArray(parsed.forged) && parsed.forged.length === 3) {
        this.state.forged = [!!parsed.forged[0], !!parsed.forged[1], !!parsed.forged[2]];
      }
    } catch {
      this.state = fresh();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
  }

  /** Bitmask for gameData byte AND the demo engine. */
  get bitmask(): number {
    let m = 0;
    THRESHOLDS.forEach((t, i) => {
      if (this.state.forged[i]) m |= t.bit;
    });
    return m;
  }

  forgedKeys(): ArtifactKey[] {
    const out: ArtifactKey[] = [];
    THRESHOLDS.forEach((t, i) => {
      if (this.state.forged[i]) out.push(t.key);
    });
    return out;
  }

  /** Next unforged threshold, or null when all forged. */
  nextThreshold(): { key: ArtifactKey; threshold: number } | null {
    for (let i = 0; i < THRESHOLDS.length; i++) {
      if (!this.state.forged[i]) {
        const t = THRESHOLDS[i]!;
        return { key: t.key, threshold: t.threshold };
      }
    }
    return null;
  }

  /** Progress 0..1 toward the next artifact (1 when all forged). */
  progress(): number {
    const next = this.nextThreshold();
    if (!next) return 1;
    const prev = this.prevThresholdValue(next.key);
    return Math.min(1, Math.max(0, (this.state.essence - prev) / (next.threshold - prev)));
  }

  private prevThresholdValue(key: ArtifactKey): number {
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
  addEssence(x: number): ArtifactKey[] {
    const forged: ArtifactKey[] = [];
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

  reset(): void {
    this.state = fresh();
    this.save();
  }
}
