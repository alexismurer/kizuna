import { frameStyle } from "@/lib/cosmetics";
import { initial } from "@/lib/social/format";

// Round card-art avatar; initials on the accent colour when there is no art.
// `frame` is the equipped frame's prize id (prize counter cosmetics).
export function Avatar({ url, username, size, frame }: { url: string | null; username: string; size: number; frame?: string | null }) {
  const box = { width: size, height: size };
  const face = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={box} className="relative shrink-0 rounded-full border border-border object-cover object-top" />
  ) : (
    <span
      aria-hidden
      style={{ ...box, fontSize: size * 0.45 }}
      className="relative flex shrink-0 items-center justify-center rounded-full bg-accent font-display font-bold text-black"
    >
      {initial(username)}
    </span>
  );

  const style = frameStyle(frame);
  if (!style) return face;
  const ring = Math.max(2, Math.round(size / 14));
  return (
    <span data-frame={style} className="relative inline-flex shrink-0 rounded-full" style={{ padding: ring }}>
      <span aria-hidden className="absolute inset-0 overflow-hidden rounded-full">
        <span
          className={
            style === "gold"
              ? "absolute inset-0 bg-[conic-gradient(from_0deg,#7a5410,#ffe08a,#c8901e,#fff3c4,#9a6a14,#ffe08a,#7a5410)]"
              : "absolute -inset-1/2 bg-[conic-gradient(from_0deg,#ff3d7f,#38d5ff,#b44dff,#ff3d7f)] motion-safe:animate-[spin_4s_linear_infinite]"
          }
        />
      </span>
      {style === "neon" && (
        <span aria-hidden className="absolute -inset-0.5 rounded-full shadow-[0_0_12px_#ff3d7f,0_0_18px_#38d5ff] opacity-70" />
      )}
      {style === "gold" && size >= 28 && (
        <>
          <span aria-hidden className="absolute top-0 left-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/3 rotate-45 bg-[#fff3c4] shadow" />
          <span aria-hidden className="absolute bottom-0 left-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 translate-y-1/3 rotate-45 bg-[#fff3c4] shadow" />
        </>
      )}
      {face}
    </span>
  );
}
