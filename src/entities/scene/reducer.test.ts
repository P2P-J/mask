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
  renameScene,
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

  it("addScene은 기본값으로 새 장면을 추가·활성화(복제 아님)", () => {
    let s = setParam(defaultState(), "color", "brightness", 80);
    s = addScene(s, "장면 2");
    expect(s.scenes.length).toBe(2);
    expect(s.activeSceneId).not.toBe("scene-1");
    // 새 장면은 기본값(50) — 원래 장면의 80을 복제하지 않음
    expect(getActiveScene(s).layers.find((l) => l.id === "color")!.params.brightness).toBe(50);
    // 원래 장면은 그대로 80
    expect(s.scenes[0].layers.find((l) => l.id === "color")!.params.brightness).toBe(80);
  });

  it("renameScene은 해당 장면 이름만 변경", () => {
    let s = addScene(defaultState(), "장면 2");
    const id = s.activeSceneId;
    s = renameScene(s, id, "방송용");
    expect(s.scenes.find((sc) => sc.id === id)!.name).toBe("방송용");
    expect(s.scenes[0].name).toBe("장면 1"); // 다른 장면 영향 없음
  });

  it("switchScene은 활성 장면 변경", () => {
    let s = addScene(defaultState(), "장면 2");
    s = switchScene(s, "scene-1");
    expect(s.activeSceneId).toBe("scene-1");
  });
});
