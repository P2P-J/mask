export interface Layer {
  id: string; // 'smoothing' | 'color'
  name: string;
  category: string; // 'face'
  enabled: boolean;
  params: Record<string, number>; // 각 슬라이더 0~100
}

export interface Scene {
  id: string;
  name: string;
  layers: Layer[];
}

export interface AppState {
  scenes: Scene[];
  activeSceneId: string;
  activeCategory: string;
  selectedLayerId: string;
}
