import type { Store } from "../../entities/scene/store";
import { getCategoryLayers, toggleLayer, selectLayer } from "../../entities/scene/reducer";
import { LAYER_ICONS, LAYER_GROUPS } from "./layerIcons";

export class LayersDock {
  private listEl = document.getElementById("layer-list") as HTMLElement;

  constructor(private store: Store) {
    this.store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const s = this.store.get();
    const layers = getCategoryLayers(s, s.activeCategory);
    const byId = new Map(layers.map((l) => [l.id, l]));
    this.listEl.innerHTML = "";
    for (const group of LAYER_GROUPS) {
      const groupLayers = group.ids.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
      if (groupLayers.length === 0) continue;
      const header = document.createElement("div");
      header.className = "lyr-group-header";
      header.textContent = group.title;
      this.listEl.appendChild(header);
      for (const layer of groupLayers) {
        const row = document.createElement("div");
        row.className = "row lyr-row" + (layer.id === s.selectedLayerId ? " sel" : "") + (layer.enabled ? "" : " layer-off");
        const icon = document.createElement("span");
        icon.className = "lyr-icon";
        icon.innerHTML = LAYER_ICONS[layer.id] ?? "";
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = layer.name;
        const sw = document.createElement("button");
        sw.className = "tds-switch";
        sw.type = "button";
        sw.setAttribute("role", "switch");
        sw.setAttribute("aria-checked", String(layer.enabled));
        sw.classList.toggle("on", layer.enabled);
        sw.addEventListener("click", (e) => {
          e.stopPropagation();
          this.store.update((st) => toggleLayer(st, layer.id));
        });
        row.append(icon, name, sw);
        row.addEventListener("click", () => this.store.update((st) => selectLayer(st, layer.id)));
        this.listEl.appendChild(row);
      }
    }
  }
}
