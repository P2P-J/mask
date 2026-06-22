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
  // 2차 확장(경쟁 앱 갭 보완)
  structure: number; // -1..1 (로컬 대비)
  fade: number; // 0..1 (매트)
  vignette: number; // 0..1
  grain: number; // 0..1
  splitTone: number; // 0..1 (강도)
  splitBalance: number; // -1..1 (그림자/하이라이트 경계)
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
    // 2차 확장
    structure: ((p.structure ?? 50) - 50) / 50, // ±1
    fade: (p.fade ?? 0) / 100, // 0..1
    vignette: (p.vignette ?? 0) / 100, // 0..1
    grain: (p.grain ?? 0) / 100, // 0..1
    splitTone: (p.splitTone ?? 0) / 100, // 0..1
    splitBalance: ((p.splitBalance ?? 50) - 50) / 50, // ±1
  };
}

// HSL 8밴드 — 활성 밴드 select 옵션(한국어) ↔ hue center(turns 0..1)
// ⚠ passes.ts COLOR_FS 의 HSL_CENTERS[8] 와 순서·center 동일 유지(editor 밴드 인덱스가 양쪽 위치에 의존).
export const HSL_BANDS = [
  { name: "빨강", center: 0 / 360 },
  { name: "주황", center: 30 / 360 },
  { name: "노랑", center: 60 / 360 },
  { name: "초록", center: 120 / 360 },
  { name: "청록", center: 180 / 360 },
  { name: "파랑", center: 240 / 360 },
  { name: "보라", center: 280 / 360 },
  { name: "자홍", center: 320 / 360 },
] as const;

// params 의 hslH0..7 / hslS0..7 / hslL0..7(50중립) → 셰이더 배열(-1..1)
export function hslArrays(p: Record<string, number>): { h: Float32Array; s: Float32Array; l: Float32Array } {
  const h = new Float32Array(8);
  const s = new Float32Array(8);
  const l = new Float32Array(8);
  for (let i = 0; i < 8; i++) {
    h[i] = ((p[`hslH${i}`] ?? 50) - 50) / 50;
    s[i] = ((p[`hslS${i}`] ?? 50) - 50) / 50;
    l[i] = ((p[`hslL${i}`] ?? 50) - 50) / 50;
  }
  return { h, s, l };
}

// "#rrggbb" → [r,g,b] 0..1 (실패 시 중립 회색 0.5)
export function hexToRgb(hex: string | undefined): [number, number, number] {
  if (!hex || hex.length < 7) return [0.5, 0.5, 0.5];
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [Number.isNaN(r) ? 0.5 : r, Number.isNaN(g) ? 0.5 : g, Number.isNaN(b) ? 0.5 : b];
}
