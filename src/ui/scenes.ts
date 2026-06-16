import type { Store } from "../state/store";
import { switchScene, addScene } from "../state/reducer";

export class ScenesDock {
  private listEl = document.getElementById("scene-list") as HTMLElement;
  private addEl = document.getElementById("scene-add") as HTMLButtonElement;

  constructor(private store: Store) {
    this.addEl.addEventListener("click", () => {
      const n = this.store.get().scenes.length + 1;
      this.store.update((s) => addScene(s, `장면 ${n}`));
    });
    this.store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const s = this.store.get();
    this.listEl.innerHTML = "";
    s.scenes.forEach((scene) => {
      const row = document.createElement("div");
      row.className = "row scene-row" + (scene.id === s.activeSceneId ? " active" : "");
      row.textContent = scene.name;
      row.addEventListener("click", () => this.store.update((st) => switchScene(st, scene.id)));
      this.listEl.appendChild(row);
    });
  }
}
