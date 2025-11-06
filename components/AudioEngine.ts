import * as Tone from "tone";

export type PadId = "kick" | "snare" | "hat" | "bass" | "lead" | "fx";

export type QuantizedTrigger = {
  tick: number;
  scheduledAt: number;
};

export type LoopEvent = {
  tick: number;
  padId: PadId;
  velocity: number;
};

export type LoopClip = {
  id: string;
  title: string;
  author: string;
  bpm: number;
  color: string;
  createdAt: number;
  events: LoopEvent[];
  likes: number;
  remixes: number;
};

export type ActiveClip = LoopClip & {
  part: Tone.Part | null;
};

const GRID_RESOLUTION = 16; // sixteenth notes within a bar
const DEFAULT_BPM = 104;

export class AudioEngine {
  private initialized = false;
  private filter: Tone.Filter | null = null;
  private reverb: Tone.Reverb | null = null;
  private distortion: Tone.Distortion | null = null;
  private limiter: Tone.Limiter | null = null;
  private kick: Tone.MembraneSynth | null = null;
  private snare: Tone.NoiseSynth | null = null;
  private hat: Tone.MetalSynth | null = null;
  private bass: Tone.MonoSynth | null = null;
  private lead: Tone.Synth | null = null;
  private fx: Tone.FMSynth | null = null;
  private bpm = DEFAULT_BPM;

  async init(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();

    this.filter = new Tone.Filter({
      frequency: 18000,
      type: "lowpass",
      Q: 1
    });
    this.reverb = new Tone.Reverb({ decay: 4, wet: 0.28 });
    this.distortion = new Tone.Distortion({ distortion: 0.08, wet: 0.15 });
    this.limiter = new Tone.Limiter({ threshold: -3 });

    const masterChain = Tone.Destination;
    this.filter.connect(this.reverb);
    this.reverb.connect(this.distortion);
    this.distortion.connect(this.limiter);
    this.limiter.connect(masterChain);

    this.kick = new Tone.MembraneSynth({
      octaves: 3,
      pitchDecay: 0.05,
      envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 0.2 }
    }).connect(this.filter);

    this.snare = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.24, sustain: 0 }
    }).connect(this.filter);

    this.hat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.3, release: 0.4 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000
    }).connect(this.filter);

    this.bass = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      filter: { Q: 4, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.7 }
    }).connect(this.filter);

    this.lead = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.04, decay: 0.3, sustain: 0.6, release: 0.4 }
    }).connect(this.filter);

    this.fx = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 12,
      envelope: { attack: 0.002, decay: 0.2, sustain: 0.4, release: 0.5 }
    }).connect(this.filter);

    Tone.Transport.bpm.value = this.bpm;
    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = "1m";
    Tone.Transport.start("+0.1");

    this.initialized = true;
  }

  dispose(): void {
    this.kick?.dispose();
    this.snare?.dispose();
    this.hat?.dispose();
    this.bass?.dispose();
    this.lead?.dispose();
    this.fx?.dispose();
    this.filter?.dispose();
    this.reverb?.dispose();
    this.distortion?.dispose();
    this.limiter?.dispose();
    this.initialized = false;
  }

  setBpm(nextBpm: number) {
    this.ensureReady();
    this.bpm = nextBpm;
    Tone.Transport.bpm.rampTo(nextBpm, 0.2);
  }

  setFilterFrequency(value: number) {
    this.ensureReady();
    this.filter?.frequency.rampTo(value, 0.4);
  }

  setReverbWet(value: number) {
    this.ensureReady();
    if (this.reverb) {
      this.reverb.wet.rampTo(value, 0.4);
    }
  }

  private ensureReady() {
    if (!this.initialized) {
      throw new Error("AudioEngine not initialised");
    }
  }

  triggerPad(padId: PadId, velocity = 1): QuantizedTrigger {
    this.ensureReady();

    const subdivision = Tone.Time("16n").toSeconds();
    const now = Tone.Transport.seconds;
    const nextTickSeconds = now % subdivision === 0 ? now : now + (subdivision - (now % subdivision));
    const tick = Math.round(nextTickSeconds / subdivision) % GRID_RESOLUTION;

    Tone.Transport.scheduleOnce((time) => {
      this.playInstrument(padId, time, velocity);
    }, nextTickSeconds);

    return { tick, scheduledAt: nextTickSeconds };
  }

  createClip(source: LoopClip): ActiveClip {
    this.ensureReady();
    const measureSeconds = Tone.Time("1m").toSeconds();
    const scheduled: Array<[number, LoopEvent]> = source.events.map(
      (evt) => [((evt.tick % GRID_RESOLUTION) / GRID_RESOLUTION) * measureSeconds, evt] as [
        number,
        LoopEvent
      ]
    );
    const part: Tone.Part = new Tone.Part(
      (time, value) => {
        const event = value as LoopEvent | undefined;
        if (!event) return;
        this.playInstrument(event.padId, time, event.velocity);
      },
      scheduled as any
    );

    part.loop = true;
    part.loopEnd = "1m";
    part.humanize = 0.01;
    part.start(0);

    return { ...source, part };
  }

  stopClip(activeClip: ActiveClip) {
    activeClip.part?.stop();
    activeClip.part?.dispose();
  }

  private playInstrument(padId: PadId, time: number, velocity: number) {
    switch (padId) {
      case "kick":
        this.kick?.triggerAttackRelease("C1", "8n", time, velocity);
        break;
      case "snare":
        this.snare?.triggerAttackRelease("8n", time, velocity);
        break;
      case "hat":
        this.hat?.triggerAttackRelease("16n", time, velocity);
        break;
      case "bass":
        this.bass?.triggerAttackRelease("C2", "8n", time, velocity * 0.9);
        break;
      case "lead":
        this.lead?.triggerAttackRelease("C4", "8n", time, velocity * 0.8);
        break;
      case "fx":
        this.fx?.triggerAttackRelease("G4", "8n", time, velocity * 0.6);
        break;
    }
  }
}

export const PAD_META: Record<
  PadId,
  { label: string; color: string; ring: string; description: string }
> = {
  kick: {
    label: "Kick",
    color: "from-neo-pink via-neo-yellow to-neo-purple",
    ring: "shadow-[0_0_45px_rgba(255,106,193,0.45)]",
    description: "Deep pulse hits"
  },
  snare: {
    label: "Snare",
    color: "from-neo-cyan via-neo-pink to-neo-yellow",
    ring: "shadow-[0_0_45px_rgba(94,231,255,0.45)]",
    description: "Snap & pop"
  },
  hat: {
    label: "Hat",
    color: "from-white via-neo-cyan to-neo-pink",
    ring: "shadow-[0_0_55px_rgba(255,255,255,0.35)]",
    description: "Airy shimmer"
  },
  bass: {
    label: "Bass",
    color: "from-emerald-400 via-neo-cyan to-neo-purple",
    ring: "shadow-[0_0_45px_rgba(16,185,129,0.35)]",
    description: "Low groove"
  },
  lead: {
    label: "Lead",
    color: "from-neo-purple via-neo-pink to-white",
    ring: "shadow-[0_0_55px_rgba(157,78,221,0.45)]",
    description: "Melodic sparks"
  },
  fx: {
    label: "FX",
    color: "from-neo-yellow via-neo-cyan to-neo-purple",
    ring: "shadow-[0_0_60px_rgba(255,209,102,0.35)]",
    description: "Galaxy sweeps"
  }
};

export const GRID_STEPS = GRID_RESOLUTION;
export const DEFAULT_CLIPS: LoopClip[] = [
  {
    id: "nova-drift",
    title: "Nova Drift",
    author: "RayPulse",
    bpm: DEFAULT_BPM,
    color: "#ff6ac1",
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
    likes: 214,
    remixes: 24,
    events: [
      { tick: 0, padId: "kick", velocity: 1 },
      { tick: 4, padId: "snare", velocity: 0.9 },
      { tick: 8, padId: "kick", velocity: 1 },
      { tick: 12, padId: "snare", velocity: 0.8 },
      { tick: 2, padId: "hat", velocity: 0.5 },
      { tick: 6, padId: "hat", velocity: 0.5 },
      { tick: 10, padId: "hat", velocity: 0.5 },
      { tick: 14, padId: "hat", velocity: 0.5 },
      { tick: 0, padId: "bass", velocity: 0.8 },
      { tick: 8, padId: "bass", velocity: 0.75 },
      { tick: 4, padId: "lead", velocity: 0.6 },
      { tick: 12, padId: "fx", velocity: 0.4 }
    ]
  },
  {
    id: "cosmic-loop",
    title: "Cosmic Loop",
    author: "Luna",
    bpm: 112,
    color: "#5ee7ff",
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    likes: 189,
    remixes: 31,
    events: [
      { tick: 0, padId: "kick", velocity: 1 },
      { tick: 4, padId: "kick", velocity: 0.9 },
      { tick: 8, padId: "kick", velocity: 1 },
      { tick: 12, padId: "kick", velocity: 0.92 },
      { tick: 6, padId: "snare", velocity: 0.85 },
      { tick: 14, padId: "snare", velocity: 0.8 },
      { tick: 2, padId: "hat", velocity: 0.7 },
      { tick: 6, padId: "hat", velocity: 0.74 },
      { tick: 10, padId: "hat", velocity: 0.75 },
      { tick: 14, padId: "hat", velocity: 0.76 },
      { tick: 0, padId: "bass", velocity: 0.85 },
      { tick: 4, padId: "bass", velocity: 0.8 },
      { tick: 8, padId: "bass", velocity: 0.88 },
      { tick: 12, padId: "bass", velocity: 0.8 },
      { tick: 3, padId: "fx", velocity: 0.5 },
      { tick: 11, padId: "lead", velocity: 0.58 }
    ]
  }
];
