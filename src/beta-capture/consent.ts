import { injectStyles } from "./styles";

// 동의 모달 표시 → 동의 true / 거부 false.
export function showConsentModal(): Promise<boolean> {
  injectStyles();
  return new Promise<boolean>((resolve) => {
    const bg = document.createElement("div");
    bg.className = "bc-modal-bg";
    bg.innerHTML = `
      <div class="bc-modal" role="dialog" aria-modal="true">
        <h3>얼굴 인식</h3>
        <div>이 <b>Mask</b>앱의 안전한 얼굴 인식을 위하여 웹캠 접근 권한이 필요합니다.</div>
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
