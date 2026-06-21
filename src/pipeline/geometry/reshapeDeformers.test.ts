import { describe, it, expect } from "vitest";
import { buildDeformers, MAX_DEFORMERS } from "./reshapeDeformers";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

function face(): NormalizedLandmark[] {
  const arr = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 })) as NormalizedLandmark[];
  arr[234] = { x: 0.3, y: 0.5, z: 0 } as NormalizedLandmark; // 좌
  arr[454] = { x: 0.7, y: 0.5, z: 0 } as NormalizedLandmark; // 우
  arr[10] = { x: 0.5, y: 0.2, z: 0 } as NormalizedLandmark; // 이마
  arr[152] = { x: 0.5, y: 0.85, z: 0 } as NormalizedLandmark; // 턱
  arr[33] = { x: 0.4, y: 0.42, z: 0 } as NormalizedLandmark;
  arr[133] = { x: 0.46, y: 0.42, z: 0 } as NormalizedLandmark;
  arr[263] = { x: 0.6, y: 0.42, z: 0 } as NormalizedLandmark;
  arr[362] = { x: 0.54, y: 0.42, z: 0 } as NormalizedLandmark;
  return arr;
}

describe("buildDeformers", () => {
  it("모든 파라미터 0 → deformer 없음", () => {
    const d = buildDeformers(face(), {});
    expect(d.count).toBe(0);
  });

  it("eyeSize>0 → 양쪽 눈 2개 deformer(양수 scale = 확대)", () => {
    const d = buildDeformers(face(), { eyeSize: 100 });
    expect(d.count).toBe(2);
    expect(d.defB[0]).toBeGreaterThan(0); // 첫 deformer sx > 0 (확대)
  });

  it("count는 MAX_DEFORMERS를 넘지 않음", () => {
    const all = {
      slim: 100, faceSize: 100, cheekbone: 100, jaw: 100, chinLength: 100, forehead: 100,
      eyeSize: 100, eyeSpacing: 100, eyeCorner: 100,
      noseSize: 100, noseBridge: 100, noseTip: 100, noseWing: 100,
      mouthSize: 100, lipThick: 100, smile: 100, browHeight: 100,
    };
    const d = buildDeformers(face(), all);
    expect(d.count).toBeLessThanOrEqual(MAX_DEFORMERS);
    expect(d.count).toBeGreaterThan(10);
  });
});
