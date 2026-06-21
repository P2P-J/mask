import { describe, it, expect } from "vitest";
import { FpsMeter, LatencyMeter } from "./metrics";

describe("FpsMeter", () => {
  it("두 번째 tick 전에는 0", () => {
    const m = new FpsMeter(1);
    expect(m.value()).toBe(0);
    m.tick(0);
    expect(m.value()).toBe(0);
  });

  it("alpha=1이면 순간 FPS 계산 (dt 20ms → 50fps)", () => {
    const m = new FpsMeter(1);
    m.tick(0);
    m.tick(20);
    expect(m.value()).toBeCloseTo(50, 5);
  });

  it("dt가 0이면 무시", () => {
    const m = new FpsMeter(1);
    m.tick(10);
    m.tick(10);
    expect(m.value()).toBe(0);
  });
});

describe("LatencyMeter", () => {
  it("첫 값은 그대로", () => {
    const l = new LatencyMeter(0.5);
    l.record(10);
    expect(l.avg()).toBe(10);
  });

  it("EMA 적용 (0.5*20 + 0.5*10 = 15)", () => {
    const l = new LatencyMeter(0.5);
    l.record(10);
    l.record(20);
    expect(l.avg()).toBeCloseTo(15, 5);
  });
});
