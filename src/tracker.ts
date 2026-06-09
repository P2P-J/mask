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
    const fileset = await FilesetResolver.forVisionTasks("/wasm");
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/models/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  detect(video: HTMLVideoElement, timestampMs: number): DetectResult {
    if (!this.landmarker) throw new Error("Tracker가 초기화되지 않음");
    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(video, timestampMs);
    const inferenceMs = performance.now() - t0;
    return { faces: result.faceLandmarks, inferenceMs };
  }
}
