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

// 좌하단 토글 버튼을 주입하고 전체 흐름을 배선. teardown 반환.
export function mountBetaCapture(opts: BetaCaptureOpts): () => void {
  injectStyles();
  const cfg = loadConfig();

  const btn = document.createElement("button");
  btn.className = "bc-launch";
  btn.type = "button";
  btn.textContent = "🎥 테스트 캡처";
  document.body.appendChild(btn);

  if (!cfg) {
    btn.textContent = "🎥 테스트 캡처(미설정)";
    btn.disabled = true;
    return () => btn.remove();
  }

  let loop: CaptureLoop | null = null;
  let indicator: Indicator | null = null;
  let sending = false; // 백프레셔: 전송 중이면 다음 클립 버림

  const stop = (): void => {
    loop?.stop();
    loop = null;
    sending = false; // 재시작 시 첫 클립이 드롭되지 않도록 백프레셔 초기화
    indicator?.hide();
    btn.classList.remove("on");
    btn.textContent = "🎥 테스트 캡처";
  };

  const start = (): void => {
    indicator = indicator ?? new Indicator(stop);
    loop = new CaptureLoop(opts.canvas, cfg.fps, cfg.clipSeconds, (blob, mime) => {
      if (sending) return; // 이전 클립 전송 중 → 드롭(업링크 보호)
      sending = true;
      const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
      void sendClip(cfg, blob, mime, `Mask 보정 캡처 ${ts}`).finally(() => {
        sending = false;
      });
    });
    loop.start();
    indicator.show();
    btn.classList.add("on");
    btn.textContent = "🎥 캡처 중 — 끄기";
  };

  btn.addEventListener("click", async () => {
    if (loop) {
      stop();
      return;
    }
    if (!hasConsent()) {
      const ok = await showConsentModal();
      if (!ok) return; // 비동의 → 전송 0
      setConsent(true);
    }
    start();
  });

  return () => {
    stop();
    indicator?.destroy();
    btn.remove();
  };
}
