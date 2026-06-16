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
});
