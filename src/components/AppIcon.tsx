import { readFileSync } from "node:fs";
import { join } from "node:path";

// Icon art shared by the generated PNG icons: the white ensō on the app's black,
// inset so it survives round and squircle masks.
const MARK = `data:image/png;base64,${readFileSync(join(process.cwd(), "public/brand/kizuna-mark-white.png")).toString("base64")}`;

export function AppIcon({ size }: { size: number }) {
  const mark = Math.round(size * 0.72);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0b0f",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK} width={mark} height={mark} alt="" />
    </div>
  );
}
