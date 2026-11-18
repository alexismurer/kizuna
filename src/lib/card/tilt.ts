// Pointer position over a card → rotation in degrees: up to `max` at the edges, flat at the centre.
// rx leans the top back when the pointer is near the top; ry turns toward the pointer's side.
export function tiltFor(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
  max = 12,
): { rx: number; ry: number } {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const nx = clamp(((x - rect.left) / rect.width) * 2 - 1);
  const ny = clamp(((y - rect.top) / rect.height) * 2 - 1);
  return { rx: -ny * max || 0, ry: nx * max || 0 };
}
