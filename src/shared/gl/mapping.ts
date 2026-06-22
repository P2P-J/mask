export interface ColorUniforms {
  brightness: number; // -0.5..0.5
  contrast: number; // 0.5..1.5
  tone: number; // -1..1 (warm/cool)
  white: number; // -1..1
  saturation: number; // 0..2 (1=중립)
  warmth: number; // -1..1
  // 확장(2026-06-22)
  exposure: number; // -1..1 (셰이더에서 exp2 → 0.5..2배)
  highlights: number; // -1..1
  shadows: number; // -1..1
  gamma: number; // 0.5..2 (1=중립)
  tint: number; // -1..1 (녹↔마젠타)
  vibrance: number; // -1..1
  hue: number; // -π..π
  sharpness: number; // 0..1
}

// 슬라이더 0~100(50=중립) → 셰이더 유니폼
export function colorUniforms(p: Record<string, number>): ColorUniforms {
  return {
    brightness: ((p.brightness ?? 50) - 50) / 100, // ±0.5
    contrast: 0.5 + (p.contrast ?? 50) / 100, // 0.5..1.5
    tone: ((p.tone ?? 50) - 50) / 50, // ±1
    white: ((p.white ?? 50) - 50) / 50, // ±1
    saturation: (p.saturation ?? 50) / 50, // 0..2, 50→1
    warmth: ((p.warmth ?? 50) - 50) / 50, // ±1
    // 확장
    exposure: ((p.exposure ?? 50) - 50) / 50, // ±1
    highlights: ((p.highlights ?? 50) - 50) / 50, // ±1
    shadows: ((p.shadows ?? 50) - 50) / 50, // ±1
    gamma: Math.pow(2, ((p.gamma ?? 50) - 50) / 50), // 0.5..2, 50→1
    tint: ((p.tint ?? 50) - 50) / 50, // ±1
    vibrance: ((p.vibrance ?? 50) - 50) / 50, // ±1
    hue: ((p.hue ?? 50) - 50) / 50 * Math.PI, // ±π
    sharpness: (p.sharpness ?? 0) / 100, // 0..1
  };
}
