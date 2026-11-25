import { nameStyle } from "@/lib/cosmetics";

// A username in the name style the player equipped (plain text when none).
export function PlayerName({ name, styleId, className = "" }: { name: string; styleId?: string | null; className?: string }) {
  const style = nameStyle(styleId);
  if (!style) return <span className={className}>{name}</span>;
  return (
    <span data-name-style={style} className={`name-${style} ${className}`}>
      {name}
    </span>
  );
}
