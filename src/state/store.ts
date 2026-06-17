import type { AppState } from "./types";
import { defaultState } from "./defaults";
import { serialize, deserialize } from "./persist";

const KEY = "mask.state.v7"; // v7: 메이크업 레이어(립/블러셔/아이섀도/아이브로우 + 컬러)
type Listener = (s: AppState) => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor() {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    this.state = (raw && deserialize(raw)) || defaultState();
  }

  get(): AppState {
    return this.state;
  }

  // reducer 함수를 받아 상태 갱신 + 영속 + 구독자 통지
  update(fn: (s: AppState) => AppState): void {
    this.state = fn(this.state);
    try {
      localStorage.setItem(KEY, serialize(this.state));
    } catch {
      /* 저장 실패 무시(프라이빗 모드 등) */
    }
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(l: Listener): void {
    this.listeners.add(l);
  }
}
