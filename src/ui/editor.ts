import type { Store } from "../state/store";
import { getSelectedLayer, setParam } from "../state/reducer";

// 슬라이더 라벨(한국어)
const LABELS: Record<string, string> = {
  strength: "강도", texture: "질감 보존",
  brightness: "밝기", contrast: "대비", tone: "톤", white: "화이트밸런스",
  saturation: "채도", warmth: "따뜻함",
  whiten: "화이트닝",
  slim: "얼굴 갸름", faceSize: "작은 얼굴", jaw: "V라인 턱", chin: "턱 길이", forehead: "이마 축소",
  eyeSize: "눈 크게", noseSize: "코 축소", mouthSize: "입 크기", lipThick: "입술 도톰",
  smile: "입꼬리(미소)", browLift: "눈썹 올리기",
};

export class EditorDock {
  private titleEl = document.getElementById("editor-title") as HTMLElement;
  private bodyEl = document.getElementById("editor-body") as HTMLElement;
  private suppress = false; // 슬라이더 드래그 중 자기 유발 재렌더 차단(드래그 끊김 방지)

  constructor(private store: Store) {
    this.store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    if (this.suppress) return;
    const layer = getSelectedLayer(this.store.get());
    this.titleEl.textContent = `편집 — ${layer.name}`;
    this.bodyEl.innerHTML = "";
    const keys = Object.keys(layer.params);
    if (keys.length === 0) {
      const e = document.createElement("div");
      e.className = "editor-empty";
      e.textContent = "조절할 항목이 없습니다";
      this.bodyEl.appendChild(e);
      return;
    }
    keys.forEach((key) => {
      const wrap = document.createElement("div");
      wrap.className = "slider-row";
      const label = document.createElement("div");
      label.className = "label";
      const val = document.createElement("b");
      val.textContent = String(layer.params[key]);
      const span = document.createElement("span");
      span.textContent = LABELS[key] ?? key;
      label.append(span, val);
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0"; slider.max = "100";
      slider.value = String(layer.params[key]);
      slider.addEventListener("input", () => {
        val.textContent = slider.value;
        // suppress로 자기 유발 재렌더를 막아 드래그 중 슬라이더 DOM이 파괴되지 않게 함.
        // store는 갱신되므로 GL 프리뷰는 다음 프레임에 즉시 반영됨.
        this.suppress = true;
        this.store.update((st) => setParam(st, layer.id, key, Number(slider.value)));
        this.suppress = false;
      });
      wrap.append(label, slider);
      this.bodyEl.appendChild(wrap);
    });
  }
}
