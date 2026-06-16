import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// MediaPipe FaceMesh 468 인덱스
const FACE_TOP = 10;
const FACE_BOTTOM = 152;
const FACE_LEFT = 234;
const FACE_RIGHT = 454;
const EYE_L = [33, 133];
const EYE_R = [362, 263];
const MOUTH = [13, 14];

export interface MaskUniforms {
  faceC: [number, number];
  faceR: [number, number];
  eyeL: [number, number];
  eyeR: [number, number];
  mouth: [number, number];
  featR: number;
}

// 랜드마크(y 아래로 증가) → GL uv(y 위로 증가)
function uv(l: NormalizedLandmark): [number, number] {
  return [l.x, 1 - l.y];
}

function mid(lm: NormalizedLandmark[], a: number, b: number): [number, number] {
  const pa = uv(lm[a]);
  const pb = uv(lm[b]);
  return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
}

export function maskUniforms(lm: NormalizedLandmark[]): MaskUniforms {
  const top = uv(lm[FACE_TOP]);
  const bot = uv(lm[FACE_BOTTOM]);
  const left = uv(lm[FACE_LEFT]);
  const right = uv(lm[FACE_RIGHT]);
  const cx = (left[0] + right[0]) / 2;
  const cy = (top[1] + bot[1]) / 2;
  const rx = (Math.abs(right[0] - left[0]) / 2) * 1.1;
  const ry = (Math.abs(top[1] - bot[1]) / 2) * 1.1;
  return {
    faceC: [cx, cy],
    faceR: [rx, ry],
    eyeL: mid(lm, EYE_L[0], EYE_L[1]),
    eyeR: mid(lm, EYE_R[0], EYE_R[1]),
    mouth: mid(lm, MOUTH[0], MOUTH[1]),
    featR: rx * 0.18,
  };
}
