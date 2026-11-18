// One audio context for the whole campus, made on the first tap or key press: browsers keep audio
// silent until the person has interacted, and a context made earlier only logs a warning.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("arunika:mute") === "1";
  } catch {
    return false;
  }
})();

const SAMPLES = {
  "step-concrete": 5,
  "step-grass": 5,
  "door-open": 2,
  "door-close": 4,
  glass: 5,
  crash: 5,
  rock: 5,
  land: 3,
  correct: 1,
  wrong: 1,
  tick: 1,
  switch: 1,
} as const;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function start() {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    // Decoded up front, so the first footstep is not late.
    for (const [name, n] of Object.entries(SAMPLES) as [string, number][]) for (let i = 0; i < n; i++) load(n > 1 ? `${name}-${i}` : name);
  } catch {
    // No Web Audio: the campus runs silent, every cue is also on screen.
  }
}

if (typeof window !== "undefined") {
  const unlock = () => {
    start();
    void ctx?.resume();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function load(file: string) {
  if (!ctx) return Promise.resolve(null);
  let p = buffers.get(file);
  if (!p) {
    const c = ctx;
    p = fetch(`/sounds/${file}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .catch(() => null);
    buffers.set(file, p);
  }
  return p;
}

export const isMuted = () => muted;

export function setMuted(on: boolean) {
  muted = on;
  master?.gain.setTargetAtTime(on ? 0 : 1, ctx!.currentTime, 0.05);
  try {
    localStorage.setItem("arunika:mute", on ? "1" : "0");
  } catch {
    // Not remembered in a private window; the switch still works for this visit.
  }
}

// A recorded sound, one of its takes at random, a touch higher or lower each time so repeats don't drone.
export function play(name: keyof typeof SAMPLES, gain = 1) {
  if (!ctx || !master || muted || gain <= 0.01) return;
  const n: number = SAMPLES[name];
  const c = ctx;
  const out = master;
  void load(n > 1 ? `${name}-${Math.floor(Math.random() * n)}` : name).then((buf) => {
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.92 + Math.random() * 0.16;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(out);
    src.start();
  });
}

// Loudness of something d metres away: full within 4 m, gone by 45 m.
export const falloff = (d: number) => Math.min(1, Math.max(0, 1 - (d - 4) / 41));

// A short burst of filtered noise: a foot in water.
export function splash(gain = 0.3) {
  if (!ctx || !master || muted) return;
  const n = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 900 + Math.random() * 500;
  band.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(band).connect(g).connect(master);
  src.start();
}

// Two-tone siren from an oscillator: no audio file to ship or license.
export function siren(seconds = 3) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  gain.gain.value = 0.06;
  for (let t = 0; t < seconds; t += 0.5) osc.frequency.setValueAtTime(t % 1 ? 640 : 880, ctx.currentTime + t);
  osc.connect(gain).connect(master);
  osc.start();
  osc.stop(ctx.currentTime + seconds);
}

export function rumble(seconds: number) {
  if (!ctx || !master) return;
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 140;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.55, now + 0.4);
  gain.gain.setValueAtTime(0.55, now + Math.max(0.5, seconds - 1));
  gain.gain.linearRampToValueAtTime(0, now + seconds);
  src.connect(low).connect(gain).connect(master);
  src.start();
}

// Background sound, every layer from one looping noise buffer shaped by a filter.
export type Ambience = { rain: number; wind: number; waves: number; city: number; water: number; birds: number };
type Layer = { gain: GainNode; level: number };
let layers: Record<Exclude<keyof Ambience, "birds">, Layer> | null = null;
let nextChirp = 0;

function buildLayers(c: AudioContext, out: GainNode) {
  const n = c.sampleRate * 3;
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const layer = (type: BiquadFilterType, freq: number, q: number, wobble = 0): Layer => {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // Each layer starts at its own point in the loop, so they don't beat against each other.
    src.start(0, Math.random() * 3);
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    if (wobble) {
      // A slow swell: waves rolling in, wind gusting.
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = wobble;
      depth.gain.value = freq * 0.45;
      lfo.connect(depth).connect(filter.frequency);
      lfo.start();
    }
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(out);
    return { gain, level: 0 };
  };
  return {
    rain: layer("highpass", 1400, 0.5),
    wind: layer("lowpass", 420, 1.2, 0.23),
    waves: layer("lowpass", 520, 0.7, 0.11),
    city: layer("lowpass", 170, 0.6),
    water: layer("bandpass", 650, 0.9, 0.4),
  };
}

function chirp(c: AudioContext, out: GainNode, gain: number) {
  const now = c.currentTime;
  const notes = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < notes; i++) {
    const at = now + i * 0.11;
    const osc = c.createOscillator();
    const g = c.createGain();
    const f = 2600 + Math.random() * 1400;
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(f * 1.35, at + 0.07);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.04 * gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + 0.09);
  }
}

// Called every frame with how loud each layer should be, 0 to 1; changes are eased.
export function setAmbience(a: Ambience) {
  if (!ctx || !master || ctx.state !== "running") return;
  layers ??= buildLayers(ctx, master);
  const peak: Record<keyof typeof layers, number> = { rain: 0.22, wind: 0.5, waves: 0.18, city: 0.16, water: 0.2 };
  for (const k of Object.keys(layers) as (keyof typeof layers)[]) {
    const l = layers[k];
    if (Math.abs(l.level - a[k]) < 0.01) continue;
    l.level = a[k];
    l.gain.gain.setTargetAtTime(a[k] * peak[k], ctx.currentTime, 0.6);
  }
  if (a.birds > 0.05 && !muted && ctx.currentTime > nextChirp) {
    chirp(ctx, master, a.birds);
    nextChirp = ctx.currentTime + 1.5 + Math.random() * 5;
  }
}
