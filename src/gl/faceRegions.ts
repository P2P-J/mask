import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { regionIndices, trianglesFromConnections, type Connection } from "./faceMaskGeometry";

// 전체 얼굴 메시 삼각형(468점 tessellation에서 복원) — 얼굴 표면 전체를 정확히 덮는 마스크 기반.
export const FACE_TRIANGLES = trianglesFromConnections(
  FaceLandmarker.FACE_LANDMARKS_TESSELATION as Connection[]
);

// 도려낼 영역(눈/눈썹/입) — 윤곽 루프의 유니크 정점.
export const HOLES = [
  regionIndices(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE as Connection[]),
  regionIndices(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE as Connection[]),
  regionIndices(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW as Connection[]),
  regionIndices(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW as Connection[]),
  regionIndices(FaceLandmarker.FACE_LANDMARKS_LIPS as Connection[]),
];
