# Spike 0 - 파트 A: 브라우저 성능 PoC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iGPU에서 MediaPipe 얼굴 추적 + 468 메시 오버레이가 1080p·30fps로 도는지 측정하는 브라우저 PoC를 만든다.

**Architecture:** Vite + 바닐라 TypeScript. 모듈 경계 명확(`camera/tracker/renderer/metrics/hud/main`). 순수 로직(`metrics`)만 단위테스트, 나머지는 Windows 실기기 수동 검증. React/Electron/보정/가상캠 전부 제외.

**Tech Stack:** Vite, TypeScript(strict), `@mediapipe/tasks-vision`(FaceLandmarker, GPU delegate, VIDEO 모드), Canvas 2D, Vitest.

**스펙:** `docs/superpowers/specs/2026-06-10-spike0-part-a-browser-poc-design.md`

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts` | 프로젝트 설정 |
| `scripts/bootstrap-assets.mjs` | MediaPipe wasm 복사 + 모델 다운로드(오프라인 번들) |
| `index.html` | 캔버스 + 컨트롤(장치/해상도/fps/오버레이) + 통계 패널 |
| `src/main.ts` | 오케스트레이션: rAF 루프, 모듈 배선, 생명주기 |
| `src/camera.ts` | 장치 열거, getUserMedia, 스트림 제공 |
| `src/tracker.ts` | FaceLandmarker 래핑 + 추론 시간 측정 |
| `src/renderer.ts` | canvas 2D 비디오 + 메시 오버레이 |
| `src/metrics.ts` | FPS/지연 측정(순수 로직) — **단위테스트 대상** |
| `src/metrics.test.ts` | metrics 단위테스트 |
| `src/hud.ts` | 컨트롤 배선 + 통계 표시 |

---

## Task 1: 프로젝트 스캐폴드 + 에셋 부트스트랩

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `scripts/bootstrap-assets.mjs`, `index.html`, `src/main.ts`(스텁)

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "mask-poc",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "predev": "node scripts/bootstrap-assets.mjs",
    "dev": "vite",
    "prebuild": "node scripts/bootstrap-assets.mjs",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "^0.10.14"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `vite.config.ts` 작성**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: `scripts/bootstrap-assets.mjs` 작성**

```js
import { existsSync, mkdirSync, cpSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 1) MediaPipe wasm 파일을 public/wasm 으로 복사 (오프라인 서빙)
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDest = join(root, "public/wasm");
mkdirSync(wasmDest, { recursive: true });
cpSync(wasmSrc, wasmDest, { recursive: true });
console.log("[bootstrap] wasm 복사 완료 →", wasmDest);

// 2) face_landmarker 모델 다운로드 (없을 때만)
const modelDir = join(root, "public/models");
const modelPath = join(modelDir, "face_landmarker.task");
mkdirSync(modelDir, { recursive: true });
if (!existsSync(modelPath)) {
  const url =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  console.log("[bootstrap] 모델 다운로드 중…", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error("모델 다운로드 실패: " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(modelPath, buf);
  console.log("[bootstrap] 모델 저장 완료 →", modelPath, buf.length, "bytes");
} else {
  console.log("[bootstrap] 모델 이미 존재, 건너뜀");
}
```

- [ ] **Step 5: `index.html` 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mask PoC — 성능 검증</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #111; color: #eee; }
      #app { display: flex; gap: 12px; padding: 12px; }
      #stage { position: relative; }
      canvas { background: #000; max-width: 100%; height: auto; }
      #controls { display: flex; flex-direction: column; gap: 8px; min-width: 240px; }
      #stats { white-space: pre; font-family: monospace; font-size: 13px; background: #1c1c1c; padding: 10px; border-radius: 6px; }
      label { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      select, input { padding: 4px; }
      #error { color: #ff6b6b; font-size: 13px; }
    </style>
  </head>
  <body>
    <div id="app">
      <div id="stage"><canvas id="canvas"></canvas></div>
      <div id="controls">
        <label>카메라 <select id="device"></select></label>
        <label>해상도
          <select id="resolution">
            <option value="1280x720">720p</option>
            <option value="1920x1080" selected>1080p</option>
          </select>
        </label>
        <label>FPS
          <select id="fps">
            <option value="30" selected>30</option>
            <option value="60">60</option>
          </select>
        </label>
        <label>메시 오버레이 <input type="checkbox" id="overlay" checked /></label>
        <div id="stats">초기화 중…</div>
        <div id="error"></div>
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: `src/main.ts` 스텁 작성**

```ts
// 스텁 — Task 7에서 실제 오케스트레이션으로 교체
const stats = document.getElementById("stats");
if (stats) stats.textContent = "스캐폴드 OK";
```

- [ ] **Step 7: 의존성 설치**

Run: `npm install`
Expected: `node_modules` 생성, 에러 없음

- [ ] **Step 8: 에셋 부트스트랩 검증**

Run: `node scripts/bootstrap-assets.mjs`
Expected: "wasm 복사 완료", "모델 저장 완료 … bytes" 출력. `public/wasm/`과 `public/models/face_landmarker.task`(약 3.7MB) 생성

- [ ] **Step 9: 타입체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음(출력 없음)

- [ ] **Step 10: 커밋**

```bash
git add package.json tsconfig.json vite.config.ts scripts/bootstrap-assets.mjs index.html src/main.ts package-lock.json
git commit -m "chore: Vite+TS 스캐폴드 및 MediaPipe 에셋 부트스트랩"
```

---

## Task 2: metrics.ts (TDD — 유일한 단위테스트 모듈)

**Files:**
- Create: `src/metrics.ts`
- Test: `src/metrics.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 — `src/metrics.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { FpsMeter, LatencyMeter } from "./metrics";

describe("FpsMeter", () => {
  it("두 번째 tick 전에는 0", () => {
    const m = new FpsMeter(1);
    expect(m.value()).toBe(0);
    m.tick(0);
    expect(m.value()).toBe(0);
  });

  it("alpha=1이면 순간 FPS 계산 (dt 20ms → 50fps)", () => {
    const m = new FpsMeter(1);
    m.tick(0);
    m.tick(20);
    expect(m.value()).toBeCloseTo(50, 5);
  });

  it("dt가 0이면 무시", () => {
    const m = new FpsMeter(1);
    m.tick(10);
    m.tick(10);
    expect(m.value()).toBe(0);
  });
});

describe("LatencyMeter", () => {
  it("첫 값은 그대로", () => {
    const l = new LatencyMeter(0.5);
    l.record(10);
    expect(l.avg()).toBe(10);
  });

  it("EMA 적용 (0.5*20 + 0.5*10 = 15)", () => {
    const l = new LatencyMeter(0.5);
    l.record(10);
    l.record(20);
    expect(l.avg()).toBeCloseTo(15, 5);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — "Failed to resolve import './metrics'" 또는 "FpsMeter is not defined"

- [ ] **Step 3: 최소 구현 — `src/metrics.ts`**

```ts
export class FpsMeter {
  private ema: number | null = null;
  private last: number | null = null;
  constructor(private alpha = 0.1) {}

  tick(nowMs: number): void {
    if (this.last !== null) {
      const dt = nowMs - this.last;
      if (dt > 0) {
        const inst = 1000 / dt;
        this.ema = this.ema === null ? inst : this.alpha * inst + (1 - this.alpha) * this.ema;
      }
    }
    this.last = nowMs;
  }

  value(): number {
    return this.ema ?? 0;
  }
}

export class LatencyMeter {
  private ema: number | null = null;
  constructor(private alpha = 0.1) {}

  record(ms: number): void {
    this.ema = this.ema === null ? ms : this.alpha * ms + (1 - this.alpha) * this.ema;
  }

  avg(): number {
    return this.ema ?? 0;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 5개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/metrics.ts src/metrics.test.ts
git commit -m "feat: FPS/지연 측정 메트릭 모듈 (TDD)"
```

---

## Task 3: camera.ts (웹캠 캡처)

**Files:**
- Create: `src/camera.ts`

> 단위테스트 없음(브라우저 MediaDevices/하드웨어 의존). Task 8 수동 검증으로 확인.

- [ ] **Step 1: 구현 — `src/camera.ts`**

```ts
export interface CameraConfig {
  deviceId?: string;
  width: number;
  height: number;
  fps: number;
}

export interface CameraInfo {
  video: HTMLVideoElement;
  actualWidth: number;
  actualHeight: number;
  actualFps: number;
}

let currentStream: MediaStream | null = null;

export function stop(): void {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
}

export async function start(config: CameraConfig): Promise<CameraInfo> {
  stop();
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
      width: { ideal: config.width },
      height: { ideal: config.height },
      frameRate: { ideal: config.fps },
    },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  currentStream = stream;

  const video = document.createElement("video");
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();

  const settings = stream.getVideoTracks()[0].getSettings();
  return {
    video,
    actualWidth: settings.width ?? config.width,
    actualHeight: settings.height ?? config.height,
    actualFps: settings.frameRate ?? config.fps,
  };
}

export async function listDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/camera.ts
git commit -m "feat: 웹캠 장치 열거 및 캡처 모듈"
```

---

## Task 4: tracker.ts (MediaPipe FaceLandmarker 래핑)

**Files:**
- Create: `src/tracker.ts`

> 단위테스트 없음(GPU/WASM 하드웨어 의존). Task 8 수동 검증.

- [ ] **Step 1: 구현 — `src/tracker.ts`**

```ts
import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export interface DetectResult {
  faces: NormalizedLandmark[][];
  inferenceMs: number;
}

export class Tracker {
  private landmarker: FaceLandmarker | null = null;

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks("/wasm");
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/models/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  detect(video: HTMLVideoElement, timestampMs: number): DetectResult {
    if (!this.landmarker) throw new Error("Tracker가 초기화되지 않음");
    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(video, timestampMs);
    const inferenceMs = performance.now() - t0;
    return { faces: result.faceLandmarks, inferenceMs };
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/tracker.ts
git commit -m "feat: MediaPipe FaceLandmarker 래퍼 (GPU, VIDEO 모드)"
```

---

## Task 5: renderer.ts (canvas 비디오 + 메시 오버레이)

**Files:**
- Create: `src/renderer.ts`

> 단위테스트 없음(Canvas 2D 의존). Task 8 수동 검증.

- [ ] **Step 1: 구현 — `src/renderer.ts`**

```ts
import {
  DrawingUtils,
  FaceLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private drawingUtils: DrawingUtils;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D 컨텍스트를 가져올 수 없음");
    this.ctx = ctx;
    this.drawingUtils = new DrawingUtils(ctx);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  draw(video: HTMLVideoElement, faces: NormalizedLandmark[][], overlay: boolean): void {
    const { width, height } = this.canvas;
    this.ctx.drawImage(video, 0, 0, width, height);
    if (overlay) {
      for (const landmarks of faces) {
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          { color: "#C0C0C070", lineWidth: 1 }
        );
      }
    }
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/renderer.ts
git commit -m "feat: canvas 비디오 + 468 메시 오버레이 렌더러"
```

---

## Task 6: hud.ts (컨트롤 배선 + 통계 표시)

**Files:**
- Create: `src/hud.ts`

> 단위테스트 없음(DOM 의존). Task 8 수동 검증.

- [ ] **Step 1: 구현 — `src/hud.ts`**

```ts
export interface HudSnapshot {
  fps: number;
  inferenceMs: number;
  frameMs: number;
  requested: string;
  actual: string;
  faceDetected: boolean;
  jsHeapMb: number | null;
}

export interface HudCallbacks {
  onDeviceChange: (deviceId: string) => void;
  onResolutionChange: (width: number, height: number) => void;
  onFpsChange: (fps: number) => void;
  onOverlayToggle: (enabled: boolean) => void;
}

export class Hud {
  private statsEl = document.getElementById("stats") as HTMLElement;
  private errorEl = document.getElementById("error") as HTMLElement;
  private deviceEl = document.getElementById("device") as HTMLSelectElement;
  private resolutionEl = document.getElementById("resolution") as HTMLSelectElement;
  private fpsEl = document.getElementById("fps") as HTMLSelectElement;
  private overlayEl = document.getElementById("overlay") as HTMLInputElement;

  constructor(cb: HudCallbacks) {
    this.deviceEl.addEventListener("change", () => cb.onDeviceChange(this.deviceEl.value));
    this.resolutionEl.addEventListener("change", () => {
      const [w, h] = this.resolutionEl.value.split("x").map(Number);
      cb.onResolutionChange(w, h);
    });
    this.fpsEl.addEventListener("change", () => cb.onFpsChange(Number(this.fpsEl.value)));
    this.overlayEl.addEventListener("change", () => cb.onOverlayToggle(this.overlayEl.checked));
  }

  get overlayEnabled(): boolean {
    return this.overlayEl.checked;
  }

  get resolution(): { width: number; height: number } {
    const [w, h] = this.resolutionEl.value.split("x").map(Number);
    return { width: w, height: h };
  }

  get fps(): number {
    return Number(this.fpsEl.value);
  }

  get deviceId(): string | undefined {
    return this.deviceEl.value || undefined;
  }

  setDevices(devices: MediaDeviceInfo[]): void {
    this.deviceEl.innerHTML = "";
    devices.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `카메라 ${i + 1}`;
      this.deviceEl.appendChild(opt);
    });
  }

  update(s: HudSnapshot): void {
    this.statsEl.textContent =
      `FPS:     ${s.fps.toFixed(1)}\n` +
      `추론:    ${s.inferenceMs.toFixed(1)} ms\n` +
      `프레임:  ${s.frameMs.toFixed(1)} ms\n` +
      `요청:    ${s.requested}\n` +
      `실제:    ${s.actual}\n` +
      `얼굴:    ${s.faceDetected ? "검출됨" : "없음"}\n` +
      `JS 힙:   ${s.jsHeapMb !== null ? s.jsHeapMb.toFixed(0) + " MB" : "N/A"}\n` +
      `(GPU 메모리는 브라우저에서 측정 불가)`;
  }

  showError(msg: string): void {
    this.errorEl.textContent = msg;
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/hud.ts
git commit -m "feat: HUD 컨트롤 배선 및 통계 표시"
```

---

## Task 7: main.ts (오케스트레이션 + rAF 루프)

**Files:**
- Modify: `src/main.ts` (Task 1의 스텁을 전체 교체)

> 단위테스트 없음(통합 진입점). Task 8 수동 검증.

- [ ] **Step 1: 구현 — `src/main.ts` 전체 교체**

```ts
import * as camera from "./camera";
import { Tracker } from "./tracker";
import { Renderer } from "./renderer";
import { FpsMeter, LatencyMeter } from "./metrics";
import { Hud } from "./hud";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const tracker = new Tracker();
const renderer = new Renderer(canvas);
const fpsMeter = new FpsMeter(0.1);
const latencyMeter = new LatencyMeter(0.1);
const frameMeter = new LatencyMeter(0.1);

let current: camera.CameraInfo | null = null;
let running = false;
let requestedLabel = "";

const hud = new Hud({
  onDeviceChange: () => void restart(),
  onResolutionChange: () => void restart(),
  onFpsChange: () => void restart(),
  onOverlayToggle: () => {},
});

async function restart(): Promise<void> {
  try {
    const { width, height } = hud.resolution;
    const fps = hud.fps;
    requestedLabel = `${width}x${height} @${fps}`;
    current = await camera.start({ deviceId: hud.deviceId, width, height, fps });
    renderer.resize(current.actualWidth, current.actualHeight);
  } catch (e) {
    hud.showError("카메라 시작 실패: " + (e as Error).message);
  }
}

function loop(): void {
  if (running && current) {
    const frameStart = performance.now();
    let faceDetected = false;
    try {
      const { faces, inferenceMs } = tracker.detect(current.video, frameStart);
      faceDetected = faces.length > 0;
      latencyMeter.record(inferenceMs);
      renderer.draw(current.video, faces, hud.overlayEnabled);
    } catch (e) {
      hud.showError("추론/렌더 오류: " + (e as Error).message);
    }
    fpsMeter.tick(frameStart);
    frameMeter.record(performance.now() - frameStart);
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    hud.update({
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
    await restart(); // 권한 획득 → 장치 라벨 채우기 위해 먼저 시작
    hud.setDevices(await camera.listDevices());
    running = true;
    requestAnimationFrame(loop);
  } catch (e) {
    hud.showError("초기화 실패: " + (e as Error).message);
  }
}

void main();
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/main.ts
git commit -m "feat: rAF 루프 오케스트레이션 및 모듈 통합"
```

---

## Task 8: Windows 실기기 수동 검증 (PoC의 본체)

> 코드 작업 아님 — 사용자가 Windows에서 직접 실행·관찰·기록. 이 결과가 Spike 0 파트 A의 합격/불합격을 결정한다.

- [ ] **Step 1: 개발 서버 실행**

Run (Windows): `npm run dev`
Expected: bootstrap(wasm/모델) 후 Vite 서버 URL 출력(예 `http://localhost:5173`)

- [ ] **Step 2: 브라우저에서 열고 카메라 권한 허용**

Chrome/Edge로 URL 접속 → 카메라 권한 허용 → 얼굴 위에 메시 오버레이 표시 확인

- [ ] **Step 3: 1080p에서 FPS 측정**

해상도 1080p 선택. HUD의 FPS 관찰(10초 안정화 후).
**합격 기준: 메시 오버레이 ON 상태에서 ≥ 30fps.**

- [ ] **Step 4: 조합별 숫자 기록**

다음 표를 채운다(오버레이 ON/OFF 각각):

| 해상도 | fps설정 | 오버레이 | 측정 FPS | 추론(ms) | 프레임(ms) |
|---|---|---|---|---|---|
| 720p | 30 | ON | | | |
| 720p | 30 | OFF | | | |
| 1080p | 30 | ON | | | |
| 1080p | 30 | OFF | | | |
| 1080p | 60 | ON | | | |

- [ ] **Step 5: 판정 및 기록**

- 1080p ON ≥30fps → **합격.** 파트 B(가상캠)로 진행.
- 미달 → 오버레이 OFF/720p 수치로 병목 판별(추론 vs 렌더). "저해상도 추적" 전략 필요 여부 결론을 `docs/superpowers/specs/`에 짧게 메모.

---

## 부록: 알려진 주의사항

- **`detectForVideo` 타임스탬프**는 단조 증가해야 함 — `performance.now()` 사용으로 보장됨.
- **첫 몇 프레임**은 video readyState 미달로 추론이 예외를 던질 수 있음 — try/catch로 흡수, 루프 지속.
- **GPU delegate 실패 시** MediaPipe가 CPU로 폴백할 수 있음 — 그 경우 FPS가 크게 떨어지므로 콘솔 경고 확인.
- **모델/wasm은 `public/`에 위치** → 100% 로컬 서빙, 네트워크는 최초 모델 다운로드 1회만.
