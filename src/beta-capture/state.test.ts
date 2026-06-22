import { describe, it, expect } from "vitest";
import { hasConsent, setConsent } from "./state";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("consent state", () => {
  it("기본은 미동의", () => {
    expect(hasConsent(fakeStorage())).toBe(false);
  });
  it("동의 저장 후 true", () => {
    const s = fakeStorage();
    setConsent(true, s);
    expect(hasConsent(s)).toBe(true);
  });
  it("동의 철회 후 false", () => {
    const s = fakeStorage();
    setConsent(true, s);
    setConsent(false, s);
    expect(hasConsent(s)).toBe(false);
  });
});
