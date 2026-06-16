# MVP UI 셸 + 라이브 프리뷰 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 PoC 파이프라인(카메라+얼굴추적+렌더)을 피치 파스텔/TDS 스타일의 MVP UI 셸에 연동해, 중앙 프리뷰에 실제 라이브 영상과 메시 오버레이가 뜨는 앱을 만든다.

**Architecture:** 바닐라 TypeScript 유지. `camera/tracker/renderer/metrics` 모듈은 그대로 재사용. `index.html`을 새 레이아웃으로 교체하고, `hud.ts`를 `ui/controls.ts`(동작 컨트롤 + 진단)와 `ui/panel.ts`(레일/탭/슬라이더 플레이스홀더)로 분리·발전시킨다. 피치 파스텔은 `styles.css`의 CSS 변수로 토큰화.

**Tech Stack:** Vite, TypeScript(strict), `@mediapipe/tasks-vision`, Canvas 2D, Vitest.

**스펙:** `docs/superpowers/specs/2026-06-17-mvp-ui-shell-design.md`

---

## 파일 구조

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/camera.ts` | 장치 열거/getUserMedia/스트림 | 변경 없음 |
| `src/tracker.ts` | MediaPipe FaceLandmarker | 변경 없음 |
| `src/renderer.ts` | canvas 비디오 + 메시 오버레이 | 변경 없음 |
| `src/metrics.ts` | FPS/지연 측정(순수) | 변경 없음 |
| `src/ui/format.ts` | 순수 헬퍼: 해상도 문자열 파싱 — **단위테스트 대상** | 신규 |
| `src/ui/format.test.ts` | format 단위테스트 | 신규 |
| `src/styles.css` | 피치 파스텔 토큰 + TDS식 컴포넌트 스타일 | 신규 |
| `index.html` | 새 레이아웃 마크업(상단바·레일·프리뷰·패널·하단·진단) | 교체 |
| `src/ui/controls.ts` | 동작 컨트롤(카메라/해상도/fps/오버레이) + 진단 패널 | 신규(hud 흡수) |
| `src/ui/panel.ts` | 레일/탭/슬라이더/하단 CTA 플레이스홀더 인터랙션 | 신규 |
| `src/main.ts` | 오케스트레이션(rAF 루프) | 수정 |
| `src/hud.ts` | — | **삭제** |

---

## Task 1: format.ts (순수 헬퍼, TDD)

**Files:**
- Create: `src/ui/format.ts`
- Test: `src/ui/format.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 — `src/ui/format.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseResolution } from "./format";

describe("parseResolution", () => {
  it("'1920x1080' → {width:1920, height:1080}", () => {
    expect(parseResolution("1920x1080")).toEqual({ width: 1920, height: 1080 });
  });

  it("'1280x720' → {width:1280, height:720}", () => {
    expect(parseResolution("1280x720")).toEqual({ width: 1280, height: 720 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — "Failed to resolve import './format'"

- [ ] **Step 3: 최소 구현 — `src/ui/format.ts`**

```ts
export function parseResolution(value: string): { width: number; height: number } {
  const [width, height] = value.split("x").map(Number);
  return { width, height };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — format 2개 + 기존 metrics 5개 = 7개 통과

- [ ] **Step 5: 커밋**

```bash
git add src/ui/format.ts src/ui/format.test.ts
git commit -m "feat: 해상도 파싱 순수 헬퍼 (TDD)"
```

---

## Task 2: styles.css (피치 파스텔 디자인 토큰)

**Files:**
- Create: `src/styles.css`

- [ ] **Step 1: 작성 — `src/styles.css`**

```css
:root {
  /* 피치 파스텔 토큰 */
  --primary: #ee9678;
  --primary-strong: #e8896b;
  --secondary: #f6b9a3;
  --track: #f7e3da;
  --bg: #fffcfa;
  --panel: #ffffff;
  --rail: #fdf1ec;
  --border: #f7e7e0;
  --text-strong: #5e463d;
  --text: #8a7068;
  --text-muted: #b9a79f;
  --radius-lg: 16px;
  --radius-md: 12px;
  --shadow: 0 8px 24px rgba(232, 137, 107, 0.12);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  background: var(--bg);
  color: var(--text);
}

/* 상단바 */
#topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 18px; background: var(--bg); border-bottom: 1px solid var(--border);
}
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--primary-strong); font-size: 16px; }
.brand .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--secondary); }
#topbar .group { display: flex; gap: 8px; align-items: center; }
.tds-select {
  appearance: none; border: 1px solid var(--border); background: var(--panel);
  border-radius: 999px; padding: 6px 14px; font-size: 13px; color: var(--text-strong);
}
.tds-toggle-btn {
  border: 1px solid var(--border); background: var(--panel); color: var(--text);
  border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer;
}

/* 본문 3열 */
#layout { display: flex; min-height: calc(100vh - 58px); }

/* 좌측 레일 */
#rail {
  width: 84px; background: var(--rail); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 0;
}
.rail-item {
  width: 62px; padding: 9px 0; border-radius: var(--radius-md);
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  font-size: 11px; color: var(--text-muted); cursor: pointer; border: none; background: transparent;
}
.rail-item .ic { width: 26px; height: 26px; border-radius: 9px; background: var(--secondary); opacity: .5; }
.rail-item.active { background: var(--panel); color: var(--primary-strong); font-weight: 700; box-shadow: var(--shadow); }
.rail-item.active .ic { opacity: 1; }
.rail-item.soon { opacity: .5; }
.rail-item.soon .ic { background: transparent; border: 1.5px dashed #d6c3ba; }
.rail-add {
  width: 62px; padding: 7px 0; border-radius: var(--radius-md);
  border: 1.5px dashed #e3d2ca; color: var(--text-muted); font-size: 18px; background: transparent; cursor: default;
}

/* 중앙 프리뷰 */
#stage { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; background: var(--bg); padding: 18px; }
#canvas { max-width: 100%; max-height: 100%; border-radius: var(--radius-lg); background: #000; box-shadow: var(--shadow); }
.live-badge {
  position: absolute; top: 28px; left: 28px;
  display: flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,.85); backdrop-filter: blur(6px);
  border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--text-strong); font-weight: 600;
}
.live-badge .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #e8896b; }
#error {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  color: var(--primary-strong); font-size: 14px; text-align: center; max-width: 80%;
}

/* 우측 패널 */
#panel { width: 240px; background: var(--panel); border-left: 1px solid var(--border); padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.panel-title { font-weight: 700; color: var(--text-strong); font-size: 15px; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tab {
  font-size: 12px; padding: 5px 13px; border-radius: 999px;
  background: #fcebe4; color: #e69b80; border: none; cursor: pointer;
}
.tab.active { background: var(--secondary); color: #fff; }
.tab.soon { background: #f3f0ef; color: #c9beb9; cursor: default; }
.slider-group { display: none; flex-direction: column; gap: 12px; }
.slider-group.active { display: flex; }
.slider-row .label { display: flex; justify-content: space-between; font-size: 12px; color: var(--text); margin-bottom: 6px; }
.slider-row .label b { color: var(--primary-strong); font-weight: 600; }
input[type="range"] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 9px;
  border-radius: 999px; background: var(--track); outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
  background: var(--primary); box-shadow: 0 1px 4px rgba(232,137,107,.4); cursor: pointer;
}

/* 하단 CTA */
#bottom { display: flex; gap: 10px; align-items: center; justify-content: center; padding: 12px 18px; background: var(--bg); border-top: 1px solid var(--border); }
.cta { border-radius: 999px; padding: 9px 18px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
.cta.primary { background: var(--primary); color: #fff; }
.cta.ghost { background: var(--panel); border: 1px solid var(--border); color: var(--text); font-weight: 500; }
.cta.active { background: var(--secondary); color: #fff; }
.cta:disabled { opacity: .5; cursor: not-allowed; }

/* 진단 패널 */
#diagnostics { display: none; position: absolute; top: 28px; right: 28px; width: 220px; background: rgba(255,255,255,.92); backdrop-filter: blur(8px); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px; box-shadow: var(--shadow); }
#diagnostics.open { display: block; }
#stats { white-space: pre; font-family: ui-monospace, monospace; font-size: 12px; color: var(--text-strong); }
#diagnostics label { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 10px; color: var(--text); }

/* 토스트 */
#toast { position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%); background: var(--text-strong); color: #fff; padding: 8px 16px; border-radius: 999px; font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; }
#toast.show { opacity: .95; }
```

- [ ] **Step 2: 커밋**

```bash
git add src/styles.css
git commit -m "feat: 피치 파스텔/TDS 디자인 토큰 스타일시트"
```

---

## Task 3: index.html (새 레이아웃 마크업)

**Files:**
- Modify: `index.html` (전체 교체)

- [ ] **Step 1: 전체 교체 — `index.html`**

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
    <!-- 상단바 -->
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

    <!-- 본문 3열 -->
    <div id="layout">
      <!-- 좌측 대분류 레일 -->
      <div id="rail">
        <button class="rail-item active" data-cat="face"><span class="ic"></span>얼굴</button>
        <button class="rail-item soon" data-cat="body"><span class="ic"></span>몸매</button>
        <button class="rail-item soon" data-cat="filter"><span class="ic"></span>필터</button>
        <button class="rail-item soon" data-cat="makeup"><span class="ic"></span>화장</button>
        <button class="rail-item soon" data-cat="bg"><span class="ic"></span>배경</button>
        <div class="rail-add">+</div>
      </div>

      <!-- 중앙 프리뷰(필수) -->
      <div id="stage">
        <canvas id="canvas"></canvas>
        <div class="live-badge"><span class="live-dot"></span><span id="live-fps">— fps</span></div>
        <div id="error"></div>
        <!-- 접이식 진단 패널 -->
        <div id="diagnostics">
          <div id="stats">초기화 중…</div>
          <label><input type="checkbox" id="overlay" checked /> 메시 오버레이</label>
        </div>
      </div>

      <!-- 우측 보정 패널 -->
      <div id="panel">
        <div class="panel-title">얼굴 보정</div>
        <div class="tabs">
          <button class="tab active" data-tab="skin">피부</button>
          <button class="tab" data-tab="color">색보정</button>
          <button class="tab soon" data-tab="shape">윤곽</button>
          <button class="tab soon" data-tab="bg">배경</button>
        </div>

        <div class="slider-group active" id="tab-skin">
          <div class="slider-row"><div class="label"><span>스무딩</span><b>45</b></div><input type="range" min="0" max="100" value="45" /></div>
          <div class="slider-row"><div class="label"><span>질감 보존</span><b>70</b></div><input type="range" min="0" max="100" value="70" /></div>
          <div class="slider-row"><div class="label"><span>잡티 제거</span><b>20</b></div><input type="range" min="0" max="100" value="20" /></div>
          <div class="slider-row"><div class="label"><span>자동 노출</span><b>60</b></div><input type="range" min="0" max="100" value="60" /></div>
        </div>

        <div class="slider-group" id="tab-color">
          <div class="slider-row"><div class="label"><span>밝기</span><b>50</b></div><input type="range" min="0" max="100" value="50" /></div>
          <div class="slider-row"><div class="label"><span>대비</span><b>50</b></div><input type="range" min="0" max="100" value="50" /></div>
          <div class="slider-row"><div class="label"><span>톤</span><b>50</b></div><input type="range" min="0" max="100" value="50" /></div>
          <div class="slider-row"><div class="label"><span>화이트밸런스</span><b>50</b></div><input type="range" min="0" max="100" value="50" /></div>
        </div>
      </div>
    </div>

    <!-- 하단 CTA -->
    <div id="bottom">
      <button class="cta primary" id="vcam" disabled>● 가상캠 시작 (준비 중)</button>
      <button class="cta ghost" id="toggle-correction">보정 On/Off</button>
      <button class="cta ghost" id="before-after">Before/After</button>
      <button class="cta ghost" id="panic">패닉</button>
    </div>

    <div id="toast"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 커밋**

```bash
git add index.html
git commit -m "feat: 피치 파스텔 MVP 레이아웃 마크업(레일·프리뷰·패널·CTA)"
```

---

## Task 4: controls.ts (동작 컨트롤 + 진단) — hud.ts 대체

**Files:**
- Create: `src/ui/controls.ts`

> 단위테스트 없음(DOM/하드웨어 의존). Task 7 수동 검증.

- [ ] **Step 1: 구현 — `src/ui/controls.ts`**

```ts
import { parseResolution } from "./format";

export interface DiagnosticsSnapshot {
  fps: number;
  inferenceMs: number;
  frameMs: number;
  requested: string;
  actual: string;
  faceDetected: boolean;
  jsHeapMb: number | null;
}

export interface ControlsCallbacks {
  onSourceChange: () => void; // 카메라/해상도/fps 변경 시 스트림 재시작
}

export class Controls {
  private deviceEl = document.getElementById("device") as HTMLSelectElement;
  private resolutionEl = document.getElementById("resolution") as HTMLSelectElement;
  private fpsEl = document.getElementById("fps") as HTMLSelectElement;
  private overlayEl = document.getElementById("overlay") as HTMLInputElement;
  private statsEl = document.getElementById("stats") as HTMLElement;
  private errorEl = document.getElementById("error") as HTMLElement;
  private liveFpsEl = document.getElementById("live-fps") as HTMLElement;
  private diagEl = document.getElementById("diagnostics") as HTMLElement;
  private diagToggleEl = document.getElementById("diag-toggle") as HTMLButtonElement;

  constructor(cb: ControlsCallbacks) {
    this.deviceEl.addEventListener("change", () => cb.onSourceChange());
    this.resolutionEl.addEventListener("change", () => cb.onSourceChange());
    this.fpsEl.addEventListener("change", () => cb.onSourceChange());
    this.diagToggleEl.addEventListener("click", () => this.diagEl.classList.toggle("open"));
  }

  get overlayEnabled(): boolean {
    return this.overlayEl.checked;
  }

  get resolution(): { width: number; height: number } {
    return parseResolution(this.resolutionEl.value);
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

  updateDiagnostics(s: DiagnosticsSnapshot): void {
    this.liveFpsEl.textContent = `${s.fps.toFixed(0)} fps`;
    this.statsEl.textContent =
      `FPS:     ${s.fps.toFixed(1)}\n` +
      `추론:    ${s.inferenceMs.toFixed(1)} ms\n` +
      `프레임:  ${s.frameMs.toFixed(1)} ms\n` +
      `요청:    ${s.requested}\n` +
      `실제:    ${s.actual}\n` +
      `얼굴:    ${s.faceDetected ? "검출됨" : "없음"}\n` +
      `JS 힙:   ${s.jsHeapMb !== null ? s.jsHeapMb.toFixed(0) + " MB" : "N/A"}`;
  }

  showError(msg: string): void {
    this.errorEl.textContent = msg;
  }

  clearError(): void {
    this.errorEl.textContent = "";
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/ui/controls.ts
git commit -m "feat: 동작 컨트롤(카메라/해상도/fps) + 진단 패널 모듈"
```

---

## Task 5: main.ts (오케스트레이션 재배선) + hud.ts 삭제

**Files:**
- Modify: `src/main.ts` (전체 교체)
- Delete: `src/hud.ts`

> 이 Task 완료 시점이 **"카메라 연결 + 라이브 프리뷰에 얼굴 표시"** 마일스톤이다.

- [ ] **Step 1: 전체 교체 — `src/main.ts`**

```ts
import * as camera from "./camera";
import { Tracker } from "./tracker";
import { Renderer } from "./renderer";
import { FpsMeter, LatencyMeter } from "./metrics";
import { Controls } from "./ui/controls";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const tracker = new Tracker();
const renderer = new Renderer(canvas);
const fpsMeter = new FpsMeter(0.1);
const latencyMeter = new LatencyMeter(0.1);
const frameMeter = new LatencyMeter(0.1);

let current: camera.CameraInfo | null = null;
let running = false;
let requestedLabel = "";

const controls = new Controls({
  onSourceChange: () => void restart(),
});

async function restart(): Promise<void> {
  current = null; // 새 스트림 준비까지 루프 정지(stale 프레임 방지)
  try {
    const { width, height } = controls.resolution;
    const fps = controls.fps;
    requestedLabel = `${width}x${height} @${fps}`;
    current = await camera.start({ deviceId: controls.deviceId, width, height, fps });
    renderer.resize(current.actualWidth, current.actualHeight);
    controls.clearError();
  } catch (e) {
    controls.showError("카메라 시작 실패: " + (e as Error).message);
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
      renderer.draw(current.video, faces, controls.overlayEnabled);
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
    await restart(); // 권한 획득 → 장치 라벨 채우기 위해 먼저 시작
    controls.setDevices(await camera.listDevices());
    running = true;
    requestAnimationFrame(loop);
  } catch (e) {
    controls.showError("초기화 실패: " + (e as Error).message);
  }
}

void main();
```

- [ ] **Step 2: 구버전 hud.ts 삭제**

Run: `git rm src/hud.ts`
Expected: `rm 'src/hud.ts'`

- [ ] **Step 3: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 타입 에러 없음, 테스트 7개 통과

- [ ] **Step 4: 커밋**

```bash
git add src/main.ts
git commit -m "feat: 새 UI 셸에 라이브 프리뷰 파이프라인 연동, hud.ts 제거"
```

---

## Task 6: panel.ts (레일/탭/슬라이더/하단 CTA 플레이스홀더)

**Files:**
- Create: `src/ui/panel.ts`
- Modify: `src/main.ts` (Panel 인스턴스화 한 줄 추가)

> 단위테스트 없음(DOM 의존). Task 7 수동 검증.

- [ ] **Step 1: 구현 — `src/ui/panel.ts`**

```ts
// 플레이스홀더 인터랙션: 실제 보정 미연결. 시각 상태 토글 + "준비 중" 안내만.
export class Panel {
  private toastEl = document.getElementById("toast") as HTMLElement;
  private toastTimer: number | null = null;

  constructor() {
    this.wireSliders();
    this.wireTabs();
    this.wireRail();
    this.wireBottom();
  }

  private showToast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("show"), 1600);
  }

  // 슬라이더 드래그 → 우측 숫자만 변동(실효과 없음)
  private wireSliders(): void {
    document.querySelectorAll<HTMLInputElement>('#panel input[type="range"]').forEach((slider) => {
      slider.addEventListener("input", () => {
        const b = slider.parentElement?.querySelector(".label b");
        if (b) b.textContent = slider.value;
      });
    });
  }

  // 탭 전환(피부 ↔ 색보정). soon 탭은 안내.
  private wireTabs(): void {
    document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        if (tab.classList.contains("soon")) {
          this.showToast("준비 중인 기능입니다");
          return;
        }
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".slider-group").forEach((g) => g.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add("active");
      });
    });
  }

  // 레일: 얼굴만 활성, 나머지는 안내.
  private wireRail(): void {
    document.querySelectorAll<HTMLButtonElement>(".rail-item").forEach((item) => {
      item.addEventListener("click", () => {
        if (item.classList.contains("soon")) {
          this.showToast("준비 중인 기능입니다");
        }
      });
    });
  }

  // 하단 CTA: 시각 토글만(보정 미구현).
  private wireBottom(): void {
    const correction = document.getElementById("toggle-correction") as HTMLButtonElement;
    const beforeAfter = document.getElementById("before-after") as HTMLButtonElement;
    const panic = document.getElementById("panic") as HTMLButtonElement;
    correction.addEventListener("click", () => correction.classList.toggle("active"));
    beforeAfter.addEventListener("click", () => beforeAfter.classList.toggle("active"));
    panic.addEventListener("click", () => this.showToast("패닉: 원본 패스스루 (보정 연결 후 동작)"));
  }
}
```

- [ ] **Step 2: `src/main.ts`에 Panel 배선 추가**

`import { Controls } from "./ui/controls";` 아래 줄에 추가:

```ts
import { Panel } from "./ui/panel";
```

그리고 `const controls = new Controls({ ... });` 블록 바로 아래에 추가:

```ts
new Panel();
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/ui/panel.ts src/main.ts
git commit -m "feat: 레일/탭/슬라이더/하단 CTA 플레이스홀더 인터랙션"
```

---

## Task 7: Windows 실기기 수동 검증

> 코드 작업 아님 — 사용자가 Windows 브라우저에서 직접 실행·관찰. 이 작업 단위의 핵심 목적("얼굴이 제대로 나오는가") 확인.

- [ ] **Step 1: 개발 서버 실행**

Run (WSL2): `npm run dev -- --host`
Expected: bootstrap(wasm/모델) 후 `http://localhost:5173/` 출력

- [ ] **Step 2: 브라우저 접속 + 카메라 권한 허용**

Chrome/Edge로 `http://localhost:5173/` 접속 → 카메라 권한 허용

- [ ] **Step 3: 완료 기준 체크(스펙 §10)**

- [ ] 피치 파스텔/TDS 레이아웃이 보인다(상단바·레일·프리뷰·우측 패널·하단 CTA).
- [ ] **중앙 프리뷰에 본인 얼굴 라이브 영상이 제대로 나온다(좌우·위치 정상).**
- [ ] 메시 오버레이 체크박스 On/Off가 동작하고 메시가 얼굴에 정합한다.
- [ ] 카메라/해상도/fps 셀렉터 변경이 실제 반영된다.
- [ ] [진단] 버튼으로 패널이 펼쳐지고 FPS/추론/프레임/해상도/얼굴검출 수치가 나온다.
- [ ] 우측 탭(피부↔색보정) 전환·슬라이더 드래그 시 숫자 변동, soon 요소 클릭 시 "준비 중" 토스트.
- [ ] 하단 보정 On/Off·Before/After 시각 토글, 패닉 토스트.

- [ ] **Step 4: 결과 기록**

라이브 프리뷰 정상 여부 + 콘솔의 GPU→CPU 폴백 경고 유무를 메모. 정상이면 다음 단계(실제 FabSoften 보정값 연결)로 진행.

---

## 부록: 자가 점검 결과

- **스펙 커버리지:** 레이아웃(Task 2·3) / 라이브 프리뷰 연동(Task 5) / 동작 컨트롤·진단(Task 4) / 플레이스홀더 인터랙션(Task 6) / 순수 헬퍼 테스트(Task 1) / 수동 검증(Task 7) — 스펙 §2·§4·§5·§7·§10 전부 대응.
- **타입 일관성:** `Controls`(`onSourceChange`, `updateDiagnostics`, `DiagnosticsSnapshot`, `overlayEnabled`, `resolution`, `fps`, `deviceId`, `setDevices`, `showError`, `clearError`)가 Task 4 정의와 Task 5 사용처에서 일치. `parseResolution`(Task 1) → controls(Task 4)에서 사용. `Panel`(Task 6) 무인자 생성자.
- **플레이스홀더 없음:** 모든 코드 스텝에 실제 코드 포함.
```
