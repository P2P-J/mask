import { parseResolution } from "./format";

export interface DiagnosticsSnapshot {
  fps: number;
  inferenceMs: number;
  frameMs: number;
  requested: string;
  actual: string;
  faceDetected: boolean;
  jsHeapMb: number | null;
}

export interface ControlsCallbacks {
  onSourceChange: () => void; // 카메라/해상도/fps 변경 시 스트림 재시작
}

export class Controls {
  private deviceEl = document.getElementById("device") as HTMLSelectElement;
  private resolutionEl = document.getElementById("resolution") as HTMLSelectElement;
  private fpsEl = document.getElementById("fps") as HTMLSelectElement;
  private overlayEl = document.getElementById("overlay") as HTMLInputElement;
  private statsEl = document.getElementById("stats") as HTMLElement;
  private errorEl = document.getElementById("error") as HTMLElement;
  private liveFpsEl = document.getElementById("live-fps") as HTMLElement;
  private diagEl = document.getElementById("diagnostics") as HTMLElement;
  private diagToggleEl = document.getElementById("diag-toggle") as HTMLButtonElement;

  constructor(cb: ControlsCallbacks) {
    this.deviceEl.addEventListener("change", () => cb.onSourceChange());
    this.resolutionEl.addEventListener("change", () => cb.onSourceChange());
    this.fpsEl.addEventListener("change", () => cb.onSourceChange());
    this.diagToggleEl.addEventListener("click", () => this.diagEl.classList.toggle("open"));
  }

  get overlayEnabled(): boolean {
    return this.overlayEl.checked;
  }

  get resolution(): { width: number; height: number } {
    return parseResolution(this.resolutionEl.value);
  }

  get fps(): number {
    return Number(this.fpsEl.value);
  }

  get deviceId(): string | undefined {
    return this.deviceEl.value || undefined;
  }

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
      `FPS:     ${s.fps.toFixed(1)}\n` +
      `추론:    ${s.inferenceMs.toFixed(1)} ms\n` +
      `프레임:  ${s.frameMs.toFixed(1)} ms\n` +
      `요청:    ${s.requested}\n` +
      `실제:    ${s.actual}\n` +
      `얼굴:    ${s.faceDetected ? "검출됨" : "없음"}\n` +
      `JS 힙:   ${s.jsHeapMb !== null ? s.jsHeapMb.toFixed(0) + " MB" : "N/A"}`;
  }

  showError(msg: string): void {
    this.errorEl.textContent = msg;
  }

  clearError(): void {
    this.errorEl.textContent = "";
  }
}
