import * as camera from "../shared/camera/camera";
import { Tracker } from "../vision/tracker";
import { Segmenter } from "../vision/segmenter";
import { Pipeline } from "../pipeline/pipeline";
import { MeshOverlay } from "../ui/overlay/overlay";
import { FpsMeter, LatencyMeter } from "../shared/metrics/metrics";
import { Store } from "../entities/scene/store";
import { getActiveScene } from "../entities/scene/reducer";
import { LAYER_ORDER } from "../entities/scene/defaults";
import { DockControls } from "../ui/docks/dockControls";
import { ScenesDock } from "../ui/docks/scenes";
import { LayersDock } from "../ui/docks/layers";
import { EditorDock } from "../ui/docks/editor";
import { initResizableDocks } from "../ui/layout/resizable";
import { createCanvasFitter } from "../ui/layout/canvasFit";

const glCanvas = document.getElementById("gl-canvas") as HTMLCanvasElement;
const overlayCanvas = document.getElementById("overlay-canvas") as HTMLCanvasElement;
const tracker = new Tracker();
const segmenter = new Segmenter();
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
let lastDiagTime = 0;
let lastDetectTs = 0; // MediaPipe VIDEO 모드는 단조증가 타임스탬프 필요
let correctionOn = true; // 보정 On/Off
let showOriginal = false; // Before/After: true면 원본

const controls = new DockControls({
  onSourceChange: () => void restart(),
  onToggleCorrection: (on) => (correctionOn = on),
  onBeforeAfter: (orig) => (showOriginal = orig),
  onPanic: () => {
    correctionOn = false;
    controls.setCorrection(false);
    showToast("패닉: 원본 패스스루");
  },
});
new ScenesDock(store);
new LayersDock(store);
new EditorDock(store);
initResizableDocks();

// 캔버스를 표시 크기×DPR로 렌더(브라우저 축소 모아레 제거 + GPU 부하 감소)
const fitter = createCanvasFitter(
  document.getElementById("stage") as HTMLElement,
  [glCanvas, overlayCanvas],
  (bw, bh) => {
    pipeline.resize(bw, bh);
    overlay.resize(bw, bh);
  }
);

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
    fitter.setAspect(current.actualWidth / current.actualHeight);
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
    const detectTs = Math.max(frameStart, lastDetectTs + 1);
    lastDetectTs = detectTs;
    let faceDetected = false;
    try {
      const { faces, inferenceMs } = tracker.detect(current.video, detectTs);
      faceDetected = faces.length > 0;
      latencyMeter.record(inferenceMs);
      // 배경 레이어가 켜져 있을 때만 세그멘테이션 실행(비용 큼)
      const bgOn =
        correctionOn && !showOriginal &&
        getActiveScene(store.get()).layers.some((l) => l.id === "background" && l.enabled);
      if (bgOn) {
        try {
          const seg = segmenter.segment(current.video, detectTs);
          if (seg) pipeline.updateSegMask(seg.data, seg.width, seg.height);
        } catch {
          /* 세그멘테이션 실패 무시 */
        }
      }
      pipeline.render(current.video, activeLayers(), faces[0] ?? null);
      overlay.draw(faces, controls.overlayEnabled);
    } catch (e) {
      controls.showError("추론/렌더 오류: " + (e as Error).message);
    }
    fpsMeter.tick(frameStart);
    frameMeter.record(performance.now() - frameStart);
    if (now - lastDiagTime >= 250) {
      lastDiagTime = now;
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
  }
  requestAnimationFrame(loop);
}

async function main(): Promise<void> {
  try {
    await tracker.init();
    try {
      await segmenter.init();
    } catch (e) {
      controls.showError("배경 세그멘테이션 모델 로드 실패(배경 기능 비활성): " + (e as Error).message);
    }
    await restart();
    controls.setDevices(await camera.listDevices());
    running = true;
    requestAnimationFrame(loop);
  } catch (e) {
    controls.showError("초기화 실패: " + (e as Error).message);
  }
}

void main();
