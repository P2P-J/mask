import {
  DrawingUtils,
  FaceLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private drawingUtils: DrawingUtils;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D 컨텍스트를 가져올 수 없음");
    this.ctx = ctx;
    this.drawingUtils = new DrawingUtils(ctx);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  draw(video: HTMLVideoElement, faces: NormalizedLandmark[][], overlay: boolean): void {
    const { width, height } = this.canvas;
    this.ctx.drawImage(video, 0, 0, width, height);
    if (overlay) {
      for (const landmarks of faces) {
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          { color: "#C0C0C070", lineWidth: 1 }
        );
      }
    }
  }
}
