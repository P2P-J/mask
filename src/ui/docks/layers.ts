import type { Store } from "../../entities/scene/store";
import { getCategoryLayers, toggleLayer, selectLayer } from "../../entities/scene/reducer";

export class LayersDock {
  private listEl = document.getElementById("layer-list") as HTMLElement;

  constructor(private store: Store) {
    this.store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const s = this.store.get();
    const layers = getCategoryLayers(s, s.activeCategory);
    this.listEl.innerHTML = "";
    layers.forEach((layer) => {
      const row = document.createElement("div");
      row.className = "row" + (layer.id === s.selectedLayerId ? " sel" : "");
      const eye = document.createElement("span");
      eye.className = "eye" + (layer.enabled ? "" : " off");
      eye.textContent = layer.enabled ? "◉" : "○";
      eye.addEventListener("click", (e) => {
        e.stopPropagation();
        this.store.update((st) => toggleLayer(st, layer.id));
      });
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = layer.name;
      row.append(eye, name);
      row.addEventListener("click", () => this.store.update((st) => selectLayer(st, layer.id)));
      this.listEl.appendChild(row);
    });
  }
}
