// 플레이스홀더 인터랙션: 실제 보정 미연결. 시각 상태 토글 + "준비 중" 안내만.
export class Panel {
  private toastEl = document.getElementById("toast") as HTMLElement;
  private toastTimer: number | null = null;

  constructor() {
    this.wireSliders();
    this.wireTabs();
    this.wireRail();
    this.wireBottom();
  }

  private showToast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("show"), 1600);
  }

  // 슬라이더 드래그 → 우측 숫자만 변동(실효과 없음)
  private wireSliders(): void {
    document.querySelectorAll<HTMLInputElement>('#panel input[type="range"]').forEach((slider) => {
      slider.addEventListener("input", () => {
        const b = slider.parentElement?.querySelector(".label b");
        if (b) b.textContent = slider.value;
      });
    });
  }

  // 탭 전환(피부 ↔ 색보정). soon 탭은 안내.
  private wireTabs(): void {
    document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        if (tab.classList.contains("soon")) {
          this.showToast("준비 중인 기능입니다");
          return;
        }
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".slider-group").forEach((g) => g.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add("active");
      });
    });
  }

  // 레일: 얼굴만 활성, 나머지는 안내.
  private wireRail(): void {
    document.querySelectorAll<HTMLButtonElement>(".rail-item").forEach((item) => {
      item.addEventListener("click", () => {
        if (item.classList.contains("soon")) {
          this.showToast("준비 중인 기능입니다");
        }
      });
    });
  }

  // 하단 CTA: 시각 토글만(보정 미구현).
  private wireBottom(): void {
    const correction = document.getElementById("toggle-correction") as HTMLButtonElement;
    const beforeAfter = document.getElementById("before-after") as HTMLButtonElement;
    const panic = document.getElementById("panic") as HTMLButtonElement;
    correction.addEventListener("click", () => correction.classList.toggle("active"));
    beforeAfter.addEventListener("click", () => beforeAfter.classList.toggle("active"));
    panic.addEventListener("click", () => this.showToast("패닉: 원본 패스스루 (보정 연결 후 동작)"));
  }
}
