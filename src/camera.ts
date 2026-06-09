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
