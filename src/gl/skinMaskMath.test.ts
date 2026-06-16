import { describe, it, expect } from "vitest";
import { maskUniforms } from "./skinMaskMath";

// 인덱스만 채운 가짜 랜드마크 배열 생성기
function lm(points: Record<number, [number, number]>) {
  const arr = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [i, [x, y]] of Object.entries(points)) arr[Number(i)] = { x, y, z: 0 };
  return arr as any;
}

describe("maskUniforms", () => {
  it("얼굴 중심은 좌우/상하 극점의 중점(uv, y 반전)", () => {
    // top=10, bottom=152, left=234, right=454
    const u = maskUniforms(lm({ 10: [0.5, 0.2], 152: [0.5, 0.8], 234: [0.3, 0.5], 454: [0.7, 0.5] }));
    expect(u.faceC[0]).toBeCloseTo(0.5, 5); // (0.3+0.7)/2
    expect(u.faceC[1]).toBeCloseTo(0.5, 5); // (1-0.2 + 1-0.8)/2 = (0.8+0.2)/2
  });

  it("얼굴 반경은 폭/높이 절반에 여유배율(1.1)", () => {
    const u = maskUniforms(lm({ 10: [0.5, 0.2], 152: [0.5, 0.8], 234: [0.3, 0.5], 454: [0.7, 0.5] }));
    expect(u.faceR[0]).toBeCloseTo(0.2 * 1.1, 5); // (0.7-0.3)/2 * 1.1
    expect(u.faceR[1]).toBeCloseTo(0.3 * 1.1, 5); // ((1-0.2)-(1-0.8))/2 *1.1 = 0.3*1.1
  });

  it("입 중심은 13/14 중점(y 반전)", () => {
    const u = maskUniforms(lm({ 13: [0.5, 0.6], 14: [0.5, 0.62] }));
    expect(u.mouth[1]).toBeCloseTo(1 - 0.61, 5);
  });
});
