import { describe, it, expect } from "vitest";
import { defaultState } from "./defaults";
import {
  getActiveScene,
  getSelectedLayer,
  setParam,
  toggleLayer,
  selectLayer,
  switchScene,
  addScene,
} from "./reducer";

describe("reducer", () => {
  it("setParam은 활성 장면의 레이어 param만 바꾸고 불변", () => {
    const s0 = defaultState();
    const s1 = setParam(s0, "color", "brightness", 80);
    expect(getActiveScene(s1).layers.find((l) => l.id === "color")!.params.brightness).toBe(80);
    // 불변성: 원본 유지
    expect(getActiveScene(s0).layers.find((l) => l.id === "color")!.params.brightness).toBe(50);
  });

  it("toggleLayer는 enabled를 뒤집음", () => {
    const s0 = defaultState();
    const s1 = toggleLayer(s0, "color");
    expect(getActiveScene(s1).layers.find((l) => l.id === "color")!.enabled).toBe(true);
  });

  it("selectLayer는 선택 레이어 변경", () => {
    const s1 = selectLayer(defaultState(), "color");
    expect(s1.selectedLayerId).toBe("color");
    expect(getSelectedLayer(s1).id).toBe("color");
  });

  it("addScene은 현재 장면 보정값을 복제한 새 장면을 활성화", () => {
    let s = setParam(defaultState(), "color", "brightness", 80);
    s = addScene(s, "장면 2");
    expect(s.scenes.length).toBe(2);
    expect(s.activeSceneId).not.toBe("scene-1");
    expect(getActiveScene(s).layers.find((l) => l.id === "color")!.params.brightness).toBe(80);
    // 새 장면 편집이 원래 장면에 영향 없음
    const s2 = setParam(s, "color", "brightness", 10);
    expect(s2.scenes[0].layers.find((l) => l.id === "color")!.params.brightness).toBe(80);
  });

  it("switchScene은 활성 장면 변경", () => {
    let s = addScene(defaultState(), "장면 2");
    s = switchScene(s, "scene-1");
    expect(s.activeSceneId).toBe("scene-1");
  });
});
