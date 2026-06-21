import { describe, it, expect } from "vitest";
import { mergeDefaults, defaultState } from "./defaults";

describe("mergeDefaults", () => {
  it("레이어의 누락된 params/colors와 top-level overlayMesh를 기본값으로 채움", () => {
    const s = defaultState();
    // 구버전 흉내: makeup에 eyelash 없음, overlayMesh 없음
    const makeup = s.scenes[0].layers.find((l) => l.id === "makeup")!;
    delete (makeup.params as Record<string, number>).eyelash;
    delete (makeup.colors as Record<string, string>).eyelash;
    delete (s as { overlayMesh?: boolean }).overlayMesh;
    const merged = mergeDefaults(s);
    const m2 = merged.scenes[0].layers.find((l) => l.id === "makeup")!;
    expect(m2.params.eyelash).toBe(0);
    expect(m2.colors!.eyelash).toBe("#1a1a1a");
    expect(merged.overlayMesh).toBe(true);
  });

  it("기존 사용자 값은 보존", () => {
    const s = defaultState();
    s.scenes[0].layers.find((l) => l.id === "smoothing")!.params.strength = 99;
    s.overlayMesh = false;
    const merged = mergeDefaults(s);
    expect(merged.scenes[0].layers.find((l) => l.id === "smoothing")!.params.strength).toBe(99);
    expect(merged.overlayMesh).toBe(false);
  });
});
