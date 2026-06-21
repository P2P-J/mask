import { describe, it, expect } from "vitest";
import { parseResolution } from "./format";

describe("parseResolution", () => {
  it("'1920x1080' → {width:1920, height:1080}", () => {
    expect(parseResolution("1920x1080")).toEqual({ width: 1920, height: 1080 });
  });

  it("'1280x720' → {width:1280, height:720}", () => {
    expect(parseResolution("1280x720")).toEqual({ width: 1280, height: 720 });
  });

  it("형식이 잘못되면 throw(NaN 방지)", () => {
    expect(() => parseResolution("")).toThrow();
    expect(() => parseResolution("abc")).toThrow();
  });
});
