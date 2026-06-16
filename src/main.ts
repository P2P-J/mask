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
