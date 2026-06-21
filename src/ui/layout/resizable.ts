// OBS식 도크 리사이즈.
// - 세로 스플리터: 인접한 두 도크의 폭을 함께 조절(총합 유지) → 최소폭 내에서 자유 분배.
// - 가로 스플리터: 도크 영역 높이 조절(미리보기가 나머지를 차지).
// 크기는 localStorage에 저장해 새로고침 후에도 유지.

const KEY = "mask.layout.v1";
const MIN_W = 100; // 도크 최소 폭(px)
const MIN_H = 120; // 도크 영역 최소 높이(px)

interface Layout {
  docksHeight?: number;
  dockWidths?: number[]; // 각 도크 폭(px), 순서대로
}

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Layout) : {};
  } catch {
    return {};
  }
}

function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* 저장 실패 무시 */
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// onStart는 pointerdown 시점의 기준값을 캡처해 move(delta) 함수를 반환.
function makeDraggable(
  handle: HTMLElement,
  axis: "x" | "y",
  onStart: () => (delta: number) => void,
  onEnd: () => void
): void {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const onMove = onStart();
    handle.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent): void => {
      onMove((axis === "x" ? ev.clientX : ev.clientY) - startPos);
    };
    const up = (ev: PointerEvent): void => {
      handle.releasePointerCapture(ev.pointerId);
      document.body.style.userSelect = "";
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up); // 취소 시에도 정리(텍스트 선택 잠김 방지)
      onEnd();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
}

export function initResizableDocks(): void {
  const docks = document.getElementById("docks") as HTMLElement | null;
  const hSplit = document.getElementById("docks-splitter") as HTMLElement | null;
  if (!docks || !hSplit) return;
  const dockEls = Array.from(docks.querySelectorAll<HTMLElement>(".dock"));
  const layout = loadLayout();

  // 모든 도크를 고정 px 폭으로 고정(초기엔 현재 렌더 폭 측정, 저장값 있으면 복원)
  const widths =
    layout.dockWidths && layout.dockWidths.length === dockEls.length
      ? layout.dockWidths
      : dockEls.map((el) => el.offsetWidth);
  dockEls.forEach((el, i) => {
    el.style.flex = `0 0 ${widths[i]}px`;
  });
  if (layout.docksHeight) docks.style.height = `${layout.docksHeight}px`;

  const persist = (): void => {
    layout.dockWidths = dockEls.map((el) => el.offsetWidth);
    layout.docksHeight = docks.offsetHeight;
    saveLayout(layout);
  };

  // 도크 영역 높이(가로 스플리터를 아래로 끌면 도크가 작아짐)
  makeDraggable(
    hSplit,
    "y",
    () => {
      const base = docks.offsetHeight;
      return (delta) => {
        const h = clamp(base - delta, MIN_H, window.innerHeight - 160);
        docks.style.height = `${h}px`;
      };
    },
    persist
  );

  // 폭: 각 세로 스플리터는 좌/우 인접 도크를 함께 조절(총합 유지)
  docks.querySelectorAll<HTMLElement>(".v-splitter").forEach((sp) => {
    const i = Number(sp.dataset.index);
    const left = dockEls[i];
    const right = dockEls[i + 1];
    if (!left || !right) return;
    makeDraggable(
      sp,
      "x",
      () => {
        const lBase = left.offsetWidth;
        const total = left.offsetWidth + right.offsetWidth;
        return (delta) => {
          const l = clamp(lBase + delta, MIN_W, total - MIN_W);
          left.style.flex = `0 0 ${l}px`;
          right.style.flex = `0 0 ${total - l}px`;
        };
      },
      persist
    );
  });
}
