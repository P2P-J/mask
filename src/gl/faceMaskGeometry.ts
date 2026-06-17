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

// 무방향 에지 집합(삼각 메시 tessellation)에서 삼각형 인덱스(평면 배열) 복원.
// 세 정점이 서로 모두 연결되어 있으면 삼각형으로 간주, 중복 제거.
export function trianglesFromConnections(connections: Connection[]): number[] {
  const adj = new Map<number, Set<number>>();
  const add = (a: number, b: number): void => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const c of connections) {
    add(c.start, c.end);
    add(c.end, c.start);
  }
  const tris: number[] = [];
  const seen = new Set<string>();
  for (const c of connections) {
    const a = c.start;
    const b = c.end;
    const nb = adj.get(b)!;
    for (const x of adj.get(a)!) {
      if (nb.has(x)) {
        const key = [a, b, x].sort((p, q) => p - q).join("-");
        if (!seen.has(key)) {
          seen.add(key);
          tris.push(a, b, x);
        }
      }
    }
  }
  return tris;
}

// 삼각형 인덱스 배열 → 비인덱스 클립공간 정점(x=2lx-1, y=1-2ly).
// scale>1이면 중심 기준으로 팽창시켜 마스크를 바깥으로 확장(이마/헤어라인 커버 보강).
export function buildMeshVerts(
  landmarks: NormalizedLandmark[],
  triangles: number[],
  scale = 1
): Float32Array {
  let cx = 0;
  let cy = 0;
  for (const idx of triangles) {
    const l = landmarks[idx];
    cx += l.x * 2 - 1;
    cy += 1 - l.y * 2;
  }
  cx /= triangles.length;
  cy /= triangles.length;
  const verts = new Float32Array(triangles.length * 2);
  for (let i = 0; i < triangles.length; i++) {
    const l = landmarks[triangles[i]];
    const x = l.x * 2 - 1;
    const y = 1 - l.y * 2;
    verts[i * 2] = cx + (x - cx) * scale;
    verts[i * 2 + 1] = cy + (y - cy) * scale;
  }
  return verts;
}
