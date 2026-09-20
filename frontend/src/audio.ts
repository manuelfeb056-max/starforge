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

  // ---------------------------------------------------------------
  // NOVA FURNACE — adaptive furnace score. 100% synthesized WebAudio.
  // Dark molten drone + heartbeat that quickens as respins run out;
  // specials detonate the drop; the finale lands the fanfare.
  // ---------------------------------------------------------------
  private nvBus: GainNode | null = null;
  private nvTimer: ReturnType<typeof setTimeout> | null = null;
  private nvTension = 0; // 0..1 — rises as respinsLeft falls
  private nvStopped = false;
  private nvBar = 0;

  /** Dimensional entry: the universe tears open. */
  novaEntry(): void {
    // collapse riser
    this.tone({ freq: 90, freqEnd: 900, type: 'sawtooth', peak: 0.14, attack: 0.85, decay: 0.15 });
    this.tone({ freq: 45, freqEnd: 450, type: 'triangle', peak: 0.16, attack: 0.85, decay: 0.15 });
    this.noise({ peak: 0.1, attack: 0.8, decay: 0.2, filterFreq: 600, filterEnd: 5000, filterType: 'bandpass', q: 1.4 });
    // detonation
    this.noise({ peak: 0.45, attack: 0.005, decay: 0.9, filterFreq: 6500, filterEnd: 100, delay: 0.85 });
    this.tone({ freq: 110, freqEnd: 26, type: 'sine', peak: 0.55, attack: 0.005, decay: 1.2, delay: 0.85 });
    this.tone({ freq: 880, freqEnd: 1760, type: 'triangle', peak: 0.12, attack: 0.01, decay: 0.7, delay: 0.9 });
  }

  /** Start the furnace drone. Call once the chamber materializes. */
  novaMusicStart(): void {
    if (!this.ctx || !this.master) return;
    this.novaMusicStop();
    this.nvStopped = false;
    this.nvTension = 0;
    this.nvBar = 0;
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(0.4, this.now(), 1.2);
    bus.connect(this.master);
    this.nvBus = bus;
    this.nvScheduleBar();
  }

  /** 0 = calm (3 respins), 1 = critical (1 respin left). */
  novaMusicTension(k: number): void {
    this.nvTension = Math.max(0, Math.min(1, k));
  }

  private nvScheduleBar(): void {
    if (!this.ctx || !this.nvBus || this.nvStopped) return;
    const bus = this.nvBus;
    const T = this.nvTension;
    const bar = 2.4;
    // molten drone: detuned low saws + sub
    for (const f of [55, 55.6, 82.4, 110.3]) {
      this.btone(bus, { freq: f, freqEnd: f * 0.99, type: 'sawtooth', peak: 0.035 + T * 0.02, attack: 1.2, decay: bar - 1, delay: 0 });
    }
    this.btone(bus, { freq: 36.7, freqEnd: 34, type: 'sine', peak: 0.22, attack: 0.8, decay: bar - 0.6 });
    // heartbeat: quickens + brightens with tension (3 -> 6 thumps per bar)
    const beats = 3 + Math.round(T * 3);
    for (let i = 0; i < beats; i++) {
      this.btone(bus, {
        freq: 64 + T * 30,
        freqEnd: 30,
        type: 'sine',
        peak: 0.26 + T * 0.12,
        attack: 0.004,
        decay: 0.22,
        delay: (i / beats) * bar,
      });
    }
    // ember crackle bed
    this.bnoise(bus, {
      peak: 0.03 + T * 0.05,
      attack: 0.4,
      decay: bar - 0.4,
      filterFreq: 2400,
      filterEnd: 5200,
      filterType: 'highpass',
      q: 0.7,
    });
    // every 2nd bar: distant forge hammer
    if (this.nvBar % 2 === 1) {
      this.btone(bus, { freq: 140, freqEnd: 70, type: 'triangle', peak: 0.1, attack: 0.005, decay: 0.3, delay: bar * 0.5 });
      this.bnoise(bus, { peak: 0.08, decay: 0.12, filterFreq: 3000, filterType: 'bandpass', q: 2, delay: bar * 0.5 });
    }
    this.nvBar++;
    this.nvTimer = setTimeout(() => this.nvScheduleBar(), bar * 1000);
  }

  /** Hard stop the furnace score. */
  novaMusicStop(): void {
    this.nvStopped = true;
    if (this.nvTimer) {
      clearTimeout(this.nvTimer);
      this.nvTimer = null;
    }
    if (this.nvBus && this.ctx) {
      const bus = this.nvBus;
      const t = this.now();
      try {
        bus.gain.cancelScheduledValues(t);
        bus.gain.setTargetAtTime(0, t, 0.2);
        setTimeout(() => {
          try { bus.disconnect(); } catch { /* already gone */ }
        }, 1100);
      } catch { /* ignore */ }
    }
    this.nvBus = null;
  }

  /** Each respin: molten whoosh; pitch climbs as respins run low. */
  novaRespin(left: number): void {
    const urgency = 1 - left / 3; // 0..0.67
    this.noise({ peak: 0.16, attack: 0.08, decay: 0.4, filterFreq: 500 + urgency * 900, filterEnd: 3800, filterType: 'bandpass', q: 1.1 });
    this.tone({ freq: 180 + urgency * 320, freqEnd: 90, type: 'triangle', peak: 0.1, attack: 0.05, decay: 0.35 });
    if (left <= 1) {
      // critical heartbeat warning
      this.tone({ freq: 220, type: 'square', peak: 0.06, decay: 0.09 });
      this.tone({ freq: 220, type: 'square', peak: 0.06, decay: 0.09, delay: 0.16 });
    }
  }

  /** Energy core lands: molten thud + chime pitched by value. */
  novaCoreLand(value: number): void {
    this.tone({ freq: 95, freqEnd: 42, type: 'sine', peak: 0.4, attack: 0.004, decay: 0.3 });
    this.noise({ peak: 0.14, decay: 0.12, filterFreq: 2800, filterType: 'bandpass', q: 1.8 });
    const f = 660 * Math.pow(2, Math.min(value, 10) / 14);
    this.tone({ freq: f, type: 'triangle', peak: 0.16, decay: 0.4, delay: 0.03 });
    this.tone({ freq: f * 1.5, type: 'sine', peak: 0.08, decay: 0.5, delay: 0.08 });
  }

  /** A special core drops: the moment before the wow. */
  novaSpecial(kind: 'collector' | 'payer' | 'sniper'): void {
    this.tone({ freq: 150, freqEnd: 1200, type: 'sawtooth', peak: 0.12, attack: 0.28, decay: 0.1 });
    const base = kind === 'collector' ? 98 : kind === 'payer' ? 130.8 : 164.8;
    this.tone({ freq: base, freqEnd: base / 2, type: 'sine', peak: 0.4, attack: 0.005, decay: 0.5, delay: 0.28 });
    this.noise({ peak: 0.2, decay: 0.3, filterFreq: 4000, filterEnd: 400, delay: 0.28 });
  }

  /** Lightning crackle (collector). */
  novaZap(): void {
    for (let i = 0; i < 4; i++) {
      this.noise({
        peak: 0.22,
        attack: 0.002,
        decay: 0.07,
        filterFreq: 3600 + Math.random() * 2400,
        filterType: 'bandpass',
        q: 3,
        delay: i * 0.055,
      });
    }
    this.tone({ freq: 1800, freqEnd: 200, type: 'sawtooth', peak: 0.08, decay: 0.25 });
  }

  /** Laser zap (sniper). */
  novaLaser(): void {
    this.tone({ freq: 2400, freqEnd: 300, type: 'square', peak: 0.1, attack: 0.002, decay: 0.16 });
    this.tone({ freq: 1567, type: 'sine', peak: 0.12, decay: 0.3, delay: 0.1 });
  }

  /** Expanding shockwave (payer). */
  novaShockwave(): void {
    this.tone({ freq: 70, freqEnd: 30, type: 'sine', peak: 0.5, attack: 0.008, decay: 0.8 });
    this.noise({ peak: 0.2, attack: 0.01, decay: 0.6, filterFreq: 900, filterEnd: 5200, filterType: 'bandpass', q: 1 });
    this.tone({ freq: 523.25, type: 'triangle', peak: 0.1, decay: 0.7, delay: 0.12 });
    this.tone({ freq: 783.99, type: 'triangle', peak: 0.1, decay: 0.8, delay: 0.22 });
  }

  /** The finale: forged-brass fanfare + timpani + shimmer run. */
  novaFanfare(): void {
    // stop the drone first — the fanfare takes the room
    this.novaMusicStop();
    const dest = this.master;
    if (!this.ctx || !dest) return;
    // brass-ish stack: D minor -> G -> D (i-iv-i), long swells
    const chords: Array<[number, number[]]> = [
      [0, [146.83, 174.61, 220, 293.66]],
      [0.9, [196, 233.08, 293.66, 392]],
      [1.8, [146.83, 174.61, 220, 293.66, 440]],
    ];
    for (const [delay, notes] of chords) {
      for (const f of notes) {
        this.btone(dest, { freq: f * 1.002, type: 'sawtooth', peak: 0.07, attack: 0.25, decay: 1.1, delay });
        this.btone(dest, { freq: f * 0.998, type: 'sawtooth', peak: 0.07, attack: 0.25, decay: 1.1, delay });
        this.btone(dest, { freq: f / 2, type: 'triangle', peak: 0.06, attack: 0.2, decay: 1.2, delay });
      }
    }
    // timpani
    for (let i = 0; i < 6; i++) {
      this.btone(dest, { freq: 68 - i * 3, freqEnd: 40, type: 'sine', peak: 0.4, attack: 0.004, decay: 0.4, delay: i * 0.42 });
    }
    // shimmer run up
    const run = [587.33, 698.46, 880, 1046.5, 1174.66, 1396.91, 1760, 2093];
    run.forEach((f, i) => this.btone(dest, { freq: f, type: 'triangle', peak: 0.12, decay: 0.6, delay: 0.4 + i * 0.09 }));
    // final detonation of joy
    this.bnoise(dest, { peak: 0.25, attack: 0.005, decay: 1.4, filterFreq: 6000, filterEnd: 10000, filterType: 'highpass', delay: 2.6 });
    this.btone(dest, { freq: 73.42, freqEnd: 36.7, type: 'sine', peak: 0.5, attack: 0.005, decay: 1.6, delay: 2.6 });
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
