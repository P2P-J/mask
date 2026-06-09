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
  current = null; // 새 스트림이 준비될 때까지 루프를 멈춰 stale 프레임 오염 방지
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
