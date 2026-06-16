import type { AppState } from "./types";

export function serialize(s: AppState): string {
  return JSON.stringify(s);
}

export function deserialize(raw: string): AppState | null {
  try {
    const obj = JSON.parse(raw) as AppState | null;
    if (!obj || !Array.isArray(obj.scenes) || obj.scenes.length === 0) return null;
    if (!obj.activeSceneId || !obj.activeCategory || !obj.selectedLayerId) return null;
    return obj;
  } catch {
    return null;
  }
}
