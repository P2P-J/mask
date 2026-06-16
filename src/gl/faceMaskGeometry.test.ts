import { describe, it, expect } from "vitest";
import { regionIndices, buildFan } from "./faceMaskGeometry";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

describe("faceMaskGeometry", () => {
  it("regionIndices: 연결쌍에서 유니크 인덱스만", () => {
    expect(regionIndices([{ start: 1, end: 2 }, { start: 2, end: 3 }, { start: 3, end: 1 }])).toEqual([
      1, 2, 3,
    ]);
  });

  it("buildFan: N점 → 삼각형 팬 3N 정점(6N float)", () => {
    const lm = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ] as NormalizedLandmark[];
    const f = buildFan(lm, [0, 1, 2, 3]);
    expect(f).toBeInstanceOf(Float32Array);
    expect(f.length).toBe(4 * 3 * 2); // 4팬삼각형 × 3정점 × 2좌표 = 24
  });

  it("buildFan: 좌표를 클립공간으로 변환(x=2lx-1, y=1-2ly)", () => {
    const lm = [{ x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }] as NormalizedLandmark[];
    const f = buildFan(lm, [0, 1, 2]);
    // 모든 점이 (0.5,0.5) → 클립 (0,0). 모든 좌표가 0 근처.
    for (const v of f) expect(Math.abs(v)).toBeLessThan(1e-6);
  });
});
