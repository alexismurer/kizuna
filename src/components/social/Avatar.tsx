import { initial } from "@/lib/social/format";

// Round card-art avatar; initials on the accent colour when there is no art.
export function Avatar({ url, username, size }: { url: string | null; username: string; size: number }) {
  const box = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" style={box} className="shrink-0 rounded-full border border-border object-cover object-top" />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: size * 0.45 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent font-display font-bold text-black"
    >
      {initial(username)}
    </span>
  );
}
