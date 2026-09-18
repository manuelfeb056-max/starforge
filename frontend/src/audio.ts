/**
 * STARFORGE audio — 100% synthesized WebAudio, no files.
 * Master gain + persisted mute. All sounds are oscillator/noise based.
 */

type OscType = OscillatorType;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientNodes: OscillatorNode[] = [];
  private ambientStarted = false;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('starforge-muted') === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Must be called from a user gesture at least once. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem('starforge-muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(opts: {
    freq: number;
    freqEnd?: number;
    type?: OscType;
    peak?: number;
    attack?: number;
    decay?: number;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now() + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + (opts.attack ?? 0.01) + (opts.decay ?? 0.3));
    this.env(g, t, opts.peak ?? 0.2, opts.attack ?? 0.005, opts.decay ?? 0.3);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + (opts.attack ?? 0.005) + (opts.decay ?? 0.3) + 0.05);
  }

  private noise(opts: {
    peak?: number;
    attack?: number;
    decay?: number;
    delay?: number;
    filterFreq?: number;
    filterEnd?: number;
    filterType?: BiquadFilterType;
    q?: number;
  }): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now() + (opts.delay ?? 0);
    const dur = (opts.attack ?? 0.005) + (opts.decay ?? 0.2) + 0.05;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.filterType ?? 'lowpass';
    filter.frequency.setValueAtTime(opts.filterFreq ?? 1200, t);
    if (opts.filterEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(opts.filterEnd, t + dur);
    filter.Q.value = opts.q ?? 0.8;
    const g = this.ctx.createGain();
    this.env(g, t, opts.peak ?? 0.2, opts.attack ?? 0.005, opts.decay ?? 0.2);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  /** Symbol drop tick; pitch varies by column. */
  drop(column: number): void {
    this.noise({ peak: 0.12, decay: 0.06, filterFreq: 900 + column * 220, filterType: 'bandpass', q: 2 });
  }

  /** Win chime arpeggio; tier 0/1/2 -> higher base note + longer arp. */
  win(tier: 0 | 1 | 2): void {
    const base = [523.25, 659.25, 783.99][tier] ?? 523.25; // C5, E5, G5
    const scale = [0, 2, 4, 7, 9, 12, 16]; // pentatonic-ish
    const notes = tier === 0 ? 3 : tier === 1 ? 5 : 7;
    for (let i = 0; i < notes; i++) {
      const semitone = scale[i % scale.length]! + 12 * Math.floor(i / scale.length);
      this.tone({
        freq: base * Math.pow(2, semitone / 12),
        type: i % 2 ? 'triangle' : 'sine',
        peak: 0.22,
        decay: 0.5,
        delay: i * 0.07,
      });
    }
  }

  /** Cascade rising whoosh. */
  cascade(): void {
    this.noise({ peak: 0.14, attack: 0.05, decay: 0.35, filterFreq: 400, filterEnd: 4000, filterType: 'bandpass', q: 1.2 });
  }

  /** Deep anvil slam (Yunque-boosted scatter win): 55Hz thunk, short. */
  slam(): void {
    this.tone({ freq: 58, freqEnd: 40, type: 'sine', peak: 0.4, attack: 0.004, decay: 0.28 });
    this.noise({ peak: 0.18, decay: 0.1, filterFreq: 900, filterType: 'lowpass' });
  }

  /** Wild ignite (Brasa): quick flame burst. */
  ignite(): void {
    this.noise({ peak: 0.2, attack: 0.02, decay: 0.25, filterFreq: 1800, filterEnd: 500, filterType: 'bandpass', q: 1.4 });
    this.tone({ freq: 220, freqEnd: 440, type: 'triangle', peak: 0.12, attack: 0.02, decay: 0.25 });
  }

  /** Forge: deep metallic thunk (55Hz) + noise burst + shimmer. */
  forge(): void {
    this.tone({ freq: 55, freqEnd: 38, type: 'sine', peak: 0.5, attack: 0.005, decay: 0.5 });
    this.noise({ peak: 0.25, decay: 0.18, filterFreq: 2500, filterType: 'highpass' });
    this.tone({ freq: 1567, type: 'sine', peak: 0.08, decay: 0.8, delay: 0.08 });
    this.tone({ freq: 2093, type: 'sine', peak: 0.06, decay: 0.9, delay: 0.16 });
  }

  /** Supernova: sawtooth riser 200->2000Hz + explosion. */
  supernova(): void {
    this.tone({ freq: 200, freqEnd: 2000, type: 'sawtooth', peak: 0.16, attack: 0.6, decay: 0.1 });
    this.noise({ peak: 0.4, attack: 0.01, decay: 0.9, filterFreq: 6000, filterEnd: 120, delay: 0.55 });
    this.tone({ freq: 90, freqEnd: 30, type: 'sine', peak: 0.5, attack: 0.01, decay: 1.0, delay: 0.55 });
  }

  /** Pick ping; pitch rises with prize size. */
  pick(prizeX: number): void {
    const freq = 880 * Math.pow(2, Math.min(prizeX, 6) / 6);
    this.tone({ freq, type: 'sine', peak: 0.25, decay: 0.4 });
    this.tone({ freq: freq * 2, type: 'sine', peak: 0.1, decay: 0.3 });
  }

  gambleWin(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone({ freq: f, type: 'triangle', peak: 0.22, decay: 0.4, delay: i * 0.09 }));
  }

  gambleLose(): void {
    this.tone({ freq: 330, freqEnd: 110, type: 'triangle', peak: 0.2, attack: 0.02, decay: 0.6 });
  }

  button(): void {
    this.tone({ freq: 1200, type: 'sine', peak: 0.08, decay: 0.05 });
  }

  /** Very subtle low thud — never punish a loss. */
  lose(): void {
    this.tone({ freq: 70, freqEnd: 50, type: 'sine', peak: 0.1, attack: 0.01, decay: 0.25 });
  }

  /** Low cosmic pad loop; starts on first interaction. */
  startAmbient(): void {
    if (!this.ctx || !this.master || this.ambientStarted) return;
    this.ambientStarted = true;
    const t = this.now();
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    // -24dB ~= 0.063
    g.gain.setTargetAtTime(0.05, t, 3);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 12;
    lfo.connect(lfoGain);
    for (const f of [55, 55.7, 110.4]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      lfoGain.connect(osc.frequency);
      osc.connect(g);
      osc.start(t);
      this.ambientNodes.push(osc);
    }
    lfo.start(t);
    this.ambientNodes.push(lfo);
    g.connect(this.master);
  }
}

export const audio = new AudioEngine();
