import type { AppState, Layer } from "./types";

export function defaultLayers(): Layer[] {
  return [
    {
      id: "smoothing",
      name: "피부",
      category: "face",
      enabled: true,
      params: { strength: 45, texture: 70, clarity: 0, evenTone: 0, brighten: 0, darkCircle: 0 },
    },
    {
      id: "color",
      name: "색보정",
      category: "face",
      enabled: false,
      params: { brightness: 50, contrast: 50, tone: 50, white: 50, saturation: 50, warmth: 50 },
    },
    {
      id: "teeth",
      name: "치아 화이트닝",
      category: "face",
      enabled: false,
      params: { whiten: 60 },
    },
    {
      id: "eyeDetail",
      name: "눈",
      category: "face",
      enabled: false,
      params: { eyeBrighten: 0, aegyo: 0 },
    },
    {
      id: "makeup",
      name: "메이크업",
      category: "face",
      enabled: false,
      params: { lipstick: 0, blush: 0, eyeshadow: 0, eyebrow: 0 },
      colors: { lipstick: "#c85a64", blush: "#e8918c", eyeshadow: "#a87a6e", eyebrow: "#5a4636" },
    },
    {
      id: "reshape",
      name: "윤곽/리쉐이프",
      category: "face",
      enabled: false,
      params: {
        slim: 0, faceSize: 0, cheekbone: 0, jaw: 0, chinLength: 50, forehead: 0,
        eyeSize: 0, eyeSpacing: 50, eyeCorner: 50, pupil: 0,
        noseSize: 0, noseBridge: 0, noseTip: 0, noseWing: 0,
        mouthSize: 0, lipThick: 0, smile: 0, browHeight: 0,
      },
    },
  ];
}

// 렌더 순서(고정): 스무딩 → 색보정 → 치아 → 눈 → 리쉐이프(워프는 마지막)
export const LAYER_ORDER = ["smoothing", "color", "teeth", "eyeDetail", "makeup", "reshape"] as const;

export const CATEGORIES = [
  { id: "face", name: "얼굴", enabled: true },
  { id: "body", name: "몸매", enabled: false },
  { id: "filter", name: "필터", enabled: false },
  { id: "makeup", name: "화장", enabled: false },
  { id: "bg", name: "배경", enabled: false },
] as const;

export function defaultState(): AppState {
  return {
    scenes: [{ id: "scene-1", name: "장면 1", layers: defaultLayers() }],
    activeSceneId: "scene-1",
    activeCategory: "face",
    selectedLayerId: "smoothing",
  };
}
