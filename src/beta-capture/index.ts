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
  // 앱 시작 시(얼굴 분석 전) 호출. 미동의면 동의 모달을 띄우고 결정될 때까지 대기.
  // 동의(이번 또는 과거)면 캡처 자동 시작 — 동의한 적 있으면 다시 묻지 않음.
  // 비동의면 아무것도 하지 않음(다음 실행에 다시 물음).
  startupGate(): Promise<void>;
  teardown(): void;
}

// 좌하단 토글 버튼을 주입하고 전체 흐름을 배선.
export function mountBetaCapture(opts: BetaCaptureOpts): BetaCaptureHandle {
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
    return { startupGate: async () => {}, teardown: () => btn.remove() };
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
    if (loop) return; // 중복 시작 방지(시작 게이트와 버튼 동시 진입 등)
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

  // 앱 시작 시 얼굴 분석 전에 호출되는 동의 게이트.
  const startupGate = async (): Promise<void> => {
    if (hasConsent()) {
      start(); // 과거에 동의함 → 다시 묻지 않고 바로 캡처
      return;
    }
    const ok = await showConsentModal();
    if (ok) {
      setConsent(true);
      start();
    }
    // 비동의: 캡처 안 함(다음 실행에 다시 물음)
  };

  return {
    startupGate,
    teardown: () => {
      stop();
      indicator?.destroy();
      btn.remove();
    },
  };
}
