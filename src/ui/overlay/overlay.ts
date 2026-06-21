import { DrawingUtils, FaceLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

// GL 캔버스 위에 겹치는 투명 2D 캔버스에 메시만 그림
export class MeshOverlay {
  private ctx: CanvasRenderingContext2D;
  private drawingUtils: DrawingUtils;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("오버레이 2D 컨텍스트 실패");
    this.ctx = ctx;
    this.drawingUtils = new DrawingUtils(ctx);
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  draw(faces: NormalizedLandmark[][], show: boolean): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!show) return;
    for (const landmarks of faces) {
      this.drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#C0C0C070", lineWidth: 1 }
      );
    }
  }
}
