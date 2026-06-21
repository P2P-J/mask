import { describe, it, expect } from "vitest";
import { LandmarkSmoother } from "./landmarkSmoother";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

function pt(x: number, y: number): NormalizedLandmark {
  return { x, y, z: 0 } as NormalizedLandmark;
}

describe("LandmarkSmoother", () => {
  it("첫 프레임은 raw 그대로 통과", () => {
    const s = new LandmarkSmoother(0.35);
    const out = s.smooth([pt(0.2, 0.4)]);
    expect(out![0].x).toBeCloseTo(0.2);
    expect(out![0].y).toBeCloseTo(0.4);
  });

  it("둘째 프레임은 raw와 prev 사이로 평활", () => {
    const s = new LandmarkSmoother(0.5);
    s.smooth([pt(0, 0)]);
    const out = s.smooth([pt(1, 1)]);
    expect(out![0].x).toBeCloseTo(0.5); // 0.5*1 + 0.5*0
  });

  it("null이면 null 반환 + 리셋(다음 raw 그대로)", () => {
    const s = new LandmarkSmoother(0.5);
    s.smooth([pt(0, 0)]);
    expect(s.smooth(null)).toBeNull();
    const out = s.smooth([pt(0.8, 0.8)]);
    expect(out![0].x).toBeCloseTo(0.8); // 리셋되어 raw 통과
  });

  it("랜드마크 개수 바뀌면 raw 그대로(재시작)", () => {
    const s = new LandmarkSmoother(0.5);
    s.smooth([pt(0, 0)]);
    const out = s.smooth([pt(1, 1), pt(0.3, 0.3)]);
    expect(out!.length).toBe(2);
    expect(out![0].x).toBeCloseTo(1);
  });
});
