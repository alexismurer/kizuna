import { COLOR } from "@/components/card/CardView";

const LETTER = { legendary: "L", mythic: "M" } as const;

// A round stamp with the rarity letter, pressed onto a Legendary / Mythic card once its face shows.
export function RaritySeal({ rarity, animate }: { rarity: "legendary" | "mythic"; animate: boolean }) {
  const color = COLOR[rarity];
  return (
    <span
      aria-hidden
      data-testid="rarity-seal"
      className={`pointer-events-none absolute right-[7%] top-[16%] z-20 flex aspect-square w-[26%] items-center justify-center rounded-full border-[3px] font-display text-[clamp(1.25rem,6vw,2.2rem)] font-black leading-none ${animate ? "seal-stamp" : ""}`}
      style={{
        borderColor: color,
        color,
        background: "radial-gradient(circle, rgb(0 0 0 / 0.75), rgb(0 0 0 / 0.55))",
        boxShadow: `0 0 0 3px rgb(0 0 0 / 0.5), 0 0 22px ${color}`,
        rotate: "-12deg",
      }}
    >
      {LETTER[rarity]}
    </span>
  );
}
