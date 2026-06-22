import { describe, it, expect } from "vitest";
import { pickMime } from "./capture";

describe("pickMime", () => {
  it("mp4 지원되면 mp4 선호", () => {
    expect(pickMime((t) => t === "video/mp4;codecs=h264")).toBe("video/mp4;codecs=h264");
  });
  it("mp4 미지원이면 webm/vp8", () => {
    expect(pickMime((t) => t.startsWith("video/webm"))).toBe("video/webm;codecs=vp8");
  });
  it("아무것도 보고 안 되면 video/webm 폴백", () => {
    expect(pickMime(() => false)).toBe("video/webm");
  });
});
