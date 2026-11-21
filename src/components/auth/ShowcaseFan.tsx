"use client";

import { CardView, type CardFace } from "@/components/card/CardView";
import { usePrefs } from "@/lib/fx/prefs";

// best card in the middle, raised; the other two tilt out from behind it
const FAN = [
  { x: "-62%", r: -9, z: 1, s: 1 },
  { x: "0%", r: 0, z: 2, s: 1.12 },
  { x: "62%", r: 9, z: 0, s: 1 },
];
const ORDER = [1, 0, 2]; // cards arrive best first

export function ShowcaseFan({ cards }: { cards: CardFace[] }) {
  const [prefs] = usePrefs();
  if (cards.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      className={`relative h-64 w-full sm:h-96 lg:h-[32rem] ${prefs.animations ? "" : "fx-still"}`}
    >
      {/* a soft halo behind the fan */}
      <div className="absolute left-1/2 top-1/2 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(330_92%_53%/0.35)] blur-[70px]" />
      {cards.slice(0, 3).map((c, i) => {
        const f = FAN[ORDER[i]];
        const end = `translate(-50%, -50%) translateX(${f.x}) rotate(${f.r}deg) scale(${f.s})`;
        return (
          <div
            key={c.number}
            className="fan-in absolute left-1/2 top-1/2 drop-shadow-2xl"
            style={{ zIndex: f.z, transform: end, ["--fan" as string]: end, animationDelay: `${i * 90}ms` }}
          >
            {/* each card drifts on its own beat once the fan has landed */}
            <div className="fan-float" style={{ animationDelay: `${700 + i * 600}ms` }}>
              <div className="origin-center scale-[0.85] sm:scale-125 lg:scale-[1.35]">
                <CardView card={c} size="md" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
