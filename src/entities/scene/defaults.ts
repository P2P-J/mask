import type { AppState, Layer } from "./types";
import { FILTER_PRESETS } from "../../shared/lib/filterPresets";

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
      params: {
        brightness: 50, contrast: 50, tone: 50, white: 50, saturation: 50, warmth: 50,
        // 확장(2026-06-22): 톤 디테일 + 색상 정밀 + 선명도
        exposure: 50, highlights: 50, shadows: 50, gamma: 50,
        tint: 50, vibrance: 50, hue: 50, sharpness: 0,
        // 2차 확장: 구조/페이드/비네트/그레인 + 스플릿톤
        structure: 50, fade: 0, vignette: 0, grain: 0, splitTone: 0, splitBalance: 50,
        // HSL 8밴드(빨강~자홍) H/S/L, 50=중립
        hslH0: 50, hslS0: 50, hslL0: 50, hslH1: 50, hslS1: 50, hslL1: 50,
        hslH2: 50, hslS2: 50, hslL2: 50, hslH3: 50, hslS3: 50, hslL3: 50,
        hslH4: 50, hslS4: 50, hslL4: 50, hslH5: 50, hslS5: 50, hslL5: 50,
        hslH6: 50, hslS6: 50, hslL6: 50, hslH7: 50, hslS7: 50, hslL7: 50,
      },
      colors: { splitShadow: "#3a5a6a", splitHighlight: "#6a5a3a" },
      selects: { hslBand: { value: "빨강", options: ["빨강", "주황", "노랑", "초록", "청록", "파랑", "보라", "자홍"] } },
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
      params: { lipstick: 0, blush: 0, eyeshadow: 0, eyebrow: 0, liner: 0, contour: 0, eyelash: 0 },
      colors: {
        lipstick: "#c85a64", blush: "#e8918c", eyeshadow: "#a87a6e",
        eyebrow: "#5a4636", liner: "#3a3030", contour: "#7a5a48", eyelash: "#1a1a1a",
      },
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
        // W4b 확장
        faceLength: 50, jawWidth: 0, temple: 0, cheekReduce: 0, cheekLift: 0,
        innerCorner: 0, outerCorner: 0, eyeHeight: 0, eyePosY: 50,
        philtrum: 50, lipWidth: 50, cupidBow: 0, noseRoot: 0, noseLength: 50, browDist: 50,
      },
    },
    {
      id: "filter",
      name: "필터",
      category: "face",
      enabled: false,
      params: { intensity: 100 },
      selects: { preset: { value: "없음", options: [...FILTER_PRESETS] } },
    },
    {
      id: "background",
      name: "배경/머리",
      category: "face",
      enabled: false,
      params: { blur: 70, headSize: 0 },
    },
  ];
}

// 렌더 순서(고정): 스무딩 → 색보정 → 치아 → 눈 → 리쉐이프(워프는 마지막)
export const LAYER_ORDER = ["smoothing", "color", "teeth", "eyeDetail", "makeup", "reshape", "filter", "background"] as const;

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
    overlayMesh: true,
  };
}

export function mergeDefaults(s: AppState): AppState {
  const defById = new Map(defaultLayers().map((l) => [l.id, l]));
  const scenes = s.scenes.map((sc) => ({
    ...sc,
    layers: sc.layers.map((l) => {
      const d = defById.get(l.id);
      if (!d) return l;
      return {
        ...l,
        params: { ...d.params, ...l.params },
        colors: d.colors || l.colors ? { ...(d.colors ?? {}), ...(l.colors ?? {}) } : l.colors,
        selects: d.selects || l.selects ? { ...(d.selects ?? {}), ...(l.selects ?? {}) } : l.selects,
      };
    }),
  }));
  return { ...s, scenes, overlayMesh: s.overlayMesh ?? true };
}
