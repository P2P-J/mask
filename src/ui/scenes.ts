import type { Store } from "../state/store";
import { switchScene, addScene, renameScene } from "../state/reducer";

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

      const name = document.createElement("span");
      name.className = "scene-name";
      name.textContent = scene.name;

      const edit = document.createElement("button");
      edit.className = "scene-edit";
      edit.textContent = "✎";
      edit.title = "이름 변경";
      edit.addEventListener("click", (e) => {
        e.stopPropagation(); // 행 클릭(장면 전환) 방지
        this.startRename(row, scene.id, scene.name);
      });

      row.append(name, edit);
      row.addEventListener("click", () => this.store.update((st) => switchScene(st, scene.id)));
      this.listEl.appendChild(row);
    });
  }

  // 장면 이름 인라인 편집
  private startRename(row: HTMLElement, id: string, current: string): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "scene-rename";
    input.value = current;
    row.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const commit = (): void => {
      if (done) return;
      done = true;
      const name = input.value.trim() || current;
      this.store.update((st) => renameScene(st, id, name)); // → render()로 input 제거
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        done = true;
        this.render();
      }
    });
    input.addEventListener("blur", commit);
  }
}
