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
import { initResizableDocks } from "./ui/resizable";

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
    controls.setCorrection(false);
    showToast("패닉: 원본 패스스루");
  },
});
new ScenesDock(store);
new LayersDock(store);
new EditorDock(store);
initResizableDocks();

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
