import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// MediaPipe 연결쌍에서 유니크 정점 인덱스 추출
export interface Connection {
  start: number;
  end: number;
}

export function regionIndices(connections: Connection[]): number[] {
  const set = new Set<number>();
  for (const c of connections) {
    set.add(c.start);
    set.add(c.end);
  }
  return [...set];
}

// 정점들을 중심 기준 각도로 정렬해 삼각형 팬(클립공간 vec2)을 만든다.
// landmark(정규화 0..1, y 아래로) → 클립공간: x=2lx-1, y=1-2ly (UNPACK_FLIP_Y 텍스처와 정합)
export function buildFan(landmarks: NormalizedLandmark[], indices: number[]): Float32Array {
  const pts: [number, number][] = indices.map((i) => {
    const l = landmarks[i];
    return [l.x * 2 - 1, 1 - l.y * 2];
  });
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= pts.length;
  cy /= pts.length;
  pts.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));

  const verts: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    verts.push(cx, cy, p0[0], p0[1], p1[0], p1[1]);
  }
  return new Float32Array(verts);
}
