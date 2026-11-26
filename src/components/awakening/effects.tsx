import type { AwakeningEffect } from "@/lib/rebirth/types";

// The six effect layers drawn over an awakening card's art. Each is a few absolutely-placed spans/SVGs
// animated by the .awk-fx-* keyframes in globals.css, tinted with the card's --accent. They run at a
// calm pace and speed up / brighten when the card is hovered (.awk-live:hover); reduced motion and the
// Animations setting (.fx-still) freeze them into a still frame.

function Sun() {
  return (
    <>
      <span className="awk-sun-rays" />
      <span className="awk-sun-core" />
    </>
  );
}

const BOLTS = [
  "M38 0 L30 34 L42 36 L26 80 L34 82 L22 120",
  "M78 10 L86 40 L74 44 L90 78 L80 80 L92 118",
];

function Lightning() {
  return (
    <>
      <span className="awk-bolt-flash" />
      <svg className="awk-bolts" viewBox="0 0 110 154" preserveAspectRatio="none">
        {BOLTS.map((d, i) => (
          <path key={d} d={d} className={`awk-bolt awk-bolt-${i}`} />
        ))}
      </svg>
    </>
  );
}

function Flame() {
  return (
    <>
      <span className="awk-flame awk-flame-a" />
      <span className="awk-flame awk-flame-b" />
      <span className="awk-embers" />
    </>
  );
}

function Void() {
  return (
    <>
      <span className="awk-void-swirl" />
      <span className="awk-void-stars" />
    </>
  );
}

function Chains() {
  return (
    <svg className="awk-chains" viewBox="0 0 110 154" preserveAspectRatio="none">
      <path d="M-10 30 L120 110" className="awk-chain" />
      <path d="M120 40 L-10 128" className="awk-chain awk-chain-b" />
    </svg>
  );
}

const PETALS = [8, 22, 37, 51, 64, 78, 90];

function Petals() {
  return (
    <>
      {PETALS.map((left, i) => (
        <span
          key={left}
          className="awk-petal"
          style={{
            left: `${left}%`,
            ["--py" as string]: `${10 + ((i * 37) % 70)}%`,
            animationDelay: `${-((i * 1.7) % 6)}s`,
            animationDuration: `calc(${5 + (i % 3)}s * var(--spd))`,
          }}
        />
      ))}
    </>
  );
}

const LAYERS: Record<AwakeningEffect, () => React.ReactElement> = {
  sun: Sun,
  lightning: Lightning,
  flame: Flame,
  void: Void,
  chains: Chains,
  petals: Petals,
};

export function EffectLayer({ effect }: { effect: AwakeningEffect }) {
  const Layer = LAYERS[effect] ?? Sun;
  return (
    <div aria-hidden data-effect={effect} className={`awk-fx awk-fx-${effect}`}>
      <Layer />
    </div>
  );
}
