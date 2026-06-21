import { parseResolution } from "../../shared/lib/format";

export interface DiagnosticsSnapshot {
  fps: number; inferenceMs: number; frameMs: number;
  requested: string; actual: string; faceDetected: boolean; jsHeapMb: number | null;
}

export interface DockControlsCallbacks {
  onSourceChange: () => void;
  onToggleCorrection: (on: boolean) => void;
  onBeforeAfter: (showOriginal: boolean) => void;
  onPanic: () => void;
}

export class DockControls {
  private deviceEl = document.getElementById("device") as HTMLSelectElement;
  private resolutionEl = document.getElementById("resolution") as HTMLSelectElement;
  private fpsEl = document.getElementById("fps") as HTMLSelectElement;
  private overlayEl = document.getElementById("overlay") as HTMLInputElement;
  private statsEl = document.getElementById("stats") as HTMLElement;
  private errorEl = document.getElementById("error") as HTMLElement;
  private liveFpsEl = document.getElementById("live-fps") as HTMLElement;
  private diagEl = document.getElementById("diagnostics") as HTMLElement;
  private diagToggleEl = document.getElementById("diag-toggle") as HTMLButtonElement;
  private correctionEl = document.getElementById("toggle-correction") as HTMLButtonElement;
  private beforeAfterEl = document.getElementById("before-after") as HTMLButtonElement;
  private panicEl = document.getElementById("panic") as HTMLButtonElement;

  private fpsValue: number;
  private overlayOn: boolean;

  constructor(cb: DockControlsCallbacks) {
    this.fpsValue = Number(this.fpsEl.value);
    this.overlayOn = this.overlayEl.checked;
    this.fpsEl.addEventListener("change", () => { this.fpsValue = Number(this.fpsEl.value); cb.onSourceChange(); });
    this.overlayEl.addEventListener("change", () => { this.overlayOn = this.overlayEl.checked; });
    this.deviceEl.addEventListener("change", () => cb.onSourceChange());
    this.resolutionEl.addEventListener("change", () => cb.onSourceChange());
    this.diagToggleEl.addEventListener("click", () => this.diagEl.classList.toggle("open"));
    this.correctionEl.classList.add("active"); // 기본 보정 ON
    this.correctionEl.addEventListener("click", () => {
      this.correctionEl.classList.toggle("active");
      cb.onToggleCorrection(this.correctionEl.classList.contains("active"));
    });
    this.beforeAfterEl.addEventListener("click", () => {
      this.beforeAfterEl.classList.toggle("active");
      cb.onBeforeAfter(this.beforeAfterEl.classList.contains("active"));
    });
    this.panicEl.addEventListener("click", () => cb.onPanic());
  }

  get overlayEnabled(): boolean { return this.overlayOn; }
  get resolution(): { width: number; height: number } { return parseResolution(this.resolutionEl.value); }
  get fps(): number { return this.fpsValue; }
  get deviceId(): string | undefined { return this.deviceEl.value || undefined; }

  setDevices(devices: MediaDeviceInfo[]): void {
    this.deviceEl.innerHTML = "";
    devices.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `카메라 ${i + 1}`;
      this.deviceEl.appendChild(opt);
    });
  }

  updateDiagnostics(s: DiagnosticsSnapshot): void {
    this.liveFpsEl.textContent = `${s.fps.toFixed(0)} fps`;
    this.statsEl.textContent =
      `FPS:     ${s.fps.toFixed(1)}\n추론:    ${s.inferenceMs.toFixed(1)} ms\n` +
      `프레임:  ${s.frameMs.toFixed(1)} ms\n요청:    ${s.requested}\n실제:    ${s.actual}\n` +
      `얼굴:    ${s.faceDetected ? "검출됨" : "없음"}\nJS 힙:   ${s.jsHeapMb !== null ? s.jsHeapMb.toFixed(0) + " MB" : "N/A"}`;
  }

  // 보정 On/Off 버튼 시각 상태를 외부(패닉 등)에서 동기화
  setCorrection(on: boolean): void { this.correctionEl.classList.toggle("active", on); }

  showError(msg: string): void { this.errorEl.textContent = msg; }
  clearError(): void { this.errorEl.textContent = ""; }
}
