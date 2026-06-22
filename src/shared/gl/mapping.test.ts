import { describe, it, expect } from "vitest";
import { colorUniforms } from "./mapping";

describe("colorUniforms", () => {
  it("기본 50은 무변화(brightness 0, contrast 1, tone 0, white 0)", () => {
    const u = colorUniforms({ brightness: 50, contrast: 50, tone: 50, white: 50 });
    expect(u.brightness).toBeCloseTo(0, 5);
    expect(u.contrast).toBeCloseTo(1, 5);
    expect(u.tone).toBeCloseTo(0, 5);
    expect(u.white).toBeCloseTo(0, 5);
  });

  it("brightness 100 → +0.5, 0 → -0.5", () => {
    expect(colorUniforms({ brightness: 100, contrast: 50, tone: 50, white: 50 }).brightness).toBeCloseTo(0.5, 5);
    expect(colorUniforms({ brightness: 0, contrast: 50, tone: 50, white: 50 }).brightness).toBeCloseTo(-0.5, 5);
  });

  it("contrast 0 → 0.5, 100 → 1.5", () => {
    expect(colorUniforms({ brightness: 50, contrast: 0, tone: 50, white: 50 }).contrast).toBeCloseTo(0.5, 5);
    expect(colorUniforms({ brightness: 50, contrast: 100, tone: 50, white: 50 }).contrast).toBeCloseTo(1.5, 5);
  });

  it("신규 양방향 키: 50 → 중립", () => {
    const u = colorUniforms({ exposure: 50, highlights: 50, shadows: 50, gamma: 50, tint: 50, vibrance: 50, hue: 50 });
    expect(u.exposure).toBeCloseTo(0, 5); // exp2(0)=1배
    expect(u.highlights).toBeCloseTo(0, 5);
    expect(u.shadows).toBeCloseTo(0, 5);
    expect(u.gamma).toBeCloseTo(1, 5); // 감마 1=무변화
    expect(u.tint).toBeCloseTo(0, 5);
    expect(u.vibrance).toBeCloseTo(0, 5);
    expect(u.hue).toBeCloseTo(0, 5);
  });

  it("누락 키는 중립 기본값(sharpness 0)", () => {
    const u = colorUniforms({ brightness: 50, contrast: 50, tone: 50, white: 50 });
    expect(u.exposure).toBeCloseTo(0, 5);
    expect(u.gamma).toBeCloseTo(1, 5);
    expect(u.sharpness).toBeCloseTo(0, 5);
  });

  it("exposure 100 → +1, 0 → -1", () => {
    expect(colorUniforms({ exposure: 100 }).exposure).toBeCloseTo(1, 5);
    expect(colorUniforms({ exposure: 0 }).exposure).toBeCloseTo(-1, 5);
  });

  it("gamma 100 → 2, 0 → 0.5", () => {
    expect(colorUniforms({ gamma: 100 }).gamma).toBeCloseTo(2, 5);
    expect(colorUniforms({ gamma: 0 }).gamma).toBeCloseTo(0.5, 5);
  });

  it("hue 100 → +π, 0 → -π", () => {
    expect(colorUniforms({ hue: 100 }).hue).toBeCloseTo(Math.PI, 5);
    expect(colorUniforms({ hue: 0 }).hue).toBeCloseTo(-Math.PI, 5);
  });

  it("sharpness 100 → 1", () => {
    expect(colorUniforms({ sharpness: 100 }).sharpness).toBeCloseTo(1, 5);
  });

  it("2차 확장 중립/꺼짐 기본값", () => {
    const u = colorUniforms({ structure: 50 });
    expect(u.structure).toBeCloseTo(0, 5);
    expect(u.fade).toBeCloseTo(0, 5);
    expect(u.vignette).toBeCloseTo(0, 5);
    expect(u.grain).toBeCloseTo(0, 5);
    expect(u.splitTone).toBeCloseTo(0, 5);
    expect(u.splitBalance).toBeCloseTo(0, 5);
  });

  it("structure 100 → +1, 0 → -1 / fade·vignette·grain·splitTone 100 → 1", () => {
    expect(colorUniforms({ structure: 100 }).structure).toBeCloseTo(1, 5);
    expect(colorUniforms({ structure: 0 }).structure).toBeCloseTo(-1, 5);
    expect(colorUniforms({ fade: 100 }).fade).toBeCloseTo(1, 5);
    expect(colorUniforms({ vignette: 100 }).vignette).toBeCloseTo(1, 5);
    expect(colorUniforms({ grain: 100 }).grain).toBeCloseTo(1, 5);
    expect(colorUniforms({ splitTone: 100 }).splitTone).toBeCloseTo(1, 5);
    expect(colorUniforms({ splitBalance: 100 }).splitBalance).toBeCloseTo(1, 5);
  });
});
