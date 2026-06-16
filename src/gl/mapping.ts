export interface ColorUniforms {
  brightness: number; // -0.5..0.5
  contrast: number; // 0.5..1.5
  tone: number; // -1..1 (warm/cool)
  white: number; // -1..1
}

// 슬라이더 0~100(50=중립) → 셰이더 유니폼
export function colorUniforms(p: Record<string, number>): ColorUniforms {
  return {
    brightness: (p.brightness - 50) / 100, // ±0.5
    contrast: 0.5 + p.contrast / 100, // 0.5..1.5
    tone: (p.tone - 50) / 50, // ±1
    white: (p.white - 50) / 50, // ±1
  };
}
