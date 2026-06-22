// 지원되는 첫 코덱 선택(mp4/H.264 우선 → 텔레그램 인라인 재생)
export function pickMime(isSupported: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string {
  const prefs = ["video/mp4;codecs=h264", "video/webm;codecs=vp8", "video/webm"];
  for (const t of prefs) if (isSupported(t)) return t;
  return "video/webm";
}

export type ClipHandler = (blob: Blob, mime: string) => void;

// 캔버스를 clipSeconds 단위 클립으로 반복 인코딩 → onClip 호출.
// 백프레셔: onClip 쪽이 바쁘면(전송 중) 호출자가 클립을 버린다(여기선 항상 emit).
export class CaptureLoop {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private active = false;
  private mime: string;

  constructor(
    private canvas: HTMLCanvasElement,
    private fps: number,
    private clipSeconds: number,
    private onClip: ClipHandler
  ) {
    this.mime = pickMime();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.stream = this.canvas.captureStream(this.fps);
    this.cycle();
  }

  // 한 클립 녹화 → emit → 다음 클립
  private cycle(): void {
    if (!this.active || !this.stream) return;
    const rec = new MediaRecorder(this.stream, { mimeType: this.mime });
    this.rec = rec;
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      if (chunks.length) this.onClip(new Blob(chunks, { type: this.mime }), this.mime);
      this.cycle(); // 다음 클립
    };
    rec.start();
    window.setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
    }, this.clipSeconds * 1000);
  }

  stop(): void {
    this.active = false;
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    this.rec = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
