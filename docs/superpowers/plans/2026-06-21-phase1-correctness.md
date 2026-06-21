# Phase 1 — 정합성/안정성 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코드베이스 분석에서 발견된 Critical/High 버그와 안전한 quick-win을 수정해 친구 배포본의 안정성을 높인다.

**Architecture:** 분석 문서 `docs/superpowers/specs/2026-06-21-codebase-analysis.md`의 C1·C2·H1·H2·H3 + 안전한 M4·L3를 개별 수정. 단위테스트 가능한 항목(persist, format)은 TDD, WebGL/런타임 항목은 빌드+추론 검증.

**Tech Stack:** TypeScript, WebGL2, MediaPipe, Electron, Vitest.

상위 검증(모든 태스크 공통): `npm test`(28+개 통과 유지), `npm run build`(tsc+vite 무에러).

---

## Task 1: glUtils 하드닝 — 셰이더 누수 + null 안전 (C1, L1)

**Files:**
- Modify: `src/gl/glUtils.ts:1-22`

- [ ] **Step 1: `compileProgram`/`compileShader`를 아래로 교체**

```ts
export function compileProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("WebGL 프로그램 생성 실패(컨텍스트 손실?)");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error("프로그램 링크 실패: " + log);
  }
  // 링크 후 셰이더 객체는 분리·삭제(GPU 컴파일 산출물 해제)
  gl.detachShader(prog, vs);
  gl.detachShader(prog, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("WebGL 셰이더 생성 실패(컨텍스트 손실?)");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("셰이더 컴파일 실패: " + log + "\n" + src);
  }
  return sh;
}
```

- [ ] **Step 2: 빌드/테스트 확인**

Run: `npm run build && npm test`
Expected: 둘 다 통과. (셰이더 분리/삭제는 링크 완료 프로그램 동작에 영향 없음 — WebGL 규약상 정상.)

- [ ] **Step 3: 커밋**

```bash
git add src/gl/glUtils.ts
git commit -m "fix(gl): 링크 후 셰이더 분리·삭제(누수 C1) + createProgram/Shader null 안전(L1)"
```
(커밋 메시지에 Co-Authored-By 금지.)

---

## Task 2: Tracker GPU→CPU 폴백 (C2)

GPU delegate 불가 PC에서 앱이 죽지 않도록 CPU로 폴백.

**Files:**
- Modify: `src/tracker.ts:15-27`

- [ ] **Step 1: `init()`을 아래로 교체**

```ts
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
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/tracker.ts
git commit -m "fix(tracker): GPU delegate 실패 시 CPU 폴백 — 비GPU PC 앱 사망 방지(C2)"
```

---

## Task 3: Segmenter GPU→CPU 폴백 (C2)

**Files:**
- Modify: `src/segmenter.ts:13-21`

- [ ] **Step 1: `init()`을 아래로 교체**

```ts
  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
    const create = (delegate: "GPU" | "CPU") =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/selfie_segmenter.tflite`, delegate },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    try {
      this.seg = await create("GPU");
    } catch (e) {
      console.warn("ImageSegmenter GPU delegate 실패 → CPU 폴백", e);
      this.seg = await create("CPU");
    }
  }
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/segmenter.ts
git commit -m "fix(segmenter): GPU delegate 실패 시 CPU 폴백(C2)"
```

---

## Task 4: MediaPipe 타임스탬프 단조증가 보장 (H1)

`performance.now()` 해상도 한계로 동일 타임스탬프가 detectForVideo에 들어가 예외나는 것 방지.

**Files:**
- Modify: `src/main.ts:31` (상태 변수 추가), `src/main.ts:99-117` (detectTs 사용)

- [ ] **Step 1: 상태 변수 추가**

`src/main.ts`의 `let lastFrameTime = 0;` 바로 아래에 추가:

```ts
let lastDetectTs = 0; // MediaPipe VIDEO 모드는 단조증가 타임스탬프 필요
```

- [ ] **Step 2: 루프에서 단조 타임스탬프 계산·사용**

`src/main.ts`의 `const frameStart = now;` 다음 줄에 추가:

```ts
    const detectTs = Math.max(frameStart, lastDetectTs + 1);
    lastDetectTs = detectTs;
```

그리고 `tracker.detect(current.video, frameStart)` → `tracker.detect(current.video, detectTs)` 로,
`segmenter.segment(current.video, frameStart)` → `segmenter.segment(current.video, detectTs)` 로 변경.
(fps/frame 메트릭과 `fpsMeter.tick(frameStart)` 등은 `frameStart` 그대로 둔다.)

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add src/main.ts
git commit -m "fix(loop): detectForVideo 타임스탬프 단조증가 보장 — 추론 에러 토스트 방지(H1)"
```

---

## Task 5: persist 빈 레이어 씬 거부 (H2) — TDD

**Files:**
- Modify: `src/state/persist.test.ts`, `src/state/persist.ts:13-18`

- [ ] **Step 1: 실패하는 테스트 추가**

`src/state/persist.test.ts` 파일을 열고, 기존 import/패턴을 확인한 뒤 아래 테스트를 추가한다(기존 테스트가 쓰는 정상 상태 생성 헬퍼/형태를 그대로 활용; 한 씬의 `layers`만 `[]`로 비운다):

```ts
import { deserialize } from "./persist";

test("빈 레이어 배열을 가진 씬은 거부(null 반환)", () => {
  const bad = {
    activeSceneId: "s1",
    activeCategory: "face",
    selectedLayerId: "skin",
    scenes: [{ id: "s1", name: "장면 1", layers: [] }],
  };
  expect(deserialize(JSON.stringify(bad))).toBeNull();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/state/persist.test.ts`
Expected: 새 테스트 FAIL (현재 `[].every()`가 true라 객체를 그대로 반환).

- [ ] **Step 3: `deserialize`의 layersOk에 길이 검사 추가**

`src/state/persist.ts`의 `layersOk` 블록을 아래로 교체:

```ts
    const layersOk = obj.scenes.every(
      (sc) =>
        Array.isArray(sc.layers) &&
        sc.layers.length > 0 &&
        sc.layers.every((l) => l && typeof l.params === "object" && typeof l.id === "string")
    );
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/state/persist.test.ts`
Expected: PASS (새 테스트 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git add src/state/persist.ts src/state/persist.test.ts
git commit -m "fix(persist): 빈 레이어 씬 거부 — EditorDock 크래시 방지(H2)"
```

---

## Task 6: makeup maskScratch 널가드 (H3)

**Files:**
- Modify: `src/gl/makeup.ts:127`

- [ ] **Step 1: render() 초기 가드에 maskScratch 추가**

`src/gl/makeup.ts`의:

```ts
    if (!this.maskGeom || !this.maskBlur || !this.workA || !this.workB || !landmarks) {
```

를:

```ts
    if (!this.maskGeom || !this.maskBlur || !this.workA || !this.workB || !this.maskScratch || !landmarks) {
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/gl/makeup.ts
git commit -m "fix(makeup): renderMask 전 maskScratch 널가드 추가(H3)"
```

---

## Task 7: parseResolution NaN 가드 (M4) — TDD

**Files:**
- Modify: `src/ui/format.test.ts`, `src/ui/format.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`src/ui/format.test.ts`에 추가(기존 import 패턴 확인 후):

```ts
import { parseResolution } from "./format";

test("형식이 잘못되면 throw(NaN 방지)", () => {
  expect(() => parseResolution("")).toThrow();
  expect(() => parseResolution("abc")).toThrow();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/ui/format.test.ts`
Expected: 새 테스트 FAIL (현재 NaN 반환, throw 안 함).

- [ ] **Step 3: `parseResolution`에 검증 추가**

`src/ui/format.ts` 전체를 아래로 교체:

```ts
export function parseResolution(value: string): { width: number; height: number } {
  const [width, height] = value.split("x").map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("잘못된 해상도 값: " + value);
  }
  return { width, height };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/ui/format.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/ui/format.ts src/ui/format.test.ts
git commit -m "fix(format): parseResolution NaN/음수 거부(M4)"
```

---

## Task 8: Electron 네비게이션 가드 (L3)

렌더러가 외부 URL로 이탈/새 창 여는 것을 차단(보안 하드닝).

**Files:**
- Modify: `electron/main.cjs`

- [ ] **Step 1: createWindow 끝에 가드 추가**

`electron/main.cjs`의 `createWindow()` 함수에서 창 로드 분기(`if (isDev) { ... } else { ... }`) **다음**에 아래를 추가:

```js
  // 외부 내비게이션/새 창 차단(file:// 보안 컨텍스트 유지)
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
```

- [ ] **Step 2: 문법 확인**

Run: `node --check electron/main.cjs && echo "syntax OK"`
Expected: `syntax OK`.

- [ ] **Step 3: 커밋**

```bash
git add electron/main.cjs
git commit -m "fix(electron): 외부 내비게이션/새 창 차단(L3)"
```

---

## 최종 검증

- [ ] **전체 테스트/빌드**

Run: `npm test && npm run build`
Expected: 모든 테스트 통과(+2 신규), 빌드 무에러.

---

## Self-Review 메모

- 커버: C1·L1(Task1), C2(Task2,3), H1(Task4), H2(Task5), H3(Task6), M4(Task7), L3(Task8).
- 이번 Phase 보류(의도적): M1(flip_y — 현 불변식에서 정상, 핫루프 getParameter 비용), M3(reducer 폴백 — 동작변경 위험), L2/L4/L5/L6 및 성능 항목 → Phase 2/4에서.
- TDD 적용: H2, M4(순수 로직, 단위테스트 가능). 나머지는 WebGL/런타임이라 빌드+실기기 검증.
