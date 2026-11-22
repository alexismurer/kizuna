export type Sfx = "tear" | "flip" | "rare" | "epic" | "legendary" | "mythic" | "claim" | "notify";

// CC0 samples by Kenney (public/sfx/LICENSE-kenney.txt); one variant is picked at random
const FILES: Record<Sfx, string[]> = {
  tear: ["tear-1", "tear-2"],
  flip: ["flip-1", "flip-2", "flip-3"],
  rare: ["rare"],
  epic: ["epic"],
  legendary: ["legendary"],
  mythic: ["mythic"],
  claim: ["claim"],
  notify: ["notify"],
};

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

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

function load(ac: AudioContext, name: string): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((b) => ac.decodeAudioData(b))
      .catch(() => {
        buffers.delete(name); // retry next time
        return null;
      });
    buffers.set(name, p);
  }
  return p;
}

// Resume the audio context from inside a user gesture, so a sound played a bit
// later (e.g. when a press-and-hold completes or a claim request returns) is
// allowed on strict browsers. Also fetches the samples so they play on time.
export function primeAudio(enabled: boolean): void {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume().catch(() => {});
  for (const names of Object.values(FILES)) for (const n of names) void load(ac, n);
}

export function playSfx(kind: Sfx, enabled: boolean): void {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") void ac.resume().catch(() => {});
  const names = FILES[kind];
  void load(ac, names[Math.floor(Math.random() * names.length)]).then((buf) => {
    if (!buf) return;
    try {
      const src = ac.createBufferSource();
      const gain = ac.createGain();
      src.buffer = buf;
      gain.gain.value = 0.7;
      src.connect(gain).connect(ac.destination);
      src.start();
    } catch {
      // audio is best-effort
    }
  });
}
