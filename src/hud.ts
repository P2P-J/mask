export interface HudSnapshot {
  fps: number;
  inferenceMs: number;
  frameMs: number;
  requested: string;
  actual: string;
  faceDetected: boolean;
  jsHeapMb: number | null;
}

export interface HudCallbacks {
  onDeviceChange: (deviceId: string) => void;
  onResolutionChange: (width: number, height: number) => void;
  onFpsChange: (fps: number) => void;
  onOverlayToggle: (enabled: boolean) => void;
}

export class Hud {
  private statsEl = document.getElementById("stats") as HTMLElement;
  private errorEl = document.getElementById("error") as HTMLElement;
  private deviceEl = document.getElementById("device") as HTMLSelectElement;
  private resolutionEl = document.getElementById("resolution") as HTMLSelectElement;
  private fpsEl = document.getElementById("fps") as HTMLSelectElement;
  private overlayEl = document.getElementById("overlay") as HTMLInputElement;

  constructor(cb: HudCallbacks) {
    this.deviceEl.addEventListener("change", () => cb.onDeviceChange(this.deviceEl.value));
    this.resolutionEl.addEventListener("change", () => {
      const [w, h] = this.resolutionEl.value.split("x").map(Number);
      cb.onResolutionChange(w, h);
    });
    this.fpsEl.addEventListener("change", () => cb.onFpsChange(Number(this.fpsEl.value)));
    this.overlayEl.addEventListener("change", () => cb.onOverlayToggle(this.overlayEl.checked));
  }

  get overlayEnabled(): boolean {
    return this.overlayEl.checked;
  }

  get resolution(): { width: number; height: number } {
    const [w, h] = this.resolutionEl.value.split("x").map(Number);
    return { width: w, height: h };
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

  update(s: HudSnapshot): void {
    this.statsEl.textContent =
      `FPS:     ${s.fps.toFixed(1)}\n` +
      `추론:    ${s.inferenceMs.toFixed(1)} ms\n` +
      `프레임:  ${s.frameMs.toFixed(1)} ms\n` +
      `요청:    ${s.requested}\n` +
      `실제:    ${s.actual}\n` +
      `얼굴:    ${s.faceDetected ? "검출됨" : "없음"}\n` +
      `JS 힙:   ${s.jsHeapMb !== null ? s.jsHeapMb.toFixed(0) + " MB" : "N/A"}\n` +
      `(GPU 메모리는 브라우저에서 측정 불가)`;
  }

  showError(msg: string): void {
    this.errorEl.textContent = msg;
  }
}
