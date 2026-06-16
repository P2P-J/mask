import type { AppState, Layer, Scene } from "./types";

export function getActiveScene(s: AppState): Scene {
  return s.scenes.find((sc) => sc.id === s.activeSceneId) ?? s.scenes[0];
}

export function getSelectedLayer(s: AppState): Layer {
  const scene = getActiveScene(s);
  return scene.layers.find((l) => l.id === s.selectedLayerId) ?? scene.layers[0];
}

export function getCategoryLayers(s: AppState, category: string): Layer[] {
  return getActiveScene(s).layers.filter((l) => l.category === category);
}

function mapActiveScene(s: AppState, fn: (scene: Scene) => Scene): AppState {
  return { ...s, scenes: s.scenes.map((sc) => (sc.id === s.activeSceneId ? fn(sc) : sc)) };
}

function mapLayer(scene: Scene, layerId: string, fn: (l: Layer) => Layer): Scene {
  return { ...scene, layers: scene.layers.map((l) => (l.id === layerId ? fn(l) : l)) };
}

export function setParam(s: AppState, layerId: string, key: string, value: number): AppState {
  return mapActiveScene(s, (scene) =>
    mapLayer(scene, layerId, (l) => ({ ...l, params: { ...l.params, [key]: value } }))
  );
}

export function toggleLayer(s: AppState, layerId: string): AppState {
  return mapActiveScene(s, (scene) =>
    mapLayer(scene, layerId, (l) => ({ ...l, enabled: !l.enabled }))
  );
}

export function selectLayer(s: AppState, layerId: string): AppState {
  return { ...s, selectedLayerId: layerId };
}

export function setCategory(s: AppState, category: string): AppState {
  return { ...s, activeCategory: category };
}

export function switchScene(s: AppState, sceneId: string): AppState {
  return { ...s, activeSceneId: sceneId };
}

let sceneSeq = 1;
export function addScene(s: AppState, name: string): AppState {
  const cloneId = `scene-${Date.now()}-${sceneSeq++}`;
  const cloned: Scene = {
    id: cloneId,
    name,
    layers: getActiveScene(s).layers.map((l) => ({ ...l, params: { ...l.params } })),
  };
  return { ...s, scenes: [...s.scenes, cloned], activeSceneId: cloneId };
}

export function removeScene(s: AppState, sceneId: string): AppState {
  if (s.scenes.length <= 1) return s; // 최소 1개 유지
  const scenes = s.scenes.filter((sc) => sc.id !== sceneId);
  const activeSceneId = s.activeSceneId === sceneId ? scenes[0].id : s.activeSceneId;
  return { ...s, scenes, activeSceneId };
}
