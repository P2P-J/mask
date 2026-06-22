import { injectStyles } from "./styles";

// 전송 중 상시 표시 배지
export class Indicator {
  private el: HTMLElement;
  constructor() {
    injectStyles();
    this.el = document.createElement("div");
    this.el.className = "bc-badge";
    this.el.innerHTML = `<span class="bc-dot"></span><span>얼굴 인식 중</span>`;
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
