import type { Store } from "../state/store";
import { getSelectedLayer, setParam } from "../state/reducer";

// 슬라이더 라벨(한국어)
const LABELS: Record<string, string> = {
  strength: "강도", texture: "질감 보존",
  brightness: "밝기", contrast: "대비", tone: "톤", white: "화이트밸런스",
};

export class EditorDock {
  private titleEl = document.getElementById("editor-title") as HTMLElement;
  private bodyEl = document.getElementById("editor-body") as HTMLElement;

  constructor(private store: Store) {
    this.store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
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
        this.store.update((st) => setParam(st, layer.id, key, Number(slider.value)));
      });
      wrap.append(label, slider);
      this.bodyEl.appendChild(wrap);
    });
  }
}
