import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "./persist";
import { defaultState } from "./defaults";

describe("persist", () => {
  it("직렬화 후 역직렬화하면 동일 상태", () => {
    const s = defaultState();
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("손상된 입력은 null", () => {
    expect(deserialize("{not json")).toBeNull();
    expect(deserialize("null")).toBeNull();
    expect(deserialize('{"scenes":[]}')).toBeNull(); // scenes 비면 무효
  });

  it("빈 레이어 배열을 가진 씬은 거부(null)", () => {
    const s = defaultState();
    s.scenes[0].layers = [];
    expect(deserialize(serialize(s))).toBeNull();
  });
});
