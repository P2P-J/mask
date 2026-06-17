import { describe, it, expect } from "vitest";
import {
  regionIndices,
  buildFan,
  trianglesFromConnections,
  buildMeshVerts,
  faceCenterRadius,
} from "./faceMaskGeometry";
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

  it("trianglesFromConnections: 에지 집합에서 삼각형 복원·중복제거", () => {
    // 사각형 0-1-2-3 + 대각선 0-2 → 삼각형 (0,1,2),(0,2,3)
    const edges = [
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 0 },
      { start: 2, end: 3 },
      { start: 3, end: 0 },
    ];
    const t = trianglesFromConnections(edges);
    expect(t.length).toBe(6); // 삼각형 2개
    const keys = new Set<string>();
    for (let i = 0; i < t.length; i += 3) {
      keys.add([t[i], t[i + 1], t[i + 2]].sort((a, b) => a - b).join("-"));
    }
    expect(keys).toEqual(new Set(["0-1-2", "0-2-3"]));
  });

  it("faceCenterRadius: 극점 중점/반경(y 반전)", () => {
    const arr = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 })) as NormalizedLandmark[];
    arr[10] = { x: 0.5, y: 0.2, z: 0 } as NormalizedLandmark;
    arr[152] = { x: 0.5, y: 0.8, z: 0 } as NormalizedLandmark;
    arr[234] = { x: 0.3, y: 0.5, z: 0 } as NormalizedLandmark;
    arr[454] = { x: 0.7, y: 0.5, z: 0 } as NormalizedLandmark;
    const f = faceCenterRadius(arr);
    expect(f.cx).toBeCloseTo(0.5);
    expect(f.cy).toBeCloseTo(0.5); // (1-0.2 + 1-0.8)/2
    expect(f.rx).toBeCloseTo(0.2);
    expect(f.ry).toBeCloseTo(0.3);
  });

  it("buildMeshVerts: 삼각형 인덱스 → 클립공간 정점", () => {
    const lm = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }] as NormalizedLandmark[];
    const v = buildMeshVerts(lm, [0, 1, 0]);
    expect(v.length).toBe(6);
    expect(v[0]).toBeCloseTo(-1); // 0→2*0-1
    expect(v[1]).toBeCloseTo(1); //  0→1-2*0
    expect(v[2]).toBeCloseTo(1); //  1→2*1-1
    expect(v[3]).toBeCloseTo(-1); // 1→1-2*1
  });
});
