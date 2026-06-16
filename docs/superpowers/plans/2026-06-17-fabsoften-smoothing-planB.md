# FabSoften 피부 스무딩 (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan A의 `smoothing` 패스스루를 실제 FabSoften 스무딩(스킨 마스크 + Kawase 블러 + 주파수 분리 합성)으로 교체해, '피부 스무딩' 레이어의 강도/질감보존 슬라이더가 얼굴 피부에만 자연스러운 보정을 실시간 적용하게 한다.

**Architecture:** 스무딩은 단일 입력→출력 패스가 아니라 **다중 서브패스**(마스크·블러·합성)와 얼굴 랜드마크가 필요하다. 먼저 `Pass`를 내부 FBO·랜드마크를 다룰 수 있는 `FxPass`(input + target + landmarks)로 일반화하고, 색보정/패스스루를 거기에 맞춘다(회귀 없음). 그 위에 `SmoothingPass`가 자체 FBO로 마스크→블러→합성을 수행한다. 랜드마크에서 얼굴/눈/입 타원 유니폼을 JS 순수 함수로 유도(단위테스트)해 셰이더에 전달한다.

**Tech Stack:** WebGL2, GLSL ES 3.00, TypeScript(strict), `@mediapipe/tasks-vision`, Vitest.

**스펙:** `docs/superpowers/specs/2026-06-17-correction-pipeline-design.md` §6.

---

## 파일 구조

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/gl/passes.ts` | `FxPass` 인터페이스 + `PassthroughPass`/`ColorPass` | 교체(리팩터) |
| `src/gl/pipeline.ts` | target 기반 패스 체인 + 랜드마크 전달 + 패스 resize | 수정 |
| `src/main.ts` | `pipeline.render(video, layers, landmarks)` | 수정 |
| `src/gl/skinMaskMath.ts` | 랜드마크→얼굴/눈/입 타원 유니폼(순수) — **단위테스트** | 신규 |
| `src/gl/smoothing.ts` | `SmoothingPass`: 마스크→블러→주파수분리 합성 + 셰이더 | 신규 |

> `camera/tracker/metrics/state/ui`는 변경 없음. tracker는 이미 랜드마크를 제공한다.

---

## Task 1: FxPass 일반화 + 랜드마크 전달 (회귀: 색보정 유지)

**Files:**
- Modify: `src/gl/passes.ts` (전체 교체)
- Modify: `src/gl/pipeline.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: `src/gl/passes.ts` 전체 교체**

```ts
import { compileProgram, FULLSCREEN_VS } from "./glUtils";
import { colorUniforms } from "./mapping";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 패스: 입력 텍스처 → target(FBO 또는 null=캔버스)에 결과 렌더.
// 내부 FBO가 필요한 패스(스무딩)를 위해 resize/target/landmarks를 받는다.
export interface FxPass {
  id: string;
  resize(w: number, h: number): void;
  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>,
    landmarks: NormalizedLandmark[] | null
  ): void;
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

// 풀스크린 패스 공통: target 바인딩 + 뷰포트 + 프로그램 + 입력 텍스처 바인딩
function beginPass(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  uTex: WebGLUniformLocation | null,
  input: WebGLTexture,
  target: WebGLFramebuffer | null,
  w: number,
  h: number
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target);
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.uniform1i(uTex, 0);
}

export class PassthroughPass implements FxPass {
  id = "passthrough";
  private prog: WebGLProgram;
  private uTex: WebGLUniformLocation | null;
  private w = 0;
  private h = 0;
  constructor(private gl: WebGL2RenderingContext) {
    this.prog = compileProgram(gl, FULLSCREEN_VS, PASSTHROUGH_FS);
    this.uTex = gl.getUniformLocation(this.prog, "u_tex");
  }
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  render(input: WebGLTexture, target: WebGLFramebuffer | null): void {
    beginPass(this.gl, this.prog, this.uTex, input, target, this.w, this.h);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }
}

export class ColorPass implements FxPass {
  id = "color";
  private prog: WebGLProgram;
  private u: {
    tex: WebGLUniformLocation | null;
    brightness: WebGLUniformLocation | null;
    contrast: WebGLUniformLocation | null;
    tone: WebGLUniformLocation | null;
    white: WebGLUniformLocation | null;
  };
  private w = 0;
  private h = 0;
  constructor(private gl: WebGL2RenderingContext) {
    this.prog = compileProgram(gl, FULLSCREEN_VS, COLOR_FS);
    this.u = {
      tex: gl.getUniformLocation(this.prog, "u_tex"),
      brightness: gl.getUniformLocation(this.prog, "u_brightness"),
      contrast: gl.getUniformLocation(this.prog, "u_contrast"),
      tone: gl.getUniformLocation(this.prog, "u_tone"),
      white: gl.getUniformLocation(this.prog, "u_white"),
    };
  }
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  render(input: WebGLTexture, target: WebGLFramebuffer | null, params: Record<string, number>): void {
    const gl = this.gl;
    beginPass(gl, this.prog, this.u.tex, input, target, this.w, this.h);
    const c = colorUniforms(params);
    gl.uniform1f(this.u.brightness, c.brightness);
    gl.uniform1f(this.u.contrast, c.contrast);
    gl.uniform1f(this.u.tone, c.tone);
    gl.uniform1f(this.u.white, c.white);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

// Plan B Task 3에서 smoothing을 실제 SmoothingPass로 교체. 지금은 패스스루.
export function createPasses(gl: WebGL2RenderingContext): Record<string, FxPass> {
  return {
    passthrough: new PassthroughPass(gl),
    smoothing: new PassthroughPass(gl),
    color: new ColorPass(gl),
  };
}
```

- [ ] **Step 2: `src/gl/pipeline.ts` 수정 — target 기반 루프 + 랜드마크 + resize 전파**

`src/gl/pipeline.ts` 전체를 아래로 교체:

```ts
import {
  createFullscreenVAO,
  createTexture,
  createRenderTarget,
  type RenderTarget,
} from "./glUtils";
import { createPasses, type FxPass } from "./passes";
import type { Layer } from "../state/types";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export class Pipeline {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private videoTex: WebGLTexture;
  private passes: Record<string, FxPass>;
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
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.gl.canvas.width = w;
    this.gl.canvas.height = h;
    if (this.a) {
      this.gl.deleteFramebuffer(this.a.fbo);
      this.gl.deleteTexture(this.a.tex);
    }
    if (this.b) {
      this.gl.deleteFramebuffer(this.b.fbo);
      this.gl.deleteTexture(this.b.tex);
    }
    this.a = createRenderTarget(this.gl, w, h);
    this.b = createRenderTarget(this.gl, w, h);
    for (const p of Object.values(this.passes)) p.resize(w, h);
  }

  render(video: HTMLVideoElement, layers: Layer[], landmarks: NormalizedLandmark[] | null): void {
    const gl = this.gl;
    if (!this.a || !this.b) return;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.bindVertexArray(this.vao);

    const enabled = layers.filter((l) => l.enabled && this.passes[l.id]);
    if (enabled.length === 0) {
      this.passes.passthrough.render(this.videoTex, null, {}, landmarks);
      gl.bindVertexArray(null);
      return;
    }

    let input = this.videoTex;
    let src = this.a;
    let dst = this.b;
    enabled.forEach((layer, i) => {
      const last = i === enabled.length - 1;
      this.passes[layer.id].render(input, last ? null : dst.fbo, layer.params, landmarks);
      if (!last) {
        input = dst.tex;
        [src, dst] = [dst, src];
      }
    });
    gl.bindVertexArray(null);
  }
}
```

- [ ] **Step 3: `src/main.ts` — 랜드마크 전달**

`src/main.ts`에서 아래 줄을 찾는다:
```ts
      pipeline.render(current.video, activeLayers());
```
다음으로 교체(검출된 첫 얼굴의 랜드마크 전달, 없으면 null):
```ts
      pipeline.render(current.video, activeLayers(), faces[0] ?? null);
```

- [ ] **Step 4: 타입체크 + 테스트 + 빌드**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: 타입 에러 없음, 18 테스트 통과, 빌드 성공. (회귀 확인: 색보정 패스는 동일 동작)

- [ ] **Step 5: 커밋**

```bash
git add src/gl/passes.ts src/gl/pipeline.ts src/main.ts
git commit -m "refactor: FxPass(내부 FBO·랜드마크 지원)로 일반화 + 파이프라인 랜드마크 전달"
```

---

## Task 2: 랜드마크→마스크 유니폼 (순수, TDD)

**Files:**
- Create: `src/gl/skinMaskMath.ts`
- Test: `src/gl/skinMaskMath.test.ts`

> MediaPipe 468 랜드마크에서 얼굴/눈/입 타원 파라미터를 유도. 좌표는 GL uv(y up)로 변환: `uv = (x, 1 - y)`.

- [ ] **Step 1: 실패 테스트 — `src/gl/skinMaskMath.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { maskUniforms } from "./skinMaskMath";

// 인덱스만 채운 가짜 랜드마크 배열 생성기
function lm(points: Record<number, [number, number]>) {
  const arr = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [i, [x, y]] of Object.entries(points)) arr[Number(i)] = { x, y, z: 0 };
  return arr as any;
}

describe("maskUniforms", () => {
  it("얼굴 중심은 좌우/상하 극점의 중점(uv, y 반전)", () => {
    // top=10, bottom=152, left=234, right=454
    const u = maskUniforms(lm({ 10: [0.5, 0.2], 152: [0.5, 0.8], 234: [0.3, 0.5], 454: [0.7, 0.5] }));
    expect(u.faceC[0]).toBeCloseTo(0.5, 5); // (0.3+0.7)/2
    expect(u.faceC[1]).toBeCloseTo(0.5, 5); // (1-0.2 + 1-0.8)/2 = (0.8+0.2)/2
  });

  it("얼굴 반경은 폭/높이 절반에 여유배율(1.1)", () => {
    const u = maskUniforms(lm({ 10: [0.5, 0.2], 152: [0.5, 0.8], 234: [0.3, 0.5], 454: [0.7, 0.5] }));
    expect(u.faceR[0]).toBeCloseTo(0.2 * 1.1, 5); // (0.7-0.3)/2 * 1.1
    expect(u.faceR[1]).toBeCloseTo(0.3 * 1.1, 5); // ((1-0.2)-(1-0.8))/2 *1.1 = 0.3*1.1
  });

  it("입 중심은 13/14 중점(y 반전)", () => {
    const u = maskUniforms(lm({ 13: [0.5, 0.6], 14: [0.5, 0.62] }));
    expect(u.mouth[1]).toBeCloseTo(1 - 0.61, 5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — "Failed to resolve import './skinMaskMath'"

- [ ] **Step 3: 구현 — `src/gl/skinMaskMath.ts`**

```ts
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
```

- [ ] **Step 4: 통과 + 커밋**

Run: `npm test`
Expected: PASS (skinMaskMath 3 추가 = 21)
```bash
git add src/gl/skinMaskMath.ts src/gl/skinMaskMath.test.ts
git commit -m "feat: 랜드마크→스킨마스크 타원 유니폼 (TDD)"
```

---

## Task 3: SmoothingPass (마스크 → Kawase 블러 → 주파수 분리 합성)

**Files:**
- Create: `src/gl/smoothing.ts`
- Modify: `src/gl/passes.ts` (createPasses의 smoothing을 SmoothingPass로)

> 단위테스트 없음(GPU/시각). Task 4 수동 시각 검증·튜닝. 내부 FBO 3종(마스크, 블러 핑/퐁)을 resize에서 할당.

- [ ] **Step 1: 구현 — `src/gl/smoothing.ts`**

```ts
import { compileProgram, createRenderTarget, FULLSCREEN_VS, type RenderTarget } from "./glUtils";
import { maskUniforms } from "./skinMaskMath";
import type { FxPass } from "./passes";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 1) 스킨 마스크: YCbCr 스킨 ∩ 얼굴 타원 − 눈/입 제외
const MASK_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_faceC; uniform vec2 u_faceR;
uniform vec2 u_eyeL; uniform vec2 u_eyeR; uniform vec2 u_mouth;
uniform float u_featR;
out vec4 o;
float e(vec2 p, vec2 c, vec2 r){ vec2 d=(p-c)/max(r,vec2(1e-4)); return dot(d,d); }
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  float Y  = dot(c, vec3(0.299,0.587,0.114));
  float Cb = (c.b - Y)*0.564 + 0.5;
  float Cr = (c.r - Y)*0.713 + 0.5;
  float skin = step(0.44,Cr)*step(Cr,0.63)*step(0.27,Cb)*step(Cb,0.51);
  float face = 1.0 - smoothstep(0.85, 1.15, e(v_uv,u_faceC,u_faceR));
  float ex = 0.0;
  ex = max(ex, 1.0 - smoothstep(0.5,1.0, e(v_uv,u_eyeL, vec2(u_featR))));
  ex = max(ex, 1.0 - smoothstep(0.5,1.0, e(v_uv,u_eyeR, vec2(u_featR))));
  ex = max(ex, 1.0 - smoothstep(0.5,1.0, e(v_uv,u_mouth, vec2(u_featR*1.4,u_featR))));
  o = vec4(vec3(clamp(skin*face*(1.0-ex),0.0,1.0)), 1.0);
}`;

// 2) Kawase 블러(4탭)
const BLUR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_offset;
out vec4 o;
void main(){
  vec2 t = u_texel * (u_offset + 0.5);
  vec4 s = texture(u_tex, v_uv + vec2( t.x,  t.y));
  s += texture(u_tex, v_uv + vec2(-t.x,  t.y));
  s += texture(u_tex, v_uv + vec2( t.x, -t.y));
  s += texture(u_tex, v_uv + vec2(-t.x, -t.y));
  o = s * 0.25;
}`;

// 3) 주파수 분리 합성: 저주파 스무딩 + 고주파(텍스처) 복원, 스킨 마스크로 한정
const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_orig;
uniform sampler2D u_blur;
uniform sampler2D u_mask;
uniform float u_strength;
uniform float u_texture;
out vec4 o;
void main(){
  vec3 orig = texture(u_orig, v_uv).rgb;
  vec3 blur = texture(u_blur, v_uv).rgb;
  float m = texture(u_mask, v_uv).r;
  vec3 hf = orig - blur;
  vec3 sm = mix(orig, blur, u_strength);
  vec3 result = sm + u_texture * hf;
  o = vec4(mix(orig, result, m), 1.0);
}`;

const KAWASE_OFFSETS = [0.0, 1.0, 2.0, 2.0]; // 4패스

export class SmoothingPass implements FxPass {
  id = "smoothing";
  private gl: WebGL2RenderingContext;
  private maskProg: WebGLProgram;
  private blurProg: WebGLProgram;
  private compProg: WebGLProgram;
  private mask: RenderTarget | null = null;
  private blurA: RenderTarget | null = null;
  private blurB: RenderTarget | null = null;
  private w = 0;
  private h = 0;
  // 유니폼 위치 캐시
  private um: Record<string, WebGLUniformLocation | null> = {};
  private ub: Record<string, WebGLUniformLocation | null> = {};
  private uc: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.maskProg = compileProgram(gl, FULLSCREEN_VS, MASK_FS);
    this.blurProg = compileProgram(gl, FULLSCREEN_VS, BLUR_FS);
    this.compProg = compileProgram(gl, FULLSCREEN_VS, COMPOSITE_FS);
    const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
    for (const n of ["u_tex", "u_faceC", "u_faceR", "u_eyeL", "u_eyeR", "u_mouth", "u_featR"])
      this.um[n] = loc(this.maskProg, n);
    for (const n of ["u_tex", "u_texel", "u_offset"]) this.ub[n] = loc(this.blurProg, n);
    for (const n of ["u_orig", "u_blur", "u_mask", "u_strength", "u_texture"])
      this.uc[n] = loc(this.compProg, n);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const gl = this.gl;
    for (const rt of [this.mask, this.blurA, this.blurB]) {
      if (rt) {
        gl.deleteFramebuffer(rt.fbo);
        gl.deleteTexture(rt.tex);
      }
    }
    this.mask = createRenderTarget(gl, w, h);
    this.blurA = createRenderTarget(gl, w, h);
    this.blurB = createRenderTarget(gl, w, h);
  }

  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>,
    landmarks: NormalizedLandmark[] | null
  ): void {
    const gl = this.gl;
    if (!this.mask || !this.blurA || !this.blurB || !landmarks) {
      // 얼굴 없으면 원본 그대로 통과
      this.blit(input, target);
      return;
    }
    gl.viewport(0, 0, this.w, this.h);

    // 1) 마스크
    const u = maskUniforms(landmarks);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mask.fbo);
    gl.useProgram(this.maskProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.um.u_tex, 0);
    gl.uniform2fv(this.um.u_faceC, u.faceC);
    gl.uniform2fv(this.um.u_faceR, u.faceR);
    gl.uniform2fv(this.um.u_eyeL, u.eyeL);
    gl.uniform2fv(this.um.u_eyeR, u.eyeR);
    gl.uniform2fv(this.um.u_mouth, u.mouth);
    gl.uniform1f(this.um.u_featR, u.featR);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) Kawase 블러(input → blurA/B 핑퐁)
    gl.useProgram(this.blurProg);
    gl.uniform2f(this.ub.u_texel, 1 / this.w, 1 / this.h);
    let readTex = input;
    let writeRT = this.blurA;
    let otherRT = this.blurB;
    for (const off of KAWASE_OFFSETS) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeRT.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.uniform1i(this.ub.u_tex, 0);
      gl.uniform1f(this.ub.u_offset, off);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      readTex = writeRT.tex;
      [writeRT, otherRT] = [otherRT, writeRT];
    }
    const blurTex = readTex;

    // 3) 합성 → target
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.uc.u_orig, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, blurTex);
    gl.uniform1i(this.uc.u_blur, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.tex);
    gl.uniform1i(this.uc.u_mask, 2);
    gl.uniform1f(this.uc.u_strength, (params.strength ?? 0) / 100); // 0..1
    gl.uniform1f(this.uc.u_texture, (params.texture ?? 0) / 100); // 0..1
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0); // 텍스처 유닛 원복
  }

  // 패스스루(얼굴 없을 때)
  private blit(input: WebGLTexture, target: WebGLFramebuffer | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.blurProg);
    gl.uniform2f(this.ub.u_texel, 0, 0); // offset 무효화 → 사실상 원본 복사
    gl.uniform1f(this.ub.u_offset, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.ub.u_tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
```

- [ ] **Step 2: `src/gl/passes.ts`에 SmoothingPass 연결**

`src/gl/passes.ts` 상단 import에 추가:
```ts
import { SmoothingPass } from "./smoothing";
```
그리고 `createPasses`의 smoothing 줄을 교체:
```ts
    smoothing: new SmoothingPass(gl),
```
(`smoothing.ts`가 `passes.ts`의 `FxPass`를 import하고, `passes.ts`가 `smoothing.ts`를 import → 순환 import이지만 타입(`import type`)과 런타임 클래스가 분리돼 ESM에서 안전. 만약 tsc/런타임 순환 경고가 문제되면 `FxPass`를 `passes.ts`에 그대로 두고 `smoothing.ts`는 `import type { FxPass }`만 사용하므로 무방.)

- [ ] **Step 3: 타입체크 + 빌드**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: 타입 에러 없음, 21 테스트 통과, 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/gl/smoothing.ts src/gl/passes.ts
git commit -m "feat: FabSoften 스무딩(스킨마스크+Kawase 블러+주파수 분리)"
```

---

## Task 4: Windows 실기기 시각 검증 & 튜닝

> 셰이더 결과는 실제 얼굴로만 판정 가능. 사용자가 Windows에서 관찰하고, 필요 시 상수를 함께 튜닝한다.

- [ ] **Step 1: 실행 + 관찰**

Run (WSL2): `npm run dev -- --host` → Windows Chrome `http://localhost:5173` (`Ctrl+Shift+R`).
'레이어'에서 '피부 스무딩' 눈을 켜고, '편집'에서 **강도/질감보존** 슬라이더 조절.

- [ ] **Step 2: 완료 기준 체크(스펙 §11-2)**
  - [ ] 피부 영역에만 스무딩이 적용된다(배경·눈·입·눈썹·머리카락 제외).
  - [ ] 강도 ↑ → 더 매끈, 질감보존 ↑ → 모공/질감 더 남음(플라스틱 방지).
  - [ ] 얼굴 미검출 시 원본 패스스루(보정 안 걸림).
  - [ ] 색보정 레이어와 함께 켜도 정상(스무딩→색보정 순서).
  - [ ] 1080p 실시간 유지(프레임 드랍 없음).

- [ ] **Step 3: 튜닝 포인트(필요 시)**
  - 마스크가 피부를 덜/과하게 잡음 → `MASK_FS`의 YCbCr 임계값(`0.44/0.63/0.27/0.51`), 얼굴 타원 falloff(`smoothstep(0.85,1.15,…)`), 눈/입 제외 반경(`u_featR` 배율, skinMaskMath의 `rx*0.18`).
  - 스무딩이 약함/플라스틱 → `KAWASE_OFFSETS`(블러 반경) 늘리기, 합성식의 `u_texture` 기본 매핑.
  - 마스크 경계가 딱딱함 → 마스크 falloff smoothstep 범위 넓히기, 또는 마스크에 블러 1패스 추가(후속).
  - 변경 후 `npm run build`로 회귀 확인, 결과 좋으면 커밋.

- [ ] **Step 4: 확정 후 다음 사이클(리쉐이프)로.**

---

## 부록: 자가 점검

- **스펙 커버리지(§6):** 스킨 마스크 랜드마크+YCbCr(T2 유니폼 + T3 MASK_FS) / 엣지보존 블러(T3 Kawase) / 주파수 분리 합성 α·강도(T3 COMPOSITE_FS) / 강도·질감보존 슬라이더(T3 params strength·texture, defaults.ts에 이미 존재) / GPU 셰이더(전부) / 얼굴 미검출 패스스루(T3 blit). ADF·잡티는 스펙상 후속(범위 외).
- **타입 일관성:** `FxPass.resize/render(input,target,params,landmarks)`가 PassthroughPass/ColorPass/SmoothingPass와 pipeline 호출부 일치. `maskUniforms`(T2) → SmoothingPass(T3) 사용. `params.strength/texture`는 defaults.ts의 smoothing 레이어 params 키(strength,texture)와 일치.
- **플레이스홀더 없음:** 모든 스텝 실제 코드. 셰이더 상수는 Task 4에서 시각 튜닝(의도된 반복).
- **회귀:** Task 1에서 색보정/패스스루를 FxPass로 옮기되 동작 동일(Step 4 빌드·수동 확인).
```
