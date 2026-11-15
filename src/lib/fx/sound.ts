export type Sfx = "tear" | "flip" | "rare" | "epic" | "legendary" | "mythic";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === "undefined") return null;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
}

// partial count and tail length (s) grow with rarity
const CHIME: Record<"rare" | "epic" | "legendary" | "mythic", [number, number]> = {
  rare: [2, 0.4],
  epic: [3, 0.55],
  legendary: [4, 0.75],
  mythic: [5, 0.85],
};

function tone(
  ac: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  start: number,
  dur: number,
  peak: number,
) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, start);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playSfx(kind: Sfx, enabled: boolean): void {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    if (ac.state === "suspended") void ac.resume();
    const t = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = 0.2;
    master.connect(ac.destination);

    if (kind === "tear") {
      const len = Math.floor(ac.sampleRate * 0.25);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const filter = ac.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1200, t);
      filter.frequency.exponentialRampToValueAtTime(4000, t + 0.25);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.8, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      src.connect(filter).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.26);
    } else if (kind === "flip") {
      tone(ac, master, "square", 900, 300, t, 0.06, 0.5);
    } else {
      const [partials, tail] = CHIME[kind];
      const base = 523.25; // C5
      for (let i = 0; i < partials; i++) {
        const f = base * Math.pow(1.5, i);
        tone(ac, master, "sine", f, f * 1.01, t + i * 0.07, tail - i * 0.04, 0.5 / (1 + i * 0.4));
      }
    }
  } catch {
    // audio is best-effort
  }
}
