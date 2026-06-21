import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

export interface SegResult {
  data: Uint8Array; // 인물 확률 0~255 (1채널)
  width: number;
  height: number;
}

// MediaPipe Selfie Segmentation — 인물/배경 분리 마스크.
export class Segmenter {
  private seg: ImageSegmenter | null = null;
  private out: Uint8Array | null = null;

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
    const create = (delegate: "GPU" | "CPU") =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/selfie_segmenter.tflite`, delegate },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    try {
      this.seg = await create("GPU");
    } catch (e) {
      console.warn("ImageSegmenter GPU delegate 실패 → CPU 폴백", e);
      this.seg = await create("CPU");
    }
  }

  // 인물 확률 마스크(0~255) 반환. 모델 미초기화/실패 시 null.
  segment(video: HTMLVideoElement, timestampMs: number): SegResult | null {
    if (!this.seg) return null;
    const result = this.seg.segmentForVideo(video, timestampMs);
    const mask = result.confidenceMasks?.[0];
    if (!mask) return null;
    const f = mask.getAsFloat32Array();
    if (!this.out || this.out.length !== f.length) this.out = new Uint8Array(f.length);
    const out = this.out;
    for (let i = 0; i < f.length; i++) out[i] = Math.round(f[i] * 255);
    const width = mask.width;
    const height = mask.height;
    mask.close();
    return { data: out, width, height };
  }
}
