// Icon art shared by the generated PNG icons: accent background, tilted card.
export function AppIcon({ size }: { size: number }) {
  const w = size * 0.42;
  const h = size * 0.58;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ff3d7f",
      }}
    >
      <div
        style={{
          width: w,
          height: h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b0f",
          borderRadius: size * 0.06,
          border: `${size * 0.025}px solid #ffd23f`,
          transform: "rotate(-8deg)",
        }}
      >
        <div style={{ width: w * 0.4, height: w * 0.4, background: "#ffd23f", borderRadius: w }} />
      </div>
    </div>
  );
}
