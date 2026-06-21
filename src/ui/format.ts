export function parseResolution(value: string): { width: number; height: number } {
  const [width, height] = value.split("x").map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("잘못된 해상도 값: " + value);
  }
  return { width, height };
}
