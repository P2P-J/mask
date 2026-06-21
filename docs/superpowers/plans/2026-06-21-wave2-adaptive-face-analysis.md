# 웨이브 2 — 적응형 얼굴 분석 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans.

**Goal:** 얼굴형 분석 모듈 + KYC식 온보딩 + 리쉐이프 정밀 타겟팅/얼굴형별 강도 + 추천 프리셋 자동적용.

**Architecture:** 순수 분석 함수(`faceAnalysis.ts`) → 상태에 `faceProfile` 저장 → 온보딩이 첫 실행에 캡처·분석·추천적용 → reshape는 `shape`를 받아 정밀화. 검증: `npx tsc --noEmit` + vitest + 빌드.

**Tech Stack:** vanilla TS, MediaPipe, WebGL2, Vitest.

스펙: `docs/superpowers/specs/2026-06-21-wave2-adaptive-face-analysis-design.md`.

---

# 트랙 A — 분석 모듈 (독립, TDD) — `src/vision/faceAnalysis.ts` (+ `.test.ts`)

## A1: 타입 + classify + recommend (TDD)

- [ ] **Step 1:** 신규 `src/vision/faceAnalysis.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyShape, recommendReshape } from "./faceAnalysis";

describe("classifyShape", () => {
  it("긴 얼굴: whRatio 낮음 → long", () => {
    expect(classifyShape({ whRatio: 0.72, jawToCheek: 0.8, foreheadToCheek: 0.85, chinRatio: 0.5 })).toBe("long");
  });
  it("둥근 얼굴: whRatio 높음 + 턱넓음 → round", () => {
    expect(classifyShape({ whRatio: 0.98, jawToCheek: 0.92, foreheadToCheek: 0.9, chinRatio: 0.5 })).toBe("round");
  });
  it("각진 얼굴: 턱폭 큼 → square", () => {
    expect(classifyShape({ whRatio: 0.86, jawToCheek: 0.95, foreheadToCheek: 0.9, chinRatio: 0.5 })).toBe("square");
  });
  it("하트형: 이마 넓고 턱 좁음 → heart", () => {
    expect(classifyShape({ whRatio: 0.86, jawToCheek: 0.7, foreheadToCheek: 1.02, chinRatio: 0.5 })).toBe("heart");
  });
  it("그 외 → oval", () => {
    expect(classifyShape({ whRatio: 0.85, jawToCheek: 0.82, foreheadToCheek: 0.9, chinRatio: 0.5 })).toBe("oval");
  });
});

describe("recommendReshape", () => {
  it("round 추천엔 slim/cheekbone 포함", () => {
    const r = recommendReshape("round");
    expect(r.slim).toBeGreaterThan(0);
    expect(r.cheekbone).toBeGreaterThan(0);
  });
  it("oval 추천은 비어있음(거의 없음)", () => {
    expect(Object.keys(recommendReshape("oval")).length).toBe(0);
  });
});
```

- [ ] **Step 2:** 실패 확인: `npx vitest run src/vision/faceAnalysis.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3:** 신규 `src/vision/faceAnalysis.ts`:

```ts
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type FaceShape = "oval" | "round" | "square" | "long" | "heart";

export interface FaceRatios {
  whRatio: number;        // 광대폭 / 얼굴높이
  jawToCheek: number;     // 턱폭 / 광대폭
  foreheadToCheek: number;// 이마폭 / 광대폭
  chinRatio: number;      // 하관(코밑~턱) / 전체높이
}

export interface FaceProfile {
  shape: FaceShape;
  ratios: FaceRatios;
  recommended: Record<string, number>;
}

export function classifyShape(r: FaceRatios): FaceShape {
  if (r.whRatio < 0.78) return "long";
  if (r.foreheadToCheek > 1.0 && r.jawToCheek < 0.78) return "heart";
  if (r.jawToCheek > 0.93) return r.whRatio > 0.95 ? "round" : "square";
  if (r.whRatio > 0.95) return "round";
  return "oval";
}

export function recommendReshape(shape: FaceShape): Record<string, number> {
  switch (shape) {
    case "round": return { slim: 30, cheekbone: 25, jaw: 20, faceSize: 15 };
    case "long": return { chinLength: 40, forehead: 20 }; // chinLength 50=중립, <50=짧게
    case "square": return { jaw: 35, slim: 15 };
    case "heart": return { cheekbone: 15, jaw: 10 };
    case "oval": default: return {};
  }
}

function d(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 단일 프레임 비율
function frameRatios(lm: NormalizedLandmark[]): FaceRatios {
  const cheekW = d(lm[234], lm[454]);
  const jawW = d(lm[172], lm[397]);
  const foreheadW = d(lm[54], lm[284]);
  const faceH = d(lm[10], lm[152]);
  const lowerH = d(lm[2], lm[152]); // 코밑~턱
  return {
    whRatio: cheekW / faceH,
    jawToCheek: jawW / cheekW,
    foreheadToCheek: foreheadW / cheekW,
    chinRatio: lowerH / faceH,
  };
}

export function analyzeFace(frames: NormalizedLandmark[][]): FaceProfile {
  const valid = frames.filter((f) => f && f.length >= 468);
  if (valid.length === 0) {
    const ratios: FaceRatios = { whRatio: 0.85, jawToCheek: 0.82, foreheadToCheek: 0.9, chinRatio: 0.5 };
    return { shape: "oval", ratios, recommended: {} };
  }
  const sum: FaceRatios = { whRatio: 0, jawToCheek: 0, foreheadToCheek: 0, chinRatio: 0 };
  for (const f of valid) {
    const r = frameRatios(f);
    sum.whRatio += r.whRatio; sum.jawToCheek += r.jawToCheek;
    sum.foreheadToCheek += r.foreheadToCheek; sum.chinRatio += r.chinRatio;
  }
  const n = valid.length;
  const ratios: FaceRatios = {
    whRatio: sum.whRatio / n, jawToCheek: sum.jawToCheek / n,
    foreheadToCheek: sum.foreheadToCheek / n, chinRatio: sum.chinRatio / n,
  };
  const shape = classifyShape(ratios);
  return { shape, ratios, recommended: recommendReshape(shape) };
}

export const SHAPE_LABEL_KO: Record<FaceShape, string> = {
  oval: "계란형", round: "둥근형", square: "각진형", long: "긴 얼굴형", heart: "하트형",
};
```

- [ ] **Step 4:** 통과 확인: `npx vitest run src/vision/faceAnalysis.test.ts` → PASS.
- [ ] **Step 5:** 커밋: `git add src/vision/faceAnalysis.ts src/vision/faceAnalysis.test.ts && git commit -m "feat(vision): 얼굴형 분석 모듈(classify/recommend/analyzeFace)"` (Co-Authored-By 금지).

---

# 트랙 B — 상태 (독립) — `types.ts`, `defaults.ts`, `reducer.ts`

## B1: faceProfile 상태 + reducer

- [ ] **Step 1:** `src/entities/scene/types.ts`: 상단에 import 추가 `import type { FaceProfile } from "../../vision/faceAnalysis";` 그리고 `AppState`에 `faceProfile?: FaceProfile;` 추가.
- [ ] **Step 2:** `src/entities/scene/reducer.ts`에 추가(상단 import: `import type { FaceProfile } from "../../vision/faceAnalysis";`):

```ts
export function setFaceProfile(s: AppState, profile: FaceProfile): AppState {
  return { ...s, faceProfile: profile };
}

// 추천 리쉐이프 프리셋을 활성 장면 reshape 레이어에 병합 + 켜기
export function applyRecommended(s: AppState, preset: Record<string, number>): AppState {
  return mapActiveScene(s, (scene) =>
    mapLayer(scene, "reshape", (l) => ({ ...l, enabled: true, params: { ...l.params, ...preset } }))
  );
}
```

- [ ] **Step 3:** `npx tsc --noEmit` 통과. (defaults.ts는 faceProfile이 optional이라 변경 불필요; mergeDefaults도 그대로 호환.)
- [ ] **Step 4:** 커밋: `git add src/entities/scene/types.ts src/entities/scene/reducer.ts && git commit -m "feat(state): faceProfile + setFaceProfile/applyRecommended"`

---

# 트랙 C — 통합 (A·B 완료 후) — reshape 정밀화 + shape 경로 + 온보딩

## C1: reshapeDeformers 정밀 타겟팅 + shape 강도

- [ ] **Step 1:** `src/pipeline/geometry/reshapeDeformers.ts`:
  - 상단 import: `import type { FaceShape } from "../../vision/faceAnalysis";`
  - 시그니처 변경: `export function buildDeformers(lm, p, shape?: FaceShape): Deformers`.
  - 광대 라인(현재 `add([C[0], eyeY], W * 0.72, ...)`)을 좌우 광대 정점 개별 deformer로 교체:
```ts
    // 광대 축소: 좌우 광대 정점(50/280)을 각각 안쪽으로
    const cbk = uni(p, "cheekbone") * 0.22 * shapeScale(shape, "cheekbone");
    const cbL = uv(lm, 50), cbR = uv(lm, 280);
    add(cbL, W * 0.32, H * 0.3, 0, 0, +cbk * W * 0.5, 0);
    add(cbR, W * 0.32, H * 0.3, 0, 0, -cbk * W * 0.5, 0);
```
  - slim/faceSize/forehead/jaw/chinLength 등 기존 항목의 강도에 `shapeScale(shape, key)` 곱하기(없으면 1).
  - 파일 하단에 헬퍼 추가:
```ts
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
```
  - 적용 예: `add(C, W * 0.78, H * 0.9, -uni(p, "slim") * 0.26 * shapeScale(shape,"slim"), 0);` 등 slim/faceSize/forehead/jaw에 곱.
- [ ] **Step 2:** `npx tsc --noEmit` 통과(기존 호출부는 shape 생략이라 호환).

## C2: pipeline → reshape에 shape 전달

- [ ] **Step 1:** `src/pipeline/passes/reshape.ts`: `import type { FaceShape } from "../../vision/faceAnalysis";`, 클래스에 `private shape: FaceShape | undefined;` + `setShape(s: FaceShape | undefined){ this.shape = s; }`. render의 `buildDeformers(landmarks, params)` → `buildDeformers(landmarks, params, this.shape)`.
- [ ] **Step 2:** `src/pipeline/pipeline.ts`: import `{ ReshapePass } from "./passes/reshape"` 및 `type FaceShape`. 메서드 추가:
```ts
  setFaceShape(shape: FaceShape | undefined): void {
    const r = this.passes.reshape;
    if (r instanceof ReshapePass) r.setShape(shape);
  }
```
- [ ] **Step 3:** `npx tsc --noEmit` 통과.

## C3: 온보딩 UI + main 배선

- [ ] **Step 1:** `index.html` `#stage` 안에 온보딩 오버레이 추가(기본 숨김):
```html
      <div id="onboarding" class="onboard hidden">
        <div class="onboard-card">
          <div class="onboard-title">얼굴 분석</div>
          <div class="onboard-msg" id="onboard-msg">얼굴을 정면으로 맞춰주세요</div>
          <div class="onboard-bar"><div class="onboard-fill" id="onboard-fill"></div></div>
          <button class="cta ghost" id="onboard-cancel">취소</button>
        </div>
      </div>
```
- [ ] **Step 2:** `src/app/styles.css`에 온보딩 스타일 추가:
```css
.onboard { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); backdrop-filter: blur(3px); z-index: 5; }
.onboard.hidden { display: none; }
.onboard-card { background: var(--surface); border: 1px solid var(--divider); border-radius: var(--radius-lg); padding: 22px 26px; text-align: center; width: 280px; box-shadow: var(--shadow); }
.onboard-title { font-weight: 700; color: var(--text-strong); margin-bottom: 8px; }
.onboard-msg { font-size: 13px; color: var(--text); margin-bottom: 14px; }
.onboard-bar { height: 6px; border-radius: 999px; background: var(--surface-3); overflow: hidden; margin-bottom: 14px; }
.onboard-fill { height: 100%; width: 0%; background: var(--accent); transition: width .1s; }
```
- [ ] **Step 3:** 제어탭(index.html `#dock-controls`)에 "얼굴 다시 분석" 버튼 추가: `<button class="cta ghost" id="reanalyze">얼굴 다시 분석</button>` (panic 다음).
- [ ] **Step 4:** 신규 `src/ui/onboarding.ts` — 캡처 컨트롤러:
```ts
import { analyzeFace, type FaceProfile } from "../vision/faceAnalysis";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const NEED = 45; // 약 1.5초(30fps) 안정 프레임

export class Onboarding {
  private el = document.getElementById("onboarding") as HTMLElement;
  private msg = document.getElementById("onboard-msg") as HTMLElement;
  private fill = document.getElementById("onboard-fill") as HTMLElement;
  private frames: NormalizedLandmark[][] = [];
  active = false;
  private onDone: ((p: FaceProfile) => void) | null = null;

  constructor() {
    (document.getElementById("onboard-cancel") as HTMLElement).addEventListener("click", () => this.stop());
  }
  start(onDone: (p: FaceProfile) => void): void {
    this.frames = []; this.active = true; this.onDone = onDone;
    this.el.classList.remove("hidden"); this.fill.style.width = "0%";
    this.msg.textContent = "얼굴을 정면으로 맞춰주세요";
  }
  stop(): void { this.active = false; this.el.classList.add("hidden"); }
  // 매 프레임 호출: 얼굴 있으면 수집, NEED 도달 시 분석
  feed(face: NormalizedLandmark[] | null): void {
    if (!this.active) return;
    if (!face) { this.msg.textContent = "얼굴이 안 보여요"; return; }
    this.msg.textContent = "분석 중… 가만히 있어주세요";
    this.frames.push(face);
    this.fill.style.width = `${Math.min(100, (this.frames.length / NEED) * 100)}%`;
    if (this.frames.length >= NEED) {
      const profile = analyzeFace(this.frames);
      this.stop();
      this.onDone?.(profile);
    }
  }
}
```
- [ ] **Step 5:** `src/app/main.ts` 배선:
  - import: `import { Onboarding } from "../ui/onboarding";`, reducer에서 `setFaceProfile, applyRecommended` 추가, `SHAPE_LABEL_KO`.
  - 인스턴스: `const onboarding = new Onboarding();`
  - 프로필 적용 헬퍼:
```ts
function applyProfile(profile: import("../vision/faceAnalysis").FaceProfile): void {
  store.update((st) => applyRecommended(setFaceProfile(st, profile), profile.recommended));
  pipeline.setFaceShape(profile.shape);
  showToast(`분석 완료: ${SHAPE_LABEL_KO[profile.shape]}`);
}
```
  - 시작 시 프로필 있으면 shape 반영, 없으면 첫 카메라 시작 후 온보딩:
    - `main()`의 `running = true;` 직전/직후에: `if (store.get().faceProfile) pipeline.setFaceShape(store.get().faceProfile!.shape); else onboarding.start(applyProfile);`
  - 루프 안에서 온보딩에 프레임 공급 + 캡처 중엔 원본: `loop()`에서 `faces[0]` 계산 후 `if (onboarding.active) { onboarding.feed(faces[0] ?? null); }`. 캡처 중 보정 미적용: `pipeline.render(current.video, onboarding.active ? activeLayers().map(l=>({...l,enabled:false})) : activeLayers(), faces[0] ?? null);`
  - "다시 분석" 버튼: `(document.getElementById("reanalyze") as HTMLElement).addEventListener("click", () => onboarding.start(applyProfile));`
- [ ] **Step 6:** `npx tsc --noEmit` + `npm test` + `npm run build` + `node --check electron/main.cjs` 통과.
- [ ] **Step 7:** 커밋: `git add -A && git commit -m "feat: KYC식 얼굴분석 온보딩 + reshape 정밀타겟팅/얼굴형 강도 + 추천 자동적용"`

---

# 통합 검증
- [ ] `npm test`(신규 분석 테스트 포함) + `npm run build` + electron check 통과.
- [ ] 실행 육안: 첫 실행 온보딩 진행바→추천 적용·토스트, "다시 분석" 동작, reshape 동작 유지.

## Self-Review
- 스펙 커버: 분석모듈(A), 상태(B), 정밀타겟팅+shape강도(C1/C2), 온보딩+추천적용(C3). 전부 매핑.
- 의존: C는 A(FaceShape/analyzeFace/FaceProfile)·B(setFaceProfile/applyRecommended)에 의존 → A·B 먼저(병렬), 그 후 C.
- 타입 일관성: FaceShape/FaceProfile/FaceRatios, setFaceProfile/applyRecommended/setFaceShape, recommended Record<string,number> 일치.
- best-effort 임계값/강도: 실기기 튜닝 필요(명시).
