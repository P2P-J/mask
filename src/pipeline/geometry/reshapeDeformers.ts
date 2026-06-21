import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { FaceShape } from "../../vision/faceAnalysis";

// 이방성·부드러운 필드 기반 디테일 리쉐이프.
// deformer = 타원 영향영역(중심 c, 반경 rx/ry) 안에서 비례 스케일(sx,sy) + 평행이동(tx,ty).
// 셰이더가 화소별 영향을 부드럽게(smoothstep) 합산 → 전체 밸런스 유지하며 자연스럽게 변형.
export const MAX_DEFORMERS = 48;

export interface Deformers {
  count: number;
  defA: Float32Array; // [cx, cy, rx, ry] × MAX
  defB: Float32Array; // [sx, sy, tx, ty] × MAX
}

interface Def {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

function uv(lm: NormalizedLandmark[], i: number): [number, number] {
  return [lm[i].x, 1 - lm[i].y];
}
function d2(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function mid(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// 0..100 → 0..1 (단방향), 또는 -1..1 (양방향, 50=중립)
const uni = (p: Record<string, number>, k: string): number => (p[k] ?? 0) / 100;
const bi = (p: Record<string, number>, k: string): number => ((p[k] ?? 50) - 50) / 50;

export function buildDeformers(lm: NormalizedLandmark[], p: Record<string, number>, shape?: FaceShape): Deformers {
  const defs: Def[] = [];
  // 과변형("녹음") 방지용 상한(정규화 좌표 기준)
  const MAX_T = 0.02; // 최대 이동 ~2%
  const MAX_S = 0.45; // 최대 스케일 델타
  const clamp = (v: number, m: number): number => Math.max(-m, Math.min(m, v));
  const add = (
    c: [number, number],
    rx: number,
    ry: number,
    sx: number,
    sy: number,
    tx = 0,
    ty = 0
  ): void => {
    if (Math.abs(sx) < 1e-5 && Math.abs(sy) < 1e-5 && Math.abs(tx) < 1e-5 && Math.abs(ty) < 1e-5) return;
    if (defs.length < MAX_DEFORMERS)
      defs.push({
        cx: c[0],
        cy: c[1],
        rx,
        ry,
        sx: clamp(sx, MAX_S),
        sy: clamp(sy, MAX_S),
        tx: clamp(tx, MAX_T),
        ty: clamp(ty, MAX_T),
      });
  };

  const L = uv(lm, 234);
  const R = uv(lm, 454);
  const TOP = uv(lm, 10);
  const CHIN = uv(lm, 152);
  const W = d2(L, R);
  const H = d2(TOP, CHIN);
  const C: [number, number] = [(L[0] + R[0]) / 2, (TOP[1] + CHIN[1]) / 2];
  const leftEye = mid(uv(lm, 33), uv(lm, 133));
  const rightEye = mid(uv(lm, 263), uv(lm, 362));
  const ew = d2(uv(lm, 33), uv(lm, 133));

  // ── 얼굴형 (전체 비례 필드 → 밸런스 유지) ──
  add(C, W * 0.78, H * 0.9, -uni(p, "slim") * 0.26 * shapeScale(shape, "slim"), 0); // 갸름(가로 비례 압축)
  add(C, W * 0.95, H * 1.0, -uni(p, "faceSize") * 0.16 * shapeScale(shape, "faceSize"), -uni(p, "faceSize") * 0.16 * shapeScale(shape, "faceSize")); // 작은 얼굴
  // 광대 축소: 좌우 광대 정점(50/280)을 각각 안쪽으로
  const cbk = uni(p, "cheekbone") * 0.22 * shapeScale(shape, "cheekbone");
  const cbL = uv(lm, 50), cbR = uv(lm, 280);
  add(cbL, W * 0.32, H * 0.3, 0, 0, +cbk * W * 0.5, 0);
  add(cbR, W * 0.32, H * 0.3, 0, 0, -cbk * W * 0.5, 0);
  add([C[0], TOP[1]], W * 0.6, H * 0.5, 0, 0, 0, -uni(p, "forehead") * H * 0.07 * shapeScale(shape, "forehead")); // 이마 축소
  // W4b: 얼굴 길이(세로 비례, >50 길게), 관자놀이/볼살 축소, 볼 리프팅
  add(C, W * 0.85, H * 1.05, 0, bi(p, "faceLength") * 0.16);
  add(uv(lm, 21), W * 0.3, H * 0.3, 0, 0, +uni(p, "temple") * W * 0.05, 0); // 좌 관자놀이 안으로
  add(uv(lm, 251), W * 0.3, H * 0.3, 0, 0, -uni(p, "temple") * W * 0.05, 0); // 우 관자놀이
  add(uv(lm, 205), W * 0.3, H * 0.3, 0, 0, +uni(p, "cheekReduce") * W * 0.045, 0); // 좌 볼살 안으로
  add(uv(lm, 425), W * 0.3, H * 0.3, 0, 0, -uni(p, "cheekReduce") * W * 0.045, 0); // 우 볼살
  add(uv(lm, 205), W * 0.35, H * 0.3, 0, 0, 0, +uni(p, "cheekLift") * H * 0.03); // 좌 볼 리프팅(위로)
  add(uv(lm, 425), W * 0.35, H * 0.3, 0, 0, 0, +uni(p, "cheekLift") * H * 0.03); // 우 볼 리프팅

  // ── 턱 ──
  {
    const JL = uv(lm, 172);
    const JR = uv(lm, 397);
    const a = uni(p, "jaw") * shapeScale(shape, "jaw");
    add(JL, W * 0.45, H * 0.4, 0, 0, +a * W * 0.08, +a * H * 0.025); // V라인(좌 안+위)
    add(JR, W * 0.45, H * 0.4, 0, 0, -a * W * 0.08, +a * H * 0.025); // V라인(우)
    add(CHIN, W * 0.5, H * 0.45, 0, 0, 0, bi(p, "chinLength") * -H * 0.07 * shapeScale(shape, "chinLength")); // 턱 길이(>50 길게=아래)
    // W4b: 턱폭(하관) 축소 — V라인과 별개로 하악 폭 안쪽
    const jw = uni(p, "jawWidth");
    add(JL, W * 0.4, H * 0.4, 0, 0, +jw * W * 0.055, 0);
    add(JR, W * 0.4, H * 0.4, 0, 0, -jw * W * 0.055, 0);
  }

  // ── 눈 ──
  {
    const eSize = uni(p, "eyeSize") * 0.34;
    add(leftEye, ew * 1.7, ew * 1.7, eSize, eSize);
    add(rightEye, ew * 1.7, ew * 1.7, eSize, eSize);
    const space = bi(p, "eyeSpacing") * W * 0.04; // >50 넓게
    add(leftEye, ew * 1.8, ew * 1.8, 0, 0, -space, 0);
    add(rightEye, ew * 1.8, ew * 1.8, 0, 0, +space, 0);
    const tilt = bi(p, "eyeCorner") * H * 0.025; // >50 올리기
    add(uv(lm, 33), ew * 1.0, ew * 1.0, 0, 0, 0, +tilt); // 좌 눈꼬리(바깥)
    add(uv(lm, 263), ew * 1.0, ew * 1.0, 0, 0, 0, +tilt); // 우 눈꼬리
    const pupil = uni(p, "pupil") * 0.5; // 동공/홍채 확대(눈 중심 작은 버블)
    add(leftEye, ew * 0.55, ew * 0.55, pupil, pupil);
    add(rightEye, ew * 0.55, ew * 0.55, pupil, pupil);
    // W4b: 눈 높이(세로 확대), 눈 위치 상하, 앞트임/뒤트임
    const eh = uni(p, "eyeHeight") * 0.3;
    add(leftEye, ew * 1.5, ew * 1.4, 0, eh);
    add(rightEye, ew * 1.5, ew * 1.4, 0, eh);
    const eposy = bi(p, "eyePosY") * H * 0.035; // >50 위로
    add(leftEye, ew * 1.6, ew * 1.6, 0, 0, 0, +eposy);
    add(rightEye, ew * 1.6, ew * 1.6, 0, 0, 0, +eposy);
    const ic = uni(p, "innerCorner") * ew * 0.12; // 앞트임(내안각, 코쪽으로)
    add(uv(lm, 133), ew * 0.5, ew * 0.5, 0, 0, +ic, 0);
    add(uv(lm, 362), ew * 0.5, ew * 0.5, 0, 0, -ic, 0);
    const oc = uni(p, "outerCorner") * ew * 0.12; // 뒤트임(외안각, 바깥쪽으로)
    add(uv(lm, 33), ew * 0.5, ew * 0.5, 0, 0, -oc, 0);
    add(uv(lm, 263), ew * 0.5, ew * 0.5, 0, 0, +oc, 0);
  }

  // ── 코 ──
  {
    const nt = uv(lm, 1);
    const bridge = mid(uv(lm, 6), uv(lm, 197));
    const nw = d2(uv(lm, 64), uv(lm, 294));
    add(nt, nw * 1.5, nw * 1.5, -uni(p, "noseSize") * 0.26, -uni(p, "noseSize") * 0.26); // 코 전체 축소
    add(bridge, nw * 0.7, H * 0.22, -uni(p, "noseBridge") * 0.3, 0); // 콧대 슬림(가로 압축)
    add(nt, nw * 0.8, nw * 0.8, -uni(p, "noseTip") * 0.3, -uni(p, "noseTip") * 0.3); // 코끝 축소
    add(uv(lm, 64), nw * 0.6, nw * 0.6, 0, 0, +uni(p, "noseWing") * nw * 0.16, 0); // 좌 콧볼 안으로
    add(uv(lm, 294), nw * 0.6, nw * 0.6, 0, 0, -uni(p, "noseWing") * nw * 0.16, 0); // 우 콧볼
    // W4b: 코뿌리(nasion 좁힘), 코 길이(세로)
    add(uv(lm, 168), nw * 0.7, H * 0.18, -uni(p, "noseRoot") * 0.22, 0);
    add(nt, nw * 1.4, H * 0.3, 0, bi(p, "noseLength") * 0.16);
  }

  // ── 입 ──
  {
    const mc = mid(uv(lm, 13), uv(lm, 14));
    const mw = d2(uv(lm, 61), uv(lm, 291));
    add(mc, mw * 1.2, mw * 1.0, -uni(p, "mouthSize") * 0.22, -uni(p, "mouthSize") * 0.22); // 입 크기↓
    add(mc, mw * 0.9, mw * 0.7, 0, +uni(p, "lipThick") * 0.22); // 입술 도톰(세로)
    const sm = uni(p, "smile") * H * 0.028;
    add(uv(lm, 61), mw * 0.55, mw * 0.55, 0, 0, 0, +sm); // 좌 입꼬리 위로
    add(uv(lm, 291), mw * 0.55, mw * 0.55, 0, 0, 0, +sm); // 우 입꼬리
    // W4b: 인중 길이(윗입술 상하), 입술 너비, 큐피드 보우
    add(uv(lm, 0), mw * 0.7, H * 0.2, 0, 0, 0, -bi(p, "philtrum") * H * 0.025); // >50 길게=아래
    const lw = bi(p, "lipWidth") * mw * 0.12; // >50 넓게
    add(uv(lm, 61), mw * 0.5, mw * 0.5, 0, 0, -lw, 0);
    add(uv(lm, 291), mw * 0.5, mw * 0.5, 0, 0, +lw, 0);
    add(uv(lm, 0), mw * 0.35, mw * 0.2, 0, uni(p, "cupidBow") * 0.14); // 윗입술 산 강조
  }

  // ── 눈썹 ──
  {
    const lift = uni(p, "browHeight") * H * 0.045;
    add(uv(lm, 105), W * 0.28, H * 0.18, 0, 0, 0, +lift);
    add(uv(lm, 334), W * 0.28, H * 0.18, 0, 0, 0, +lift);
    // W4b: 눈썹 간격(>50 넓게)
    const bd = bi(p, "browDist") * W * 0.025;
    add(uv(lm, 105), W * 0.25, H * 0.15, 0, 0, -bd, 0); // 좌 눈썹 바깥(왼쪽)
    add(uv(lm, 334), W * 0.25, H * 0.15, 0, 0, +bd, 0); // 우 눈썹 바깥(오른쪽)
  }

  const defA = new Float32Array(MAX_DEFORMERS * 4);
  const defB = new Float32Array(MAX_DEFORMERS * 4);
  defs.forEach((d, i) => {
    defA[i * 4] = d.cx;
    defA[i * 4 + 1] = d.cy;
    defA[i * 4 + 2] = d.rx;
    defA[i * 4 + 3] = d.ry;
    defB[i * 4] = d.sx;
    defB[i * 4 + 1] = d.sy;
    defB[i * 4 + 2] = d.tx;
    defB[i * 4 + 3] = d.ty;
  });
  return { count: defs.length, defA, defB };
}

function shapeScale(shape: FaceShape | undefined, key: string): number {
  if (!shape) return 1;
  const m: Partial<Record<FaceShape, Record<string, number>>> = {
    round: { slim: 1.25, cheekbone: 1.2, faceSize: 1.15 },
    long: { forehead: 1.25, chinLength: 1.2 },
    square: { jaw: 1.25, slim: 1.1 },
    heart: { cheekbone: 1.1 },
  };
  return m[shape]?.[key] ?? 1;
}
