import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

export interface SegResult {
  data: Uint8Array; // 인물 확률 0~255 (1채널)
  width: number;
  height: number;
}

// MediaPipe Selfie Segmentation — 인물/배경 분리 마스크.
export class Segmenter {
  private seg: ImageSegmenter | null = null;

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks("/wasm");
    this.seg = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/models/selfie_segmenter.tflite", delegate: "GPU" },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }

  // 인물 확률 마스크(0~255) 반환. 모델 미초기화/실패 시 null.
  segment(video: HTMLVideoElement, timestampMs: number): SegResult | null {
    if (!this.seg) return null;
    const result = this.seg.segmentForVideo(video, timestampMs);
    const mask = result.confidenceMasks?.[0];
    if (!mask) return null;
    const f = mask.getAsFloat32Array();
    const out = new Uint8Array(f.length);
    for (let i = 0; i < f.length; i++) out[i] = Math.round(f[i] * 255);
    const width = mask.width;
    const height = mask.height;
    mask.close();
    return { data: out, width, height };
  }
}
