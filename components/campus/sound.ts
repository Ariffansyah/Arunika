// Two-tone siren from an oscillator: no audio file to ship or license.
export function siren(seconds = 3) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    gain.gain.value = 0.06;
    for (let t = 0; t < seconds; t += 0.5) osc.frequency.setValueAtTime(t % 1 ? 640 : 880, ctx.currentTime + t);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
    osc.onended = () => ctx.close();
    // A drill started by someone else arrives without a click here, so the context may begin suspended.
    void ctx.resume();
  } catch {
    // Audio is a cue, not a requirement; the on-screen instruction carries the same message.
  }
}

export function rumble(seconds: number) {
  try {
    const ctx = new AudioContext();
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
    gain.gain.setValueAtTime(0.55, now + seconds - 1);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    src.connect(low).connect(gain).connect(ctx.destination);
    src.start();
    src.onended = () => ctx.close();
    void ctx.resume();
  } catch {
    // Sound is a cue only; the shaking camera and the instruction carry the same message.
  }
}

// A kentongan (bamboo slit drum) beaten fast and without pause is the village call to evacuate.
export function kentongan(knocks = 10) {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    for (let i = 0; i < knocks; i++) {
      const at = now + i * 0.17;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, at);
      osc.frequency.exponentialRampToValueAtTime(260, at + 0.12);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.15);
      if (i === knocks - 1) osc.onended = () => ctx.close();
    }
    void ctx.resume();
  } catch {
    // Sound is a cue only; the message on screen says the same.
  }
}
