import { injectStyles } from "./styles";

// 동의 모달 표시 → 동의 true / 거부 false
export function showConsentModal(): Promise<boolean> {
  injectStyles();
  return new Promise<boolean>((resolve) => {
    const bg = document.createElement("div");
    bg.className = "bc-modal-bg";
    bg.innerHTML = `
      <div class="bc-modal" role="dialog" aria-modal="true">
        <h3>테스트 캡처 동의</h3>
        <div>이 앱(Mask)의 <b>보정된 미리보기 화면</b>이 약 10초 길이의 영상 클립으로
        개발자의 테스트용 텔레그램으로 전송됩니다.</div>
        <ul>
          <li>수집 대상: <b>보정 결과 화면만</b>. 바탕화면·다른 창·원본 웹캠은 따로 수집하지 않습니다.</li>
          <li>목적: 보정이 실기기에서 제대로 적용되는지 검증.</li>
          <li>전송 중에는 화면에 🔴 표시가 항상 보이며, 언제든 중단할 수 있습니다.</li>
          <li><b>동의하지 않으면 아무것도 전송되지 않습니다.</b></li>
        </ul>
        <div class="bc-row">
          <button class="bc-btn bc-no" type="button">동의 안 함</button>
          <button class="bc-btn bc-ok" type="button">동의하고 시작</button>
        </div>
      </div>`;
    const done = (v: boolean) => {
      bg.remove();
      resolve(v);
    };
    bg.querySelector(".bc-ok")!.addEventListener("click", () => done(true));
    bg.querySelector(".bc-no")!.addEventListener("click", () => done(false));
    bg.addEventListener("click", (e) => {
      if (e.target === bg) done(false);
    });
    document.body.appendChild(bg);
  });
}
