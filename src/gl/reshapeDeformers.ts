import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 다중 워프(deformer) 기반 디테일 리쉐이프.
// 각 deformer = 중심(cx,cy) + 반경(r) + 방사 스케일(scale) + 평행이동(tx,ty), uv 공간.
// 셰이더가 화소별로 영향을 합산해 입력을 역워프 샘플링.
export const MAX_DEFORMERS = 24;

export interface Deformers {
  count: number;
  defA: Float32Array; // [cx, cy, r, scale] × MAX
  defB: Float32Array; // [tx, ty, 0, 0] × MAX
}

interface Def {
  cx: number;
  cy: number;
  r: number;
  scale: number;
  tx: number;
  ty: number;
}

// uv: x 그대로, y는 1-y(플립 텍스처 정합). y 증가 = 화면 위쪽.
function uv(lm: NormalizedLandmark[], i: number): [number, number] {
  return [lm[i].x, 1 - lm[i].y];
}
function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function mid(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// params: 0..100 (0=중립). 모든 효과는 "뷰티" 방향 단방향.
export function buildDeformers(lm: NormalizedLandmark[], params: Record<string, number>): Deformers {
  const P = (k: string): number => (params[k] ?? 0) / 100;
  const defs: Def[] = [];
  const push = (d: Def): void => {
    if (defs.length < MAX_DEFORMERS) defs.push(d);
  };

  const L = uv(lm, 234);
  const R = uv(lm, 454);
  const TOP = uv(lm, 10);
  const CHIN = uv(lm, 152);
  const faceW = dist(L, R);
  const faceH = dist(TOP, CHIN);
  const center: [number, number] = [(L[0] + R[0]) / 2, (TOP[1] + CHIN[1]) / 2];

  // 얼굴 갸름: 양 볼 안쪽으로
  if (P("slim") > 0) {
    const a = P("slim") * faceW * 0.13;
    push({ cx: L[0], cy: L[1], r: faceW * 0.55, scale: 0, tx: +a, ty: 0 });
    push({ cx: R[0], cy: R[1], r: faceW * 0.55, scale: 0, tx: -a, ty: 0 });
  }
  // 작은 얼굴: 전체 축소
  if (P("faceSize") > 0) {
    push({ cx: center[0], cy: center[1], r: Math.max(faceW, faceH) * 0.95, scale: -P("faceSize") * 0.18, tx: 0, ty: 0 });
  }
  // V라인 턱: 하악 안쪽+위로
  if (P("jaw") > 0) {
    const JL = uv(lm, 172);
    const JR = uv(lm, 397);
    const a = P("jaw");
    push({ cx: JL[0], cy: JL[1], r: faceW * 0.42, scale: 0, tx: +a * faceW * 0.09, ty: +a * faceH * 0.03 });
    push({ cx: JR[0], cy: JR[1], r: faceW * 0.42, scale: 0, tx: -a * faceW * 0.09, ty: +a * faceH * 0.03 });
  }
  // 턱 길이(짧게): 턱 위로
  if (P("chin") > 0) {
    push({ cx: CHIN[0], cy: CHIN[1], r: faceW * 0.5, scale: 0, tx: 0, ty: +P("chin") * faceH * 0.08 });
  }
  // 이마 축소: 헤어라인 아래로
  if (P("forehead") > 0) {
    push({ cx: TOP[0], cy: TOP[1], r: faceW * 0.6, scale: 0, tx: 0, ty: -P("forehead") * faceH * 0.07 });
  }
  // 눈 크게
  if (P("eyeSize") > 0) {
    const le = mid(uv(lm, 33), uv(lm, 133));
    const re = mid(uv(lm, 263), uv(lm, 362));
    const ew = dist(uv(lm, 33), uv(lm, 133));
    const s = P("eyeSize") * 0.38;
    push({ cx: le[0], cy: le[1], r: ew * 1.7, scale: s, tx: 0, ty: 0 });
    push({ cx: re[0], cy: re[1], r: ew * 1.7, scale: s, tx: 0, ty: 0 });
  }
  // 코 축소
  if (P("noseSize") > 0) {
    const nt = uv(lm, 1);
    const nw = dist(uv(lm, 64), uv(lm, 294));
    push({ cx: nt[0], cy: nt[1], r: nw * 1.5, scale: -P("noseSize") * 0.3, tx: 0, ty: 0 });
  }
  // 입 크기(작게)
  if (P("mouthSize") > 0) {
    const mc = mid(uv(lm, 13), uv(lm, 14));
    const mw = dist(uv(lm, 61), uv(lm, 291));
    push({ cx: mc[0], cy: mc[1], r: mw * 1.2, scale: -P("mouthSize") * 0.25, tx: 0, ty: 0 });
  }
  // 입술 도톰
  if (P("lipThick") > 0) {
    const mc = mid(uv(lm, 13), uv(lm, 14));
    const mw = dist(uv(lm, 61), uv(lm, 291));
    push({ cx: mc[0], cy: mc[1], r: mw * 0.85, scale: +P("lipThick") * 0.18, tx: 0, ty: 0 });
  }
  // 입꼬리(미소): 양 입꼬리 위로
  if (P("smile") > 0) {
    const ml = uv(lm, 61);
    const mr = uv(lm, 291);
    const mw = dist(ml, mr);
    const a = P("smile");
    push({ cx: ml[0], cy: ml[1], r: mw * 0.55, scale: 0, tx: 0, ty: +a * faceH * 0.03 });
    push({ cx: mr[0], cy: mr[1], r: mw * 0.55, scale: 0, tx: 0, ty: +a * faceH * 0.03 });
  }
  // 눈썹 올리기
  if (P("browLift") > 0) {
    const bl = uv(lm, 105);
    const br = uv(lm, 334);
    const a = P("browLift");
    push({ cx: bl[0], cy: bl[1], r: faceW * 0.28, scale: 0, tx: 0, ty: +a * faceH * 0.045 });
    push({ cx: br[0], cy: br[1], r: faceW * 0.28, scale: 0, tx: 0, ty: +a * faceH * 0.045 });
  }

  const defA = new Float32Array(MAX_DEFORMERS * 4);
  const defB = new Float32Array(MAX_DEFORMERS * 4);
  defs.forEach((d, i) => {
    defA[i * 4] = d.cx;
    defA[i * 4 + 1] = d.cy;
    defA[i * 4 + 2] = d.r;
    defA[i * 4 + 3] = d.scale;
    defB[i * 4] = d.tx;
    defB[i * 4 + 1] = d.ty;
  });
  return { count: defs.length, defA, defB };
}
