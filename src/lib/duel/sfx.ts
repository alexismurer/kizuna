import { playSfx } from "@/lib/fx/sound";

// Duel sounds: the game's Kenney samples for flips and big moments, short synthesized
// sounds for the rest (no extra files to load). Everything is best-effort.
export type DuelSfx =
  | "deal"
  | "place"
  | "placeFoe"
  | "pass"
  | "weather"
  | "clear"
  | "burn"
  | "horn"
  | "spy"
  | "roundWon"
  | "roundLost"
  | "victory"
  | "defeat"
  | "turn";

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === "undefined") return null;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
}

type Tone = { f: number; to?: number; dur: number; type?: OscillatorType; vol?: number; at?: number };

function tones(list: Tone[]) {
  const a = ac();
  if (!a) return;
  if (a.state === "suspended") void a.resume().catch(() => {});
  const now = a.currentTime;
  for (const t of list) {
    try {
      const o = a.createOscillator();
      const g = a.createGain();
      const start = now + (t.at ?? 0);
      o.type = t.type ?? "sine";
      o.frequency.setValueAtTime(t.f, start);
      if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(t.vol ?? 0.2, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
      o.connect(g).connect(a.destination);
      o.start(start);
      o.stop(start + t.dur + 0.02);
    } catch {
      // audio is best-effort
    }
  }
}

// filtered white noise: wind, fire, a whoosh
function noise(dur: number, freq: number, vol = 0.25, sweepTo?: number) {
  const a = ac();
  if (!a) return;
  try {
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    const filter = a.createBiquadFilter();
    const g = a.createGain();
    src.buffer = buf;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, a.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, a.currentTime + dur);
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(a.destination);
    src.start();
  } catch {
    // audio is best-effort
  }
}

export function duelSfx(kind: DuelSfx, enabled: boolean) {
  if (!enabled) return;
  switch (kind) {
    case "deal":
      return playSfx("flip", true);
    case "place":
      tones([{ f: 180, to: 70, dur: 0.18, type: "triangle", vol: 0.35 }]);
      return noise(0.08, 2400, 0.15);
    case "placeFoe":
      return tones([{ f: 140, to: 55, dur: 0.2, type: "triangle", vol: 0.3 }]);
    case "pass":
      return noise(0.35, 600, 0.18, 200);
    case "weather":
      return noise(0.9, 900, 0.22, 300);
    case "clear":
      return tones([
        { f: 660, dur: 0.25, vol: 0.12 },
        { f: 990, dur: 0.35, vol: 0.1, at: 0.08 },
      ]);
    case "burn":
      noise(0.6, 1200, 0.35, 150);
      return tones([{ f: 90, to: 40, dur: 0.5, type: "sawtooth", vol: 0.15 }]);
    case "horn":
      return tones([
        { f: 220, dur: 0.6, type: "sawtooth", vol: 0.08 },
        { f: 277, dur: 0.6, type: "sawtooth", vol: 0.06, at: 0.05 },
        { f: 330, dur: 0.7, type: "sawtooth", vol: 0.06, at: 0.1 },
      ]);
    case "spy":
      return tones([
        { f: 520, to: 380, dur: 0.15, type: "square", vol: 0.05 },
        { f: 390, to: 300, dur: 0.2, type: "square", vol: 0.05, at: 0.12 },
      ]);
    case "turn":
      return tones([{ f: 880, dur: 0.12, vol: 0.08 }]);
    case "roundWon":
      return playSfx("claim", true);
    case "roundLost":
      return tones([
        { f: 392, dur: 0.25, type: "triangle", vol: 0.15 },
        { f: 330, dur: 0.25, type: "triangle", vol: 0.15, at: 0.2 },
        { f: 262, dur: 0.5, type: "triangle", vol: 0.15, at: 0.4 },
      ]);
    case "victory":
      return playSfx("legendary", true);
    case "defeat":
      return tones([
        { f: 196, to: 98, dur: 1.2, type: "sawtooth", vol: 0.1 },
        { f: 147, to: 73, dur: 1.2, type: "triangle", vol: 0.12 },
      ]);
  }
}
