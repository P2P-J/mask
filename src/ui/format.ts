export function parseResolution(value: string): { width: number; height: number } {
  const [width, height] = value.split("x").map(Number);
  return { width, height };
}
