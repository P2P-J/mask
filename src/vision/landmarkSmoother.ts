import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 랜드마크 시간축 지수이동평균(EMA). MediaPipe 출력의 프레임간 지터를 줄여
// 리쉐이프/메이크업 워프의 "떨림"을 완화한다. 순수 상태머신(테스트 가능).
export class LandmarkSmoother {
  private prev: NormalizedLandmark[] | null = null;
  private alpha: number;

  constructor(alpha = 0.35) {
    this.alpha = alpha;
  }

  reset(): void {
    this.prev = null;
  }

  // null이면 리셋 후 null. 첫 프레임/개수변경이면 raw를 그대로 통과(재시작).
  smooth(face: NormalizedLandmark[] | null): NormalizedLandmark[] | null {
    if (!face) {
      this.prev = null;
      return null;
    }
    if (!this.prev || this.prev.length !== face.length) {
      this.prev = face.map((p) => ({ x: p.x, y: p.y, z: p.z } as NormalizedLandmark));
      return this.prev;
    }
    const a = this.alpha;
    const out = face.map((p, i) => {
      const q = this.prev![i];
      return {
        x: a * p.x + (1 - a) * q.x,
        y: a * p.y + (1 - a) * q.y,
        z: a * p.z + (1 - a) * q.z,
      } as NormalizedLandmark;
    });
    this.prev = out;
    return out;
  }
}
