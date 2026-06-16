import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { regionIndices, type Connection } from "./faceMaskGeometry";

// MediaPipe 윤곽 연결집합 → 영역별 유니크 정점 인덱스(1회 계산).
// face = 채울 영역(흰색), 나머지 = 도려낼 영역(검정).
export const REGIONS = {
  face: regionIndices(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL as Connection[]),
  holes: [
    regionIndices(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE as Connection[]),
    regionIndices(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE as Connection[]),
    regionIndices(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW as Connection[]),
    regionIndices(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW as Connection[]),
    regionIndices(FaceLandmarker.FACE_LANDMARKS_LIPS as Connection[]),
  ],
};
