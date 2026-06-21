import { analyzeFace, type FaceProfile } from "../vision/faceAnalysis";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const NEED = 45; // 약 1.5초(30fps) 안정 프레임

export class Onboarding {
  private el = document.getElementById("onboarding") as HTMLElement;
  private msg = document.getElementById("onboard-msg") as HTMLElement;
  private fill = document.getElementById("onboard-fill") as HTMLElement;
  private frames: NormalizedLandmark[][] = [];
  active = false;
  private onDone: ((p: FaceProfile) => void) | null = null;

  constructor() {
    (document.getElementById("onboard-cancel") as HTMLElement).addEventListener("click", () => this.stop());
  }
  start(onDone: (p: FaceProfile) => void): void {
    this.frames = []; this.active = true; this.onDone = onDone;
    this.el.classList.remove("hidden"); this.fill.style.width = "0%";
    this.msg.textContent = "얼굴을 정면으로 맞춰주세요";
  }
  stop(): void { this.active = false; this.el.classList.add("hidden"); }
  // 매 프레임 호출: 얼굴 있으면 수집, NEED 도달 시 분석
  feed(face: NormalizedLandmark[] | null): void {
    if (!this.active) return;
    if (!face) { this.msg.textContent = "얼굴이 안 보여요"; return; }
    this.msg.textContent = "분석 중… 가만히 있어주세요";
    this.frames.push(face);
    this.fill.style.width = `${Math.min(100, (this.frames.length / NEED) * 100)}%`;
    if (this.frames.length >= NEED) {
      const profile = analyzeFace(this.frames);
      this.stop();
      this.onDone?.(profile);
    }
  }
}
