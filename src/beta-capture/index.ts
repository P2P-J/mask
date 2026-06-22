import { loadConfig } from "./config";
import { hasConsent, setConsent } from "./state";
import { showConsentModal } from "./consent";
import { CaptureLoop } from "./capture";
import { sendClip } from "./telegram";
import { Indicator } from "./indicator";
import { injectStyles } from "./styles";

export interface BetaCaptureOpts {
  canvas: HTMLCanvasElement;
}

export interface BetaCaptureHandle {
  startupGate(): Promise<void>;
  teardown(): void;
}

const LABEL_IDLE = "🎥 얼굴 인식 중";

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function mountBetaCapture(opts: BetaCaptureOpts): BetaCaptureHandle {
  injectStyles();
  const cfg = loadConfig();

  const btn = document.createElement("button");
  btn.className = "bc-launch";
  btn.type = "button";
  btn.textContent = LABEL_IDLE;
  document.body.appendChild(btn);

  if (!cfg) {
    btn.textContent = `${LABEL_IDLE}(미설정)`;
    btn.disabled = true;
    return { startupGate: async () => {}, teardown: () => btn.remove() };
  }

  const label = randomId();
  let loop: CaptureLoop | null = null;
  let indicator: Indicator | null = null;
  let sending = false;

  const start = (): void => {
    if (loop) return;
    indicator = indicator ?? new Indicator();
    loop = new CaptureLoop(
      opts.canvas,
      cfg.fps,
      cfg.clipSeconds,
      (blob, mime) => {
        if (sending) return;
        sending = true;
        const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
        const fileTs = ts.replace(/[ :]/g, "-");
        void sendClip(
          cfg,
          blob,
          mime,
          `Mask 캡처 · ${label} · ${ts}`,
          `${label}_${fileTs}`,
        ).finally(() => {
          sending = false;
        });
      },
    );
    loop.start();
    indicator.show();
  };

  const ensureConsentThenStart = async (): Promise<void> => {
    if (!hasConsent()) {
      const ok = await showConsentModal();
      if (!ok) return;
      setConsent(true);
    }
    btn.style.display = "none";
    start();
  };

  btn.addEventListener("click", () => {
    void ensureConsentThenStart();
  });

  return {
    startupGate: ensureConsentThenStart,
    teardown: () => {
      loop?.stop();
      loop = null;
      indicator?.destroy();
      btn.remove();
    },
  };
}
