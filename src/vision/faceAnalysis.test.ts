import { describe, it, expect } from "vitest";
import { classifyShape, recommendReshape } from "./faceAnalysis";

describe("classifyShape", () => {
  it("긴 얼굴: whRatio 낮음 → long", () => {
    expect(classifyShape({ whRatio: 0.72, jawToCheek: 0.8, foreheadToCheek: 0.85, chinRatio: 0.5 })).toBe("long");
  });
  it("둥근 얼굴: whRatio 높음 + 턱넓음 → round", () => {
    expect(classifyShape({ whRatio: 0.98, jawToCheek: 0.92, foreheadToCheek: 0.9, chinRatio: 0.5 })).toBe("round");
  });
  it("각진 얼굴: 턱폭 큼 → square", () => {
    expect(classifyShape({ whRatio: 0.86, jawToCheek: 0.95, foreheadToCheek: 0.9, chinRatio: 0.5 })).toBe("square");
  });
  it("하트형: 이마 넓고 턱 좁음 → heart", () => {
    expect(classifyShape({ whRatio: 0.86, jawToCheek: 0.7, foreheadToCheek: 1.02, chinRatio: 0.5 })).toBe("heart");
  });
  it("그 외 → oval", () => {
    expect(classifyShape({ whRatio: 0.85, jawToCheek: 0.82, foreheadToCheek: 0.9, chinRatio: 0.5 })).toBe("oval");
  });
});

describe("recommendReshape", () => {
  it("round 추천엔 slim/cheekbone 포함", () => {
    const r = recommendReshape("round");
    expect(r.slim).toBeGreaterThan(0);
    expect(r.cheekbone).toBeGreaterThan(0);
  });
  it("oval 추천은 비어있음(거의 없음)", () => {
    expect(Object.keys(recommendReshape("oval")).length).toBe(0);
  });
});
