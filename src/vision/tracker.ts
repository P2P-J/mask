import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export interface DetectResult {
  faces: NormalizedLandmark[][];
  inferenceMs: number;
}

export class Tracker {
  private landmarker: FaceLandmarker | null = null;

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
    const create = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task`,
          delegate,
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    try {
      this.landmarker = await create("GPU");
    } catch (e) {
      console.warn("FaceLandmarker GPU delegate 실패 → CPU 폴백", e);
      this.landmarker = await create("CPU");
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): DetectResult {
    if (!this.landmarker) throw new Error("Tracker가 초기화되지 않음");
    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(video, timestampMs);
    const inferenceMs = performance.now() - t0;
    return { faces: result.faceLandmarks, inferenceMs };
  }
}
