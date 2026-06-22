import { injectStyles } from "./styles";

// 전송 중 상시 표시 배지 + 즉시 중단 버튼
export class Indicator {
  private el: HTMLElement;
  constructor(onStop: () => void) {
    injectStyles();
    this.el = document.createElement("div");
    this.el.className = "bc-badge";
    this.el.innerHTML = `<span class="bc-dot"></span><span>테스트 캡처 전송 중</span>
      <button class="bc-stop" type="button">중단</button>`;
    this.el.querySelector(".bc-stop")!.addEventListener("click", onStop);
    document.body.appendChild(this.el);
  }
  show(): void {
    this.el.classList.add("show");
  }
  hide(): void {
    this.el.classList.remove("show");
  }
  destroy(): void {
    this.el.remove();
  }
}
