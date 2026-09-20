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

  /** Spin ignition whoosh — the forge breathes in before the drop. */
  spinWhoosh(): void {
    this.noise({ peak: 0.16, attack: 0.12, decay: 0.5, filterFreq: 300, filterEnd: 4500, filterType: 'bandpass', q: 1.1 });
    this.tone({ freq: 90, freqEnd: 160, type: 'sine', peak: 0.14, attack: 0.1, decay: 0.4 });
  }

  /** Metallic mineral clink on cell landing; brighter by column. */
  clink(column: number): void {
    const f = 1400 + column * 260 + Math.random() * 120;
    this.tone({ freq: f, type: 'triangle', peak: 0.07, attack: 0.002, decay: 0.09 });
    this.tone({ freq: f * 2.71, type: 'sine', peak: 0.035, attack: 0.002, decay: 0.12 });
  }

  /** Soft column-stop thunk for cascade refills. */
  reelStop(column: number): void {
    this.noise({ peak: 0.08, decay: 0.05, filterFreq: 500 + column * 140, filterType: 'bandpass', q: 2.5 });
  }

  /** Low cinematic riser — pre-supernova tension / scatter anticipation. */
  tensionRiser(durMs = 650): void {
    const dur = durMs / 1000;
    this.tone({ freq: 120, freqEnd: 480, type: 'sawtooth', peak: 0.1, attack: dur * 0.85, decay: 0.12 });
    this.tone({ freq: 60, freqEnd: 240, type: 'triangle', peak: 0.12, attack: dur * 0.85, decay: 0.12 });
    this.noise({ peak: 0.06, attack: dur * 0.8, decay: 0.15, filterFreq: 800, filterEnd: 3600, filterType: 'bandpass', q: 1.6 });
  }

  /** Tick for the win count-up. */
  tick(): void {
    this.tone({ freq: 1567, type: 'sine', peak: 0.05, attack: 0.002, decay: 0.03 });
  }

  /** Deep legendary boom layered over the win chime. */
  legendaryBoom(): void {
    this.tone({ freq: 70, freqEnd: 28, type: 'sine', peak: 0.5, attack: 0.008, decay: 1.1 });
    this.noise({ peak: 0.22, attack: 0.01, decay: 0.8, filterFreq: 5000, filterEnd: 90, filterType: 'lowpass' });
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

  /** Quantum cube destabilize — energy glitch zap + shatter burst. */
  cubeBreak(): void {
    this.noise({ peak: 0.3, attack: 0.002, decay: 0.12, filterFreq: 3200, filterEnd: 500, filterType: 'bandpass', q: 2.2 });
    this.tone({ freq: 180, freqEnd: 2400, type: 'sawtooth', peak: 0.14, attack: 0.005, decay: 0.22 });
    this.tone({ freq: 90, freqEnd: 36, type: 'sine', peak: 0.4, attack: 0.004, decay: 0.5 });
  }

  /** Quantum cube reveal — rising chime arpeggio, brighter for bigger prizes. */
  cubeReveal(prizeX: number): void {
    const base = 659.25 * Math.pow(2, Math.min(prizeX, 12) / 24);
    const notes = [0, 4, 7, 12, 16, 19];
    notes.forEach((s, i) => {
      this.tone({
        freq: base * Math.pow(2, s / 12),
        type: i % 2 ? 'triangle' : 'sine',
        peak: 0.2,
        decay: 0.55,
        delay: i * 0.055,
      });
    });
    this.tone({ freq: base * 4, type: 'sine', peak: 0.07, decay: 1.0, delay: 0.33 });
    // music-bus accent so the reveal breathes with the track
    this.snAccent(base * 2, 0.5);
  }

  // ---------------------------------------------------------------
  // adaptive supernova music — 100% synthesized WebAudio, no assets.
  // Dark dimensional pad + sub pulse at entry; every pick adds a
  // brighter, denser layer; reveal hits accent the bus; the 5th pick
  // triggers the drop and the track fades back out.
  // ---------------------------------------------------------------
  private snBus: GainNode | null = null;
  private snTimer: ReturnType<typeof setTimeout> | null = null;
  private snLayers = 0;
  private snBar = 0;
  private snStopped = false;

  /** Route a tone into an arbitrary destination gain (the music bus). */
  private btone(
    dest: GainNode,
    opts: {
      freq: number;
      freqEnd?: number;
      type?: OscType;
      peak?: number;
      attack?: number;
      decay?: number;
      delay?: number;
    },
  ): void {
    if (!this.ctx || this.muted) return;
    const t = this.now() + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + (opts.attack ?? 0.01) + (opts.decay ?? 0.3));
    }
    this.env(g, t, opts.peak ?? 0.2, opts.attack ?? 0.005, opts.decay ?? 0.3);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + (opts.attack ?? 0.005) + (opts.decay ?? 0.3) + 0.05);
  }

  private bnoise(
    dest: GainNode,
    opts: { peak?: number; attack?: number; decay?: number; delay?: number; filterFreq?: number; filterEnd?: number; filterType?: BiquadFilterType; q?: number },
  ): void {
    if (!this.ctx || this.muted) return;
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
    src.connect(filter).connect(g).connect(dest);
    src.start(t);
    src.stop(t + dur);
  }

  /** Enter the other universe: dark pad + sub pulse + rising shimmer. */
  supernovaMusicStart(): void {
    if (!this.ctx || !this.master) return;
    this.supernovaMusicStop();
    this.snStopped = false;
    this.snLayers = 0;
    this.snBar = 0;
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(0.42, this.now(), 0.9);
    bus.connect(this.master);
    this.snBus = bus;
    this.snScheduleBar();
  }

  /** Each pick adds a brighter, denser layer to the track. */
  supernovaMusicLayer(picks: number): void {
    this.snLayers = Math.max(0, Math.min(5, picks));
  }

  private snScheduleBar(): void {
    if (!this.ctx || !this.snBus || this.snStopped) return;
    const bus = this.snBus;
    const L = this.snLayers;
    const bar = 2.2;
    // dark dimensional pad: A minor-ish cluster, detuned saws
    const padNotes = [55, 82.41, 110, 130.81, 164.81];
    for (const f of padNotes) {
      this.btone(bus, { freq: f * 1.003, freqEnd: f * 0.998, type: 'sawtooth', peak: 0.05, attack: 1.0, decay: bar - 0.8, delay: 0 });
      this.btone(bus, { freq: f * 0.997, type: 'triangle', peak: 0.045, attack: 1.1, decay: bar - 0.9, delay: 0.05 });
    }
    // sub pulse: 4 heartbeat thumps per bar
    for (let i = 0; i < 4; i++) {
      this.btone(bus, { freq: 58, freqEnd: 36, type: 'sine', peak: 0.3, attack: 0.004, decay: 0.2, delay: i * (bar / 4) });
    }
    // sparkle arp: denser + brighter with every pick
    const arpBase = 220 * Math.pow(2, L / 6);
    const penta = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
    const n = 3 + L * 2;
    for (let i = 0; i < n; i++) {
      const st = penta[i % penta.length]! + 12 * Math.floor(i / penta.length);
      this.btone(bus, {
        freq: arpBase * Math.pow(2, st / 12),
        type: i % 2 ? 'sine' : 'triangle',
        peak: 0.055 + L * 0.012,
        attack: 0.004,
        decay: 0.32,
        delay: (i / n) * bar,
      });
    }
    // rising shimmer edge that grows with tension
    this.bnoise(bus, { peak: 0.02 + L * 0.012, attack: bar * 0.7, decay: 0.3, filterFreq: 1200, filterEnd: 4200 + L * 700, filterType: 'bandpass', q: 1.4 });
    // every 4th bar: a sweep riser into the next cycle
    if (this.snBar % 4 === 3) {
      this.btone(bus, { freq: 180, freqEnd: 1500, type: 'sawtooth', peak: 0.05, attack: bar * 0.75, decay: 0.25 });
    }
    this.snBar++;
    this.snTimer = setTimeout(() => this.snScheduleBar(), bar * 1000);
  }

  /** Accent on the music bus when a prize reveals. */
  private snAccent(freq: number, peak: number): void {
    if (!this.snBus || this.snStopped) return;
    this.btone(this.snBus, { freq, type: 'sine', peak, attack: 0.004, decay: 0.5 });
    this.btone(this.snBus, { freq: freq * 1.5, type: 'triangle', peak: peak * 0.6, attack: 0.004, decay: 0.4, delay: 0.05 });
  }

  /** The drop: all 5 picked — the track detonates, then fades out. */
  supernovaMusicDrop(): void {
    if (!this.ctx) return;
    const dest = this.snBus && !this.snStopped ? this.snBus : this.master;
    if (!dest) return;
    // chord stab: dark A minor add9
    const stab = [110, 130.81, 164.81, 220, 261.63, 329.63];
    for (const f of stab) {
      this.btone(dest, { freq: f, type: 'sawtooth', peak: 0.11, attack: 0.008, decay: 1.7 });
      this.btone(dest, { freq: f * 2.001, type: 'sine', peak: 0.05, attack: 0.008, decay: 1.4, delay: 0.02 });
    }
    // sub detonation
    this.btone(dest, { freq: 64, freqEnd: 27, type: 'sine', peak: 0.55, attack: 0.006, decay: 1.5 });
    // airy crash
    this.bnoise(dest, { peak: 0.2, attack: 0.005, decay: 1.3, filterFreq: 5200, filterEnd: 9000, filterType: 'highpass' });
    // celebratory run up the octave
    const run = [440, 523.25, 659.25, 783.99, 880, 1046.5, 1318.5, 1760];
    run.forEach((f, i) => this.btone(dest, { freq: f, type: 'triangle', peak: 0.14, decay: 0.5, delay: 0.15 + i * 0.075 }));
    // fade the bus back out — we crossed back to the base universe
    if (this.snBus && !this.snStopped) {
      const bus = this.snBus;
      const t = this.now();
      bus.gain.cancelScheduledValues(t);
      bus.gain.setTargetAtTime(0, t + 1.4, 0.5);
    }
    this.snStopped = true;
    if (this.snTimer) {
      clearTimeout(this.snTimer);
      this.snTimer = null;
    }
  }

  /** Hard stop the supernova track (e.g. leaving the bonus early). */
  supernovaMusicStop(): void {
    this.snStopped = true;
    if (this.snTimer) {
      clearTimeout(this.snTimer);
      this.snTimer = null;
    }
    if (this.snBus && this.ctx) {
      const bus = this.snBus;
      const t = this.now();
      try {
        bus.gain.cancelScheduledValues(t);
        bus.gain.setTargetAtTime(0, t, 0.15);
        setTimeout(() => {
          try { bus.disconnect(); } catch { /* already gone */ }
        }, 900);
      } catch { /* ignore */ }
    }
    this.snBus = null;
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
