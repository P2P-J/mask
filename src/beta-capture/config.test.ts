import { describe, it, expect } from "vitest";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("토큰/chatId 둘 다 있어야 설정 반환, 기본 클립10초·15fps", () => {
    const c = parseConfig({ token: "T", chatId: "C" });
    expect(c).toEqual({ token: "T", chatId: "C", clipSeconds: 10, fps: 15 });
  });
  it("토큰 없으면 null", () => {
    expect(parseConfig({ token: "", chatId: "C" })).toBeNull();
  });
  it("chatId 없으면 null", () => {
    expect(parseConfig({ token: "T", chatId: "" })).toBeNull();
  });
  it("undefined 입력도 null(크래시 금지)", () => {
    expect(parseConfig(undefined)).toBeNull();
  });
});
