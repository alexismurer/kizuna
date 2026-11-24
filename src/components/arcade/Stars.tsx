import { Star } from "lucide-react";

// 0–3 stars, earned ones in gold.
export function Stars({ n, size = "md" }: { n: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-8 w-8" : size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <span className="flex items-center gap-0.5" aria-label={`${n}/3`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} aria-hidden className={`${cls} ${i < n ? "fill-legendary text-legendary" : "fill-white/10 text-white/15"}`} />
      ))}
    </span>
  );
}
