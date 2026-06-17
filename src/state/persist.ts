import type { AppState } from "./types";

export function serialize(s: AppState): string {
  return JSON.stringify(s);
}

export function deserialize(raw: string): AppState | null {
  try {
    const obj = JSON.parse(raw) as AppState | null;
    if (!obj || !Array.isArray(obj.scenes) || obj.scenes.length === 0) return null;
    if (!obj.activeSceneId || !obj.activeCategory || !obj.selectedLayerId) return null;
    // 레이어 형태 검증(키 버전 누락 시 깨진 상태로 크래시 방지 → 기본값으로 폴백)
    const layersOk = obj.scenes.every(
      (sc) =>
        Array.isArray(sc.layers) &&
        sc.layers.every((l) => l && typeof l.params === "object" && typeof l.id === "string")
    );
    if (!layersOk) return null;
    return obj;
  } catch {
    return null;
  }
}
