export interface Layer {
  id: string; // 'smoothing' | 'color'
  name: string;
  category: string; // 'face'
  enabled: boolean;
  params: Record<string, number>; // 각 슬라이더 0~100
  colors?: Record<string, string>; // 메이크업 등 색상(hex)
  selects?: Record<string, { value: string; options: string[] }>; // 드롭다운(필터 프리셋 등)
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
