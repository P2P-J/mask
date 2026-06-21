import type { AppState } from "./types";
import { defaultState, mergeDefaults } from "./defaults";
import { serialize, deserialize } from "./persist";

const KEY = "mask.state.v10"; // v10: 배경 흐림 레이어(세그멘테이션)
type Listener = (s: AppState) => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    this.state = mergeDefaults((raw && deserialize(raw)) || defaultState());
  }

  get(): AppState {
    return this.state;
  }

  // reducer 함수를 받아 상태 갱신 + 영속(디바운스) + 구독자 통지
  update(fn: (s: AppState) => AppState): void {
    this.state = fn(this.state);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, serialize(this.state));
      } catch {
        /* 저장 실패 무시(프라이빗 모드 등) */
      }
    }, 400);
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(l: Listener): void {
    this.listeners.add(l);
  }
}
