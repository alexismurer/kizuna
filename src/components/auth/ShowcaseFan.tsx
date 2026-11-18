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
      className={`relative h-56 w-full sm:h-80 xl:h-[26rem] ${prefs.animations ? "" : "fx-still"}`}
    >
      {cards.slice(0, 3).map((c, i) => {
        const f = FAN[ORDER[i]];
        const end = `translate(-50%, -50%) translateX(${f.x}) rotate(${f.r}deg) scale(${f.s})`;
        return (
          <div
            key={c.number}
            className="fan-in absolute left-1/2 top-1/2 drop-shadow-2xl"
            style={{ zIndex: f.z, transform: end, ["--fan" as string]: end, animationDelay: `${i * 90}ms` }}
          >
            <div className="origin-center scale-75 sm:scale-100 xl:scale-125">
              <CardView card={c} size="md" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
