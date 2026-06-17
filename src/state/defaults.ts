import type { AppState, Layer } from "./types";

export function defaultLayers(): Layer[] {
  return [
    {
      id: "smoothing",
      name: "피부 스무딩",
      category: "face",
      enabled: true,
      params: { strength: 45, texture: 70 },
    },
    {
      id: "color",
      name: "색보정",
      category: "face",
      enabled: false,
      params: { brightness: 50, contrast: 50, tone: 50, white: 50, saturation: 50, warmth: 50 },
    },
  ];
}

// 렌더 순서(고정): 스무딩 → 색보정
export const LAYER_ORDER = ["smoothing", "color"] as const;

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
