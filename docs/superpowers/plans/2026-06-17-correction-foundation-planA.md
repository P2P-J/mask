# 보정 토대 (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canvas 2D 렌더러를 WebGL2 파이프라인으로 교체하고, OBS식 4도크 레이아웃 + 보정 상태 모델 + 장면(프로필) + **실제로 동작하는 색보정**을 붙여, 슬라이더가 영상에 즉시 반영되는 토대를 완성한다. (풀 FabSoften 스무딩은 Plan B에서 이 토대 위에 얹는다.)

**Architecture:** 바닐라 TS. `src/state/`에 단일 출처 상태 모델(순수 reducer, localStorage 영속). `src/gl/`에 WebGL2 파이프라인(비디오 텍스처 → 패스 체인 핑퐁 → 캔버스). 메시 오버레이는 GL 캔버스 위 별도 2D 캔버스. UI는 OBS식 도크(장면/레이어/편집/제어)로 상태에 바인딩.

**Tech Stack:** Vite, TypeScript(strict), WebGL2, `@mediapipe/tasks-vision`, Vitest.

**스펙:** `docs/superpowers/specs/2026-06-17-correction-pipeline-design.md`

---

## 파일 구조

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/camera.ts`, `src/tracker.ts`, `src/metrics.ts` | 캡처/추적/측정 | 변경 없음 |
| `src/state/types.ts` | Layer/Scene/AppState 타입 | 신규 |
| `src/state/defaults.ts` | 기본 카테고리·레이어·장면 | 신규 |
| `src/state/reducer.ts` | 순수 상태 변환 함수 — **단위테스트** | 신규 |
| `src/state/store.ts` | 상태 보관 + 구독 + persist 연결 | 신규 |
| `src/state/persist.ts` | localStorage 직렬화/복원 — **단위테스트** | 신규 |
| `src/gl/glUtils.ts` | 셰이더 컴파일/텍스처/FBO/풀스크린 쿼드 | 신규 |
| `src/gl/pipeline.ts` | WebGL2 파이프라인(비디오 텍스처, 핑퐁, 패스 실행) | 신규 |
| `src/gl/passes.ts` | Pass 인터페이스 + colorPass + passthroughPass | 신규 |
| `src/gl/mapping.ts` | 슬라이더 0~100 → 유니폼 매핑 — **단위테스트** | 신규 |
| `src/renderer.ts` | (삭제) Canvas 2D 렌더러 | **삭제** |
| `src/ui/overlay.ts` | 메시 오버레이(별도 2D 캔버스) | 신규 |
| `src/ui/scenes.ts` | 장면 도크 | 신규 |
| `src/ui/layers.ts` | 레이어 도크 | 신규 |
| `src/ui/editor.ts` | 편집 도크(선택 레이어 슬라이더) | 신규 |
| `src/ui/dockControls.ts` | 제어 도크 + 카메라/해상도/fps + 진단 | 신규(controls.ts 대체) |
| `src/ui/controls.ts`, `src/ui/panel.ts` | 구 UI | **삭제** |
| `index.html`, `src/styles.css` | OBS 레이아웃 | 교체 |
| `src/main.ts` | rAF 루프: detect→store→pipeline→overlay→진단 | 교체 |

**병렬화:** Task 1(fps), Task 2~4(state), Task 5~7(gl), Task 8(OBS HTML/CSS)은 서로 독립이라 병렬 가능. Task 9(UI 도크)·Task 10(main 통합)은 위에 의존(직렬). 병렬 실행 시 worktree로 충돌 방지.

---

## Task 1: fps 버그 수정

**Files:**
- Modify: `src/main.ts` (throttle 타깃을 선택 fps로)

> 현재 throttle이 카메라 실제 fps(`actualFps`)로 제한 → 웹캠이 1080p에서 30만 주면 60 선택해도 30. 루프 타깃을 **선택 fps**로 바꿔 선택을 반영하고, 180Hz 과구동은 여전히 차단(최대 60).

- [ ] **Step 1: throttle 타깃 변경**

`src/main.ts`에서 아래 줄을 찾는다:
```ts
    const targetFps = current.actualFps || controls.fps;
```
다음으로 교체:
```ts
    const targetFps = controls.fps; // 선택한 fps로 루프 제한(고주사율 과구동 차단 + 선택 반영)
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/main.ts
git commit -m "fix: 루프 fps를 선택값으로 제한(60 선택 반영)"
```

> 주의: 이 Task는 현재 `main.ts`(controls 기반) 기준이다. Task 10에서 main.ts를 전면 교체할 때 이 로직(`targetFps = 선택 fps`)을 그대로 가져간다.

---

## Task 2: 상태 타입 + 기본값

**Files:**
- Create: `src/state/types.ts`, `src/state/defaults.ts`

- [ ] **Step 1: 타입 — `src/state/types.ts`**

```ts
export interface Layer {
  id: string; // 'smoothing' | 'color'
  name: string;
  category: string; // 'face'
  enabled: boolean;
  params: Record<string, number>; // 각 슬라이더 0~100
}

export interface Scene {
  id: string;
  name: string;
  layers: Layer[];
}

export interface AppState {
  scenes: Scene[];
  activeSceneId: string;
  activeCategory: string;
  selectedLayerId: string;
}
```

- [ ] **Step 2: 기본값 — `src/state/defaults.ts`**

```ts
import type { AppState, Layer } from "./types";

export function defaultLayers(): Layer[] {
  return [
    {
      id: "smoothing",
      name: "피부 스무딩",
      category: "face",
      enabled: true,
      params: { strength: 45, texture: 70 },
    },
    {
      id: "color",
      name: "색보정",
      category: "face",
      enabled: false,
      params: { brightness: 50, contrast: 50, tone: 50, white: 50 },
    },
  ];
}

// 렌더 순서(고정): 스무딩 → 색보정
export const LAYER_ORDER = ["smoothing", "color"] as const;

export const CATEGORIES = [
  { id: "face", name: "얼굴", enabled: true },
  { id: "body", name: "몸매", enabled: false },
  { id: "filter", name: "필터", enabled: false },
  { id: "makeup", name: "화장", enabled: false },
  { id: "bg", name: "배경", enabled: false },
] as const;

export function defaultState(): AppState {
  return {
    scenes: [{ id: "scene-1", name: "장면 1", layers: defaultLayers() }],
    activeSceneId: "scene-1",
    activeCategory: "face",
    selectedLayerId: "smoothing",
  };
}
```

- [ ] **Step 3: 타입체크 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 없음
```bash
git add src/state/types.ts src/state/defaults.ts
git commit -m "feat: 보정 상태 타입 및 기본 장면/레이어"
```

---

## Task 3: 순수 reducer (TDD)

**Files:**
- Create: `src/state/reducer.ts`
- Test: `src/state/reducer.test.ts`

- [ ] **Step 1: 실패 테스트 — `src/state/reducer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { defaultState } from "./defaults";
import {
  getActiveScene,
  getSelectedLayer,
  setParam,
  toggleLayer,
  selectLayer,
  switchScene,
  addScene,
} from "./reducer";

describe("reducer", () => {
  it("setParam은 활성 장면의 레이어 param만 바꾸고 불변", () => {
    const s0 = defaultState();
    const s1 = setParam(s0, "color", "brightness", 80);
    expect(getActiveScene(s1).layers.find((l) => l.id === "color")!.params.brightness).toBe(80);
    // 불변성: 원본 유지
    expect(getActiveScene(s0).layers.find((l) => l.id === "color")!.params.brightness).toBe(50);
  });

  it("toggleLayer는 enabled를 뒤집음", () => {
    const s0 = defaultState();
    const s1 = toggleLayer(s0, "color");
    expect(getActiveScene(s1).layers.find((l) => l.id === "color")!.enabled).toBe(true);
  });

  it("selectLayer는 선택 레이어 변경", () => {
    const s1 = selectLayer(defaultState(), "color");
    expect(s1.selectedLayerId).toBe("color");
    expect(getSelectedLayer(s1).id).toBe("color");
  });

  it("addScene은 현재 장면 보정값을 복제한 새 장면을 활성화", () => {
    let s = setParam(defaultState(), "color", "brightness", 80);
    s = addScene(s, "장면 2");
    expect(s.scenes.length).toBe(2);
    expect(s.activeSceneId).not.toBe("scene-1");
    expect(getActiveScene(s).layers.find((l) => l.id === "color")!.params.brightness).toBe(80);
    // 새 장면 편집이 원래 장면에 영향 없음
    const s2 = setParam(s, "color", "brightness", 10);
    expect(s2.scenes[0].layers.find((l) => l.id === "color")!.params.brightness).toBe(80);
  });

  it("switchScene은 활성 장면 변경", () => {
    let s = addScene(defaultState(), "장면 2");
    s = switchScene(s, "scene-1");
    expect(s.activeSceneId).toBe("scene-1");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — "Failed to resolve import './reducer'"

- [ ] **Step 3: 구현 — `src/state/reducer.ts`**

```ts
import type { AppState, Layer, Scene } from "./types";

export function getActiveScene(s: AppState): Scene {
  return s.scenes.find((sc) => sc.id === s.activeSceneId) ?? s.scenes[0];
}

export function getSelectedLayer(s: AppState): Layer {
  const scene = getActiveScene(s);
  return scene.layers.find((l) => l.id === s.selectedLayerId) ?? scene.layers[0];
}

export function getCategoryLayers(s: AppState, category: string): Layer[] {
  return getActiveScene(s).layers.filter((l) => l.category === category);
}

function mapActiveScene(s: AppState, fn: (scene: Scene) => Scene): AppState {
  return { ...s, scenes: s.scenes.map((sc) => (sc.id === s.activeSceneId ? fn(sc) : sc)) };
}

function mapLayer(scene: Scene, layerId: string, fn: (l: Layer) => Layer): Scene {
  return { ...scene, layers: scene.layers.map((l) => (l.id === layerId ? fn(l) : l)) };
}

export function setParam(s: AppState, layerId: string, key: string, value: number): AppState {
  return mapActiveScene(s, (scene) =>
    mapLayer(scene, layerId, (l) => ({ ...l, params: { ...l.params, [key]: value } }))
  );
}

export function toggleLayer(s: AppState, layerId: string): AppState {
  return mapActiveScene(s, (scene) =>
    mapLayer(scene, layerId, (l) => ({ ...l, enabled: !l.enabled }))
  );
}

export function selectLayer(s: AppState, layerId: string): AppState {
  return { ...s, selectedLayerId: layerId };
}

export function setCategory(s: AppState, category: string): AppState {
  return { ...s, activeCategory: category };
}

export function switchScene(s: AppState, sceneId: string): AppState {
  return { ...s, activeSceneId: sceneId };
}

let sceneSeq = 1;
export function addScene(s: AppState, name: string): AppState {
  const cloneId = `scene-${Date.now()}-${sceneSeq++}`;
  const cloned: Scene = {
    id: cloneId,
    name,
    layers: getActiveScene(s).layers.map((l) => ({ ...l, params: { ...l.params } })),
  };
  return { ...s, scenes: [...s.scenes, cloned], activeSceneId: cloneId };
}

export function removeScene(s: AppState, sceneId: string): AppState {
  if (s.scenes.length <= 1) return s; // 최소 1개 유지
  const scenes = s.scenes.filter((sc) => sc.id !== sceneId);
  const activeSceneId = s.activeSceneId === sceneId ? scenes[0].id : s.activeSceneId;
  return { ...s, scenes, activeSceneId };
}
```

> 주의: `Date.now()`는 런타임 ID 생성용(테스트는 값 비교 안 함). 테스트는 개수·param만 검증.

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm test`
Expected: PASS (reducer 5 + 기존 metrics 5 + format 2 = 12)
```bash
git add src/state/reducer.ts src/state/reducer.test.ts
git commit -m "feat: 보정 상태 순수 reducer (TDD)"
```

---

## Task 4: persist (localStorage, TDD)

**Files:**
- Create: `src/state/persist.ts`
- Test: `src/state/persist.test.ts`
- Create: `src/state/store.ts`

- [ ] **Step 1: 실패 테스트 — `src/state/persist.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "./persist";
import { defaultState } from "./defaults";

describe("persist", () => {
  it("직렬화 후 역직렬화하면 동일 상태", () => {
    const s = defaultState();
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("손상된 입력은 null", () => {
    expect(deserialize("{not json")).toBeNull();
    expect(deserialize("null")).toBeNull();
    expect(deserialize('{"scenes":[]}')).toBeNull(); // scenes 비면 무효
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — "Failed to resolve import './persist'"

- [ ] **Step 3: 구현 — `src/state/persist.ts`**

```ts
import type { AppState } from "./types";

export function serialize(s: AppState): string {
  return JSON.stringify(s);
}

export function deserialize(raw: string): AppState | null {
  try {
    const obj = JSON.parse(raw) as AppState | null;
    if (!obj || !Array.isArray(obj.scenes) || obj.scenes.length === 0) return null;
    if (!obj.activeSceneId || !obj.activeCategory || !obj.selectedLayerId) return null;
    return obj;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: PASS (persist 2 추가)

- [ ] **Step 5: store — `src/state/store.ts`**

```ts
import type { AppState } from "./types";
import { defaultState } from "./defaults";
import { serialize, deserialize } from "./persist";

const KEY = "mask.state.v1";
type Listener = (s: AppState) => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor() {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    this.state = (raw && deserialize(raw)) || defaultState();
  }

  get(): AppState {
    return this.state;
  }

  // reducer 함수를 받아 상태 갱신 + 영속 + 구독자 통지
  update(fn: (s: AppState) => AppState): void {
    this.state = fn(this.state);
    try {
      localStorage.setItem(KEY, serialize(this.state));
    } catch {
      /* 저장 실패 무시(프라이빗 모드 등) */
    }
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(l: Listener): void {
    this.listeners.add(l);
  }
}
```

- [ ] **Step 6: 타입체크 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 없음
```bash
git add src/state/persist.ts src/state/persist.test.ts src/state/store.ts
git commit -m "feat: 상태 localStorage 영속 + Store (TDD)"
```

---

## Task 5: 슬라이더→유니폼 매핑 (TDD)

**Files:**
- Create: `src/gl/mapping.ts`
- Test: `src/gl/mapping.test.ts`

- [ ] **Step 1: 실패 테스트 — `src/gl/mapping.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { colorUniforms } from "./mapping";

describe("colorUniforms", () => {
  it("기본 50은 무변화(brightness 0, contrast 1, tone 0, white 0)", () => {
    const u = colorUniforms({ brightness: 50, contrast: 50, tone: 50, white: 50 });
    expect(u.brightness).toBeCloseTo(0, 5);
    expect(u.contrast).toBeCloseTo(1, 5);
    expect(u.tone).toBeCloseTo(0, 5);
    expect(u.white).toBeCloseTo(0, 5);
  });

  it("brightness 100 → +0.5, 0 → -0.5", () => {
    expect(colorUniforms({ brightness: 100, contrast: 50, tone: 50, white: 50 }).brightness).toBeCloseTo(0.5, 5);
    expect(colorUniforms({ brightness: 0, contrast: 50, tone: 50, white: 50 }).brightness).toBeCloseTo(-0.5, 5);
  });

  it("contrast 0 → 0.5, 100 → 1.5", () => {
    expect(colorUniforms({ brightness: 50, contrast: 0, tone: 50, white: 50 }).contrast).toBeCloseTo(0.5, 5);
    expect(colorUniforms({ brightness: 50, contrast: 100, tone: 50, white: 50 }).contrast).toBeCloseTo(1.5, 5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — "Failed to resolve import './mapping'"

- [ ] **Step 3: 구현 — `src/gl/mapping.ts`**

```ts
export interface ColorUniforms {
  brightness: number; // -0.5..0.5
  contrast: number; // 0.5..1.5
  tone: number; // -1..1 (warm/cool)
  white: number; // -1..1
}

// 슬라이더 0~100(50=중립) → 셰이더 유니폼
export function colorUniforms(p: Record<string, number>): ColorUniforms {
  return {
    brightness: (p.brightness - 50) / 100, // ±0.5
    contrast: 0.5 + p.contrast / 100, // 0.5..1.5
    tone: (p.tone - 50) / 50, // ±1
    white: (p.white - 50) / 50, // ±1
  };
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm test`
Expected: PASS (mapping 3 추가)
```bash
git add src/gl/mapping.ts src/gl/mapping.test.ts
git commit -m "feat: 색보정 슬라이더→유니폼 매핑 (TDD)"
```

---

## Task 6: WebGL2 유틸 + 파이프라인 스캐폴드(패스스루)

**Files:**
- Create: `src/gl/glUtils.ts`, `src/gl/pipeline.ts`, `src/gl/passes.ts`

> 단위테스트 없음(WebGL2 컨텍스트 필요, jsdom 미지원). Task 12 수동 검증.

- [ ] **Step 1: GL 유틸 — `src/gl/glUtils.ts`**

```ts
export function compileProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("프로그램 링크 실패: " + gl.getProgramInfoLog(prog));
  }
  return prog;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("셰이더 컴파일 실패: " + gl.getShaderInfoLog(sh) + "\n" + src);
  }
  return sh;
}

// 풀스크린 삼각형(쿼드 대용) VAO 생성
export function createFullscreenVAO(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // 화면을 덮는 큰 삼각형
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

export function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

export interface RenderTarget {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
}

export function createRenderTarget(gl: WebGL2RenderingContext, w: number, h: number): RenderTarget {
  const tex = createTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

export const FULLSCREEN_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;
```

- [ ] **Step 2: 패스 정의 — `src/gl/passes.ts`**

```ts
import { compileProgram, FULLSCREEN_VS } from "./glUtils";
import { colorUniforms } from "./mapping";

// 각 패스: 입력 텍스처 + params로 현재 바인딩된 FBO에 풀스크린 렌더
export interface Pass {
  id: string;
  use(gl: WebGL2RenderingContext, inputTex: WebGLTexture, params: Record<string, number>): void;
}

const PASSTHROUGH_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 o;
void main(){ o = texture(u_tex, v_uv); }`;

const COLOR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_tone;
uniform float u_white;
out vec4 o;
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  c += u_brightness;
  c = (c - 0.5) * u_contrast + 0.5;
  c.r += u_tone * 0.06; c.b -= u_tone * 0.06;
  c.r += u_white * 0.04; c.b += u_white * 0.04;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function createPasses(gl: WebGL2RenderingContext): Record<string, Pass> {
  const passthroughProg = compileProgram(gl, FULLSCREEN_VS, PASSTHROUGH_FS);
  const colorProg = compileProgram(gl, FULLSCREEN_VS, COLOR_FS);

  const bindInput = (prog: WebGLProgram, tex: WebGLTexture) => {
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, "u_tex"), 0);
  };

  return {
    // 스무딩: Plan A에서는 패스스루(자리표시), Plan B에서 FabSoften으로 교체
    smoothing: {
      id: "smoothing",
      use(gl, inputTex) {
        bindInput(passthroughProg, inputTex);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    },
    color: {
      id: "color",
      use(gl, inputTex, params) {
        bindInput(colorProg, inputTex);
        const u = colorUniforms(params);
        gl.uniform1f(gl.getUniformLocation(colorProg, "u_brightness"), u.brightness);
        gl.uniform1f(gl.getUniformLocation(colorProg, "u_contrast"), u.contrast);
        gl.uniform1f(gl.getUniformLocation(colorProg, "u_tone"), u.tone);
        gl.uniform1f(gl.getUniformLocation(colorProg, "u_white"), u.white);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    },
  };
}
```

- [ ] **Step 3: 파이프라인 — `src/gl/pipeline.ts`**

```ts
import {
  createFullscreenVAO,
  createTexture,
  createRenderTarget,
  type RenderTarget,
} from "./glUtils";
import { createPasses, type Pass } from "./passes";
import type { Layer } from "../state/types";

export class Pipeline {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private videoTex: WebGLTexture;
  private passes: Record<string, Pass>;
  private a: RenderTarget | null = null;
  private b: RenderTarget | null = null;
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2를 사용할 수 없습니다");
    this.gl = gl;
    this.vao = createFullscreenVAO(gl);
    this.videoTex = createTexture(gl);
    this.passes = createPasses(gl);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // 비디오 상하 반전 보정
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.gl.canvas.width = w;
    this.gl.canvas.height = h;
    this.a = createRenderTarget(this.gl, w, h);
    this.b = createRenderTarget(this.gl, w, h);
  }

  // 활성 enabled 레이어(고정 순서 정렬된 배열)를 순서대로 적용
  render(video: HTMLVideoElement, layers: Layer[]): void {
    const gl = this.gl;
    if (!this.a || !this.b) return;
    // 1) 비디오 → videoTex
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.w, this.h);

    const enabled = layers.filter((l) => l.enabled && this.passes[l.id]);
    if (enabled.length === 0) {
      // 보정 없음: 비디오 그대로 캔버스로
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.blitPassthrough(this.videoTex);
      gl.bindVertexArray(null);
      return;
    }

    let input = this.videoTex;
    let src = this.a;
    let dst = this.b;
    enabled.forEach((layer, i) => {
      const last = i === enabled.length - 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, last ? null : dst.fbo);
      this.passes[layer.id].use(gl, input, layer.params);
      if (!last) {
        input = dst.tex;
        [src, dst] = [dst, src];
      }
    });
    gl.bindVertexArray(null);
  }

  private blitPassthrough(tex: WebGLTexture): void {
    // passes.smoothing가 패스스루 프로그램을 들고 있으므로 재사용
    this.passes.smoothing.use(this.gl, tex, {});
  }
}
```

- [ ] **Step 4: 타입체크 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 없음
```bash
git add src/gl/glUtils.ts src/gl/passes.ts src/gl/pipeline.ts
git commit -m "feat: WebGL2 파이프라인(패스스루+색보정 패스, FBO 핑퐁)"
```

---

## Task 7: 메시 오버레이(별도 2D 캔버스)

**Files:**
- Create: `src/ui/overlay.ts`

- [ ] **Step 1: 구현 — `src/ui/overlay.ts`**

```ts
import { DrawingUtils, FaceLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

// GL 캔버스 위에 겹치는 투명 2D 캔버스에 메시만 그림
export class MeshOverlay {
  private ctx: CanvasRenderingContext2D;
  private drawingUtils: DrawingUtils;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("오버레이 2D 컨텍스트 실패");
    this.ctx = ctx;
    this.drawingUtils = new DrawingUtils(ctx);
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  draw(faces: NormalizedLandmark[][], show: boolean): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!show) return;
    for (const landmarks of faces) {
      this.drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#C0C0C070", lineWidth: 1 }
      );
    }
  }
}
```

- [ ] **Step 2: 타입체크 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 없음
```bash
git add src/ui/overlay.ts
git commit -m "feat: 메시 오버레이(별도 2D 캔버스)"
```

---

## Task 8: OBS 레이아웃 마크업 + 스타일

**Files:**
- Modify: `index.html` (전체 교체)
- Modify: `src/styles.css` (전체 교체)

- [ ] **Step 1: `index.html` 전체 교체**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mask</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="topbar">
      <div class="brand"><span class="dot"></span> Mask</div>
      <div class="group">
        <select id="device" class="tds-select"></select>
        <select id="resolution" class="tds-select">
          <option value="1280x720">720p</option>
          <option value="1920x1080" selected>1080p</option>
        </select>
        <select id="fps" class="tds-select">
          <option value="30" selected>30fps</option>
          <option value="60">60fps</option>
        </select>
        <button id="diag-toggle" class="tds-toggle-btn">진단 ▾</button>
      </div>
    </div>

    <div id="stage">
      <canvas id="gl-canvas"></canvas>
      <canvas id="overlay-canvas"></canvas>
      <div class="live-badge"><span class="live-dot"></span><span id="live-fps">— fps</span></div>
      <div id="error"></div>
      <div id="diagnostics">
        <div id="stats">초기화 중…</div>
        <label><input type="checkbox" id="overlay" checked /> 메시 오버레이</label>
      </div>
    </div>

    <div id="docks">
      <section class="dock" id="dock-scenes">
        <header>장면<button id="scene-add" title="현재 보정으로 새 장면">＋</button></header>
        <div class="dock-body" id="scene-list"></div>
      </section>
      <section class="dock" id="dock-layers">
        <header>레이어</header>
        <div class="dock-body" id="layer-list"></div>
      </section>
      <section class="dock" id="dock-editor">
        <header id="editor-title">편집</header>
        <div class="dock-body" id="editor-body"></div>
      </section>
      <section class="dock" id="dock-controls">
        <header>제어</header>
        <div class="dock-body">
          <button class="cta primary" id="vcam" disabled>● 가상캠 시작 (준비 중)</button>
          <button class="cta ghost" id="toggle-correction">보정 On/Off</button>
          <button class="cta ghost" id="before-after">Before/After</button>
          <button class="cta ghost" id="panic">패닉</button>
        </div>
      </section>
    </div>

    <div id="toast"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: `src/styles.css` 전체 교체**

```css
:root {
  --primary: #ee9678; --primary-strong: #e8896b; --secondary: #f6b9a3;
  --track: #f7e3da; --bg: #fffcfa; --panel: #ffffff; --rail: #fdf1ec;
  --border: #f7e7e0; --text-strong: #5e463d; --text: #8a7068; --text-muted: #b9a79f;
  --radius-lg: 16px; --radius-md: 12px; --shadow: 0 8px 24px rgba(232,137,107,.12);
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  background: var(--bg); color: var(--text);
  display: flex; flex-direction: column; height: 100vh; overflow: hidden;
}

#topbar { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border); }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--primary-strong); font-size: 15px; }
.brand .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--secondary); }
#topbar .group { display: flex; gap: 8px; align-items: center; }
.tds-select {
  appearance: none; border: 1px solid var(--border); background: var(--panel);
  border-radius: 999px; padding: 6px 30px 6px 14px; font-size: 13px; color: var(--text-strong);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a7068'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 12px center;
}
.tds-toggle-btn { border: 1px solid var(--border); background: var(--panel); color: var(--text); border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer; }

/* 상단 미리보기 */
#stage { flex: 1; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; padding: 14px; overflow: hidden; }
#gl-canvas, #overlay-canvas { position: absolute; max-width: calc(100% - 28px); max-height: calc(100% - 28px); border-radius: var(--radius-lg); }
#gl-canvas { background: #000; box-shadow: var(--shadow); }
#overlay-canvas { pointer-events: none; }
.live-badge { position: absolute; top: 24px; left: 24px; display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,.85); border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--text-strong); font-weight: 600; }
.live-badge .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #e8896b; }
#error { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); color: var(--primary-strong); font-size: 14px; text-align: center; }
#diagnostics { display: none; position: absolute; top: 24px; right: 24px; width: 210px; background: rgba(255,255,255,.92); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px; box-shadow: var(--shadow); }
#diagnostics.open { display: block; }
#stats { white-space: pre; font-family: ui-monospace, monospace; font-size: 12px; color: var(--text-strong); }
#diagnostics label { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 10px; }

/* 하단 도크 */
#docks { display: flex; height: 220px; border-top: 1px solid var(--border); }
.dock { flex: 1; border-right: 1px solid var(--border); display: flex; flex-direction: column; min-width: 0; }
.dock:last-child { border-right: none; }
#dock-scenes, #dock-controls { max-width: 180px; }
.dock > header { background: var(--rail); padding: 7px 12px; font-size: 11px; font-weight: 700; color: #9c7d72; display: flex; justify-content: space-between; align-items: center; }
.dock > header button { border: none; background: transparent; color: var(--primary-strong); font-size: 14px; cursor: pointer; }
.dock-body { padding: 8px; overflow-y: auto; flex: 1; }

/* 장면/레이어 행 */
.row { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; cursor: pointer; font-size: 12px; color: var(--text-strong); }
.row.sel { background: var(--rail); font-weight: 700; }
.row .eye { width: 16px; text-align: center; color: var(--primary-strong); }
.row .eye.off { color: var(--text-muted); }
.row .name { flex: 1; }
.row.soon { opacity: .5; }
.scene-row.active { background: #fff; box-shadow: 0 1px 4px rgba(232,137,107,.15); font-weight: 700; color: var(--primary-strong); }

/* 편집 슬라이더 */
.slider-row { margin-bottom: 12px; }
.slider-row .label { display: flex; justify-content: space-between; font-size: 12px; color: var(--text); margin-bottom: 6px; }
.slider-row .label b { color: var(--primary-strong); font-weight: 600; }
.editor-empty { color: var(--text-muted); font-size: 12px; padding: 8px; }
input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 9px; border-radius: 999px; background: var(--track); outline: none; }
input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--primary); box-shadow: 0 1px 4px rgba(232,137,107,.4); cursor: pointer; }

/* 제어 */
.cta { display: block; width: 100%; margin: 5px 0; border-radius: 999px; padding: 9px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.cta.primary { background: var(--primary); color: #fff; }
.cta.ghost { background: var(--panel); border: 1px solid var(--border); color: var(--text); font-weight: 500; }
.cta.active { background: var(--secondary); color: #fff; }
.cta:disabled { opacity: .5; cursor: not-allowed; }

#toast { position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%); background: var(--text-strong); color: #fff; padding: 8px 16px; border-radius: 999px; font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; }
#toast.show { opacity: .95; }
```

- [ ] **Step 3: 커밋**

```bash
git add index.html src/styles.css
git commit -m "feat: OBS식 4도크 레이아웃 마크업+스타일"
```

---

## Task 9: UI 도크 모듈 (상태 바인딩)

**Files:**
- Create: `src/ui/dockControls.ts`, `src/ui/scenes.ts`, `src/ui/layers.ts`, `src/ui/editor.ts`
- Delete: `src/ui/controls.ts`, `src/ui/panel.ts`

> 단위테스트 없음(DOM 의존). Task 12 수동 검증. 모든 모듈은 `Store`를 받아 상태를 읽고 `store.update(reducer)`로 갱신, `store.subscribe`로 다시 그림.

- [ ] **Step 1: 제어/카메라/진단 — `src/ui/dockControls.ts`**

```ts
import { parseResolution } from "./format";

export interface DiagnosticsSnapshot {
  fps: number; inferenceMs: number; frameMs: number;
  requested: string; actual: string; faceDetected: boolean; jsHeapMb: number | null;
}

export interface DockControlsCallbacks {
  onSourceChange: () => void;
  onToggleCorrection: (on: boolean) => void;
  onBeforeAfter: (showOriginal: boolean) => void;
  onPanic: () => void;
}

export class DockControls {
  private deviceEl = document.getElementById("device") as HTMLSelectElement;
  private resolutionEl = document.getElementById("resolution") as HTMLSelectElement;
  private fpsEl = document.getElementById("fps") as HTMLSelectElement;
  private overlayEl = document.getElementById("overlay") as HTMLInputElement;
  private statsEl = document.getElementById("stats") as HTMLElement;
  private errorEl = document.getElementById("error") as HTMLElement;
  private liveFpsEl = document.getElementById("live-fps") as HTMLElement;
  private diagEl = document.getElementById("diagnostics") as HTMLElement;
  private diagToggleEl = document.getElementById("diag-toggle") as HTMLButtonElement;
  private correctionEl = document.getElementById("toggle-correction") as HTMLButtonElement;
  private beforeAfterEl = document.getElementById("before-after") as HTMLButtonElement;
  private panicEl = document.getElementById("panic") as HTMLButtonElement;

  constructor(cb: DockControlsCallbacks) {
    this.deviceEl.addEventListener("change", () => cb.onSourceChange());
    this.resolutionEl.addEventListener("change", () => cb.onSourceChange());
    this.fpsEl.addEventListener("change", () => cb.onSourceChange());
    this.diagToggleEl.addEventListener("click", () => this.diagEl.classList.toggle("open"));
    this.correctionEl.addEventListener("click", () => {
      this.correctionEl.classList.toggle("active");
      cb.onToggleCorrection(!this.correctionEl.classList.contains("active"));
    });
    this.beforeAfterEl.addEventListener("click", () => {
      this.beforeAfterEl.classList.toggle("active");
      cb.onBeforeAfter(this.beforeAfterEl.classList.contains("active"));
    });
    this.panicEl.addEventListener("click", () => cb.onPanic());
  }

  get overlayEnabled(): boolean { return this.overlayEl.checked; }
  get resolution(): { width: number; height: number } { return parseResolution(this.resolutionEl.value); }
  get fps(): number { return Number(this.fpsEl.value); }
  get deviceId(): string | undefined { return this.deviceEl.value || undefined; }

  setDevices(devices: MediaDeviceInfo[]): void {
    this.deviceEl.innerHTML = "";
    devices.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `카메라 ${i + 1}`;
      this.deviceEl.appendChild(opt);
    });
  }

  updateDiagnostics(s: DiagnosticsSnapshot): void {
    this.liveFpsEl.textContent = `${s.fps.toFixed(0)} fps`;
    this.statsEl.textContent =
      `FPS:     ${s.fps.toFixed(1)}\n추론:    ${s.inferenceMs.toFixed(1)} ms\n` +
      `프레임:  ${s.frameMs.toFixed(1)} ms\n요청:    ${s.requested}\n실제:    ${s.actual}\n` +
      `얼굴:    ${s.faceDetected ? "검출됨" : "없음"}\nJS 힙:   ${s.jsHeapMb !== null ? s.jsHeapMb.toFixed(0) + " MB" : "N/A"}`;
  }

  showError(msg: string): void { this.errorEl.textContent = msg; }
  clearError(): void { this.errorEl.textContent = ""; }
}
```

- [ ] **Step 2: 장면 도크 — `src/ui/scenes.ts`**

```ts
import type { Store } from "../state/store";
import { switchScene, addScene } from "../state/reducer";

export class ScenesDock {
  private listEl = document.getElementById("scene-list") as HTMLElement;
  private addEl = document.getElementById("scene-add") as HTMLButtonElement;

  constructor(private store: Store) {
    this.addEl.addEventListener("click", () => {
      const n = this.store.get().scenes.length + 1;
      this.store.update((s) => addScene(s, `장면 ${n}`));
    });
    this.store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const s = this.store.get();
    this.listEl.innerHTML = "";
    s.scenes.forEach((scene) => {
      const row = document.createElement("div");
      row.className = "row scene-row" + (scene.id === s.activeSceneId ? " active" : "");
      row.textContent = scene.name;
      row.addEventListener("click", () => this.store.update((st) => switchScene(st, scene.id)));
      this.listEl.appendChild(row);
    });
  }
}
```

- [ ] **Step 3: 레이어 도크 — `src/ui/layers.ts`**

```ts
import type { Store } from "../state/store";
import { getCategoryLayers, toggleLayer, selectLayer } from "../state/reducer";

export class LayersDock {
  private listEl = document.getElementById("layer-list") as HTMLElement;

  constructor(private store: Store) {
    this.store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const s = this.store.get();
    const layers = getCategoryLayers(s, s.activeCategory);
    this.listEl.innerHTML = "";
    layers.forEach((layer) => {
      const row = document.createElement("div");
      row.className = "row" + (layer.id === s.selectedLayerId ? " sel" : "");
      const eye = document.createElement("span");
      eye.className = "eye" + (layer.enabled ? "" : " off");
      eye.textContent = layer.enabled ? "◉" : "○";
      eye.addEventListener("click", (e) => {
        e.stopPropagation();
        this.store.update((st) => toggleLayer(st, layer.id));
      });
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = layer.name;
      row.append(eye, name);
      row.addEventListener("click", () => this.store.update((st) => selectLayer(st, layer.id)));
      this.listEl.appendChild(row);
    });
  }
}
```

- [ ] **Step 4: 편집 도크 — `src/ui/editor.ts`**

```ts
import type { Store } from "../state/store";
import { getSelectedLayer, setParam } from "../state/reducer";

// 슬라이더 라벨(한국어)
const LABELS: Record<string, string> = {
  strength: "강도", texture: "질감 보존",
  brightness: "밝기", contrast: "대비", tone: "톤", white: "화이트밸런스",
};

export class EditorDock {
  private titleEl = document.getElementById("editor-title") as HTMLElement;
  private bodyEl = document.getElementById("editor-body") as HTMLElement;

  constructor(private store: Store) {
    this.store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const layer = getSelectedLayer(this.store.get());
    this.titleEl.textContent = `편집 — ${layer.name}`;
    this.bodyEl.innerHTML = "";
    const keys = Object.keys(layer.params);
    if (keys.length === 0) {
      const e = document.createElement("div");
      e.className = "editor-empty";
      e.textContent = "조절할 항목이 없습니다";
      this.bodyEl.appendChild(e);
      return;
    }
    keys.forEach((key) => {
      const wrap = document.createElement("div");
      wrap.className = "slider-row";
      const label = document.createElement("div");
      label.className = "label";
      const val = document.createElement("b");
      val.textContent = String(layer.params[key]);
      const span = document.createElement("span");
      span.textContent = LABELS[key] ?? key;
      label.append(span, val);
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0"; slider.max = "100";
      slider.value = String(layer.params[key]);
      slider.addEventListener("input", () => {
        val.textContent = slider.value;
        this.store.update((st) => setParam(st, layer.id, key, Number(slider.value)));
      });
      wrap.append(label, slider);
      this.bodyEl.appendChild(wrap);
    });
  }
}
```

- [ ] **Step 5: 타입체크 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (구 controls.ts/panel.ts는 아직 존재하고 main.ts가 그것들을 import 중이므로 모두 resolve됨. 신규 도크 모듈 연결과 구 모듈 삭제는 Task 10에서.)
```bash
git add src/ui/dockControls.ts src/ui/scenes.ts src/ui/layers.ts src/ui/editor.ts
git commit -m "feat: OBS 도크 UI 모듈(제어/장면/레이어/편집) 상태 바인딩"
```

---

## Task 10: main.ts 통합 (GL 파이프라인 + 상태 + 오버레이)

**Files:**
- Modify: `src/main.ts` (전체 교체)
- Delete: `src/renderer.ts`

- [ ] **Step 1: `src/main.ts` 전체 교체**

```ts
import * as camera from "./camera";
import { Tracker } from "./tracker";
import { Pipeline } from "./gl/pipeline";
import { MeshOverlay } from "./ui/overlay";
import { FpsMeter, LatencyMeter } from "./metrics";
import { Store } from "./state/store";
import { getActiveScene } from "./state/reducer";
import { LAYER_ORDER } from "./state/defaults";
import { DockControls } from "./ui/dockControls";
import { ScenesDock } from "./ui/scenes";
import { LayersDock } from "./ui/layers";
import { EditorDock } from "./ui/editor";

const glCanvas = document.getElementById("gl-canvas") as HTMLCanvasElement;
const overlayCanvas = document.getElementById("overlay-canvas") as HTMLCanvasElement;
const tracker = new Tracker();
const pipeline = new Pipeline(glCanvas);
const overlay = new MeshOverlay(overlayCanvas);
const fpsMeter = new FpsMeter(0.1);
const latencyMeter = new LatencyMeter(0.1);
const frameMeter = new LatencyMeter(0.1);
const store = new Store();

let current: camera.CameraInfo | null = null;
let running = false;
let requestedLabel = "";
let lastFrameTime = 0;
let correctionOn = true; // 보정 On/Off
let showOriginal = false; // Before/After: true면 원본

const controls = new DockControls({
  onSourceChange: () => void restart(),
  onToggleCorrection: (on) => (correctionOn = on),
  onBeforeAfter: (orig) => (showOriginal = orig),
  onPanic: () => {
    correctionOn = false;
    showToast("패닉: 원본 패스스루");
  },
});
new ScenesDock(store);
new LayersDock(store);
new EditorDock(store);

function showToast(msg: string): void {
  const el = document.getElementById("toast") as HTMLElement;
  el.textContent = msg;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 1600);
}

async function restart(): Promise<void> {
  current = null;
  try {
    const { width, height } = controls.resolution;
    const fps = controls.fps;
    requestedLabel = `${width}x${height} @${fps}`;
    current = await camera.start({ deviceId: controls.deviceId, width, height, fps });
    pipeline.resize(current.actualWidth, current.actualHeight);
    overlay.resize(current.actualWidth, current.actualHeight);
    controls.clearError();
  } catch (e) {
    controls.showError("카메라 시작 실패: " + (e as Error).message);
  }
}

// 활성 장면의 enabled 레이어를 고정 순서로
function activeLayers() {
  const scene = getActiveScene(store.get());
  const byId = new Map(scene.layers.map((l) => [l.id, l]));
  const ordered = LAYER_ORDER.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
  if (!correctionOn || showOriginal) return ordered.map((l) => ({ ...l, enabled: false }));
  return ordered;
}

function loop(): void {
  if (running && current) {
    const now = performance.now();
    const targetFps = controls.fps; // 선택 fps로 제한
    if (now - lastFrameTime < 1000 / targetFps - 2) {
      requestAnimationFrame(loop);
      return;
    }
    lastFrameTime = now;
    const frameStart = now;
    let faceDetected = false;
    try {
      const { faces, inferenceMs } = tracker.detect(current.video, frameStart);
      faceDetected = faces.length > 0;
      latencyMeter.record(inferenceMs);
      pipeline.render(current.video, activeLayers());
      overlay.draw(faces, controls.overlayEnabled);
    } catch (e) {
      controls.showError("추론/렌더 오류: " + (e as Error).message);
    }
    fpsMeter.tick(frameStart);
    frameMeter.record(performance.now() - frameStart);
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    controls.updateDiagnostics({
      fps: fpsMeter.value(),
      inferenceMs: latencyMeter.avg(),
      frameMs: frameMeter.avg(),
      requested: requestedLabel,
      actual: `${current.actualWidth}x${current.actualHeight} @${Math.round(current.actualFps)}`,
      faceDetected,
      jsHeapMb: mem ? mem.usedJSHeapSize / 1048576 : null,
    });
  }
  requestAnimationFrame(loop);
}

async function main(): Promise<void> {
  try {
    await tracker.init();
    await restart();
    controls.setDevices(await camera.listDevices());
    running = true;
    requestAnimationFrame(loop);
  } catch (e) {
    controls.showError("초기화 실패: " + (e as Error).message);
  }
}

void main();
```

- [ ] **Step 2: 구 모듈 삭제(렌더러 + 구 UI)**

Run: `git rm src/renderer.ts src/ui/controls.ts src/ui/panel.ts`
Expected: `rm 'src/renderer.ts'` `rm 'src/ui/controls.ts'` `rm 'src/ui/panel.ts'`

- [ ] **Step 3: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 타입 에러 없음; 테스트 통과(reducer 5 + persist 2 + mapping 3 + metrics 5 + format 2 = 17). `grep -rn "renderer\|controls\|panel" src/` 로 구 모듈 잔존 참조 없음 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/main.ts
git commit -m "feat: main을 WebGL2 파이프라인+상태+오버레이로 통합"
```

---

## Task 11: 빌드 검증

- [ ] **Step 1: 프로덕션 빌드**

Run: `npm run build`
Expected: `tsc --noEmit` 통과 + `vite build` 성공(에러 없음)

- [ ] **Step 2: 커밋(불필요 시 생략)** — 코드 변경 없으면 생략.

---

## Task 12: Windows 실기기 수동 검증

> 사용자가 Windows 브라우저에서 실행·관찰. `npm run dev -- --host` → `http://localhost:5173`.

- [ ] **완료 기준 체크(스펙 §11):**
  - [ ] OBS식 4도크(장면/레이어/편집/제어) + 상단 미리보기가 피치 파스텔로 보인다.
  - [ ] 미리보기에 라이브 영상이 WebGL2로 뜨고 **찢김이 사라졌다**.
  - [ ] 레이어에서 '색보정'을 켜고 편집 슬라이더(밝기/대비/톤/화이트밸런스)를 움직이면 **영상이 즉시 바뀐다**.
  - [ ] '피부 스무딩'은 아직 패스스루(효과 없음) — Plan B 예정(정상).
  - [ ] 레이어 눈 토글로 on/off, 행 클릭으로 편집 대상 전환.
  - [ ] 장면 ＋로 새 장면 추가 → 보정값 복제, 장면 전환 시 보정 전체 교체, **새로고침 후에도 유지**(localStorage).
  - [ ] 보정 On/Off·Before/After·패닉이 실제 영상에 반영.
  - [ ] 메시 오버레이 체크박스 동작, 메시가 얼굴에 정합.
  - [ ] 60fps 선택 시 좌상단 FPS가 60 근처(모니터가 받쳐줄 때).
  - [ ] 진단 패널 수치 정상.

- [ ] **결과 기록 후 Plan B(FabSoften 스무딩)로 진행.**

---

## 부록: 자가 점검

- **스펙 커버리지:** OBS 레이아웃(T8) / WebGL2 파이프라인(T6) / 색보정(T6 passes+T5 mapping) / 상태모델(T2~4) / 장면(T2~4 reducer+T9 scenes) / 메시 분리(T7) / fps(T1) / 통합(T10) / 찢김 해소(T6 GL 전환, T12 확인). 스무딩 패스는 Plan A에서 패스스루(자리표시), 실제 FabSoften은 **Plan B**(스펙 §6) — 의도된 분할.
- **타입 일관성:** `Store.update/get/subscribe`, reducer 함수 시그니처(`setParam/toggleLayer/selectLayer/switchScene/addScene/getActiveScene/getSelectedLayer/getCategoryLayers`), `Pipeline.resize/render(video, Layer[])`, `Pass.use(gl, tex, params)`, `colorUniforms`, `DockControls`/`MeshOverlay` API가 정의처와 사용처 일치.
- **플레이스홀더 없음:** 모든 코드 스텝에 실제 코드 포함. (스무딩 패스스루는 자리표시가 아니라 의도된 Plan A 동작.)
- **다음 계획:** Plan B = FabSoften(스킨마스크→Kawase 블러→주파수 분리)로 `passes.smoothing`을 교체. Plan A의 파이프라인/상태/UI를 그대로 활용.
```
