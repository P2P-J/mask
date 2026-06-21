import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type FaceShape = "oval" | "round" | "square" | "long" | "heart";

export interface FaceRatios {
  whRatio: number;        // 광대폭 / 얼굴높이
  jawToCheek: number;     // 턱폭 / 광대폭
  foreheadToCheek: number;// 이마폭 / 광대폭
  chinRatio: number;      // 하관(코밑~턱) / 전체높이
}

export interface FaceProfile {
  shape: FaceShape;
  ratios: FaceRatios;
  recommended: Record<string, number>;
}

export function classifyShape(r: FaceRatios): FaceShape {
  if (r.whRatio < 0.78) return "long";
  if (r.foreheadToCheek > 1.0 && r.jawToCheek < 0.78) return "heart";
  if (r.jawToCheek > 0.93) return r.whRatio > 0.95 ? "round" : "square";
  if (r.whRatio > 0.95) return "round";
  return "oval";
}

export function recommendReshape(shape: FaceShape): Record<string, number> {
  switch (shape) {
    case "round": return { slim: 30, cheekbone: 25, jaw: 20, faceSize: 15 };
    case "long": return { chinLength: 40, forehead: 20 }; // chinLength 50=중립, <50=짧게
    case "square": return { jaw: 35, slim: 15 };
    case "heart": return { cheekbone: 15, jaw: 10 };
    case "oval": default: return {};
  }
}

function d(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 단일 프레임 비율
function frameRatios(lm: NormalizedLandmark[]): FaceRatios {
  const cheekW = d(lm[234], lm[454]);
  const jawW = d(lm[172], lm[397]);
  const foreheadW = d(lm[54], lm[284]);
  const faceH = d(lm[10], lm[152]);
  const lowerH = d(lm[2], lm[152]); // 코밑~턱
  return {
    whRatio: cheekW / faceH,
    jawToCheek: jawW / cheekW,
    foreheadToCheek: foreheadW / cheekW,
    chinRatio: lowerH / faceH,
  };
}

export function analyzeFace(frames: NormalizedLandmark[][]): FaceProfile {
  const valid = frames.filter((f) => f && f.length >= 468);
  if (valid.length === 0) {
    const ratios: FaceRatios = { whRatio: 0.85, jawToCheek: 0.82, foreheadToCheek: 0.9, chinRatio: 0.5 };
    return { shape: "oval", ratios, recommended: {} };
  }
  const sum: FaceRatios = { whRatio: 0, jawToCheek: 0, foreheadToCheek: 0, chinRatio: 0 };
  for (const f of valid) {
    const r = frameRatios(f);
    sum.whRatio += r.whRatio; sum.jawToCheek += r.jawToCheek;
    sum.foreheadToCheek += r.foreheadToCheek; sum.chinRatio += r.chinRatio;
  }
  const n = valid.length;
  const ratios: FaceRatios = {
    whRatio: sum.whRatio / n, jawToCheek: sum.jawToCheek / n,
    foreheadToCheek: sum.foreheadToCheek / n, chinRatio: sum.chinRatio / n,
  };
  const shape = classifyShape(ratios);
  return { shape, ratios, recommended: recommendReshape(shape) };
}

export const SHAPE_LABEL_KO: Record<FaceShape, string> = {
  oval: "계란형", round: "둥근형", square: "각진형", long: "긴 얼굴형", heart: "하트형",
};
