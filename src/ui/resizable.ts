// OBS식 도크 리사이즈: 미리보기↔도크 높이(가로 스플리터) + 도크 폭(세로 스플리터).
// 크기는 localStorage에 저장해 새로고침 후에도 유지.

const KEY = "mask.layout.v1";

interface Layout {
  docksHeight?: number;
  dockWidths?: Record<string, number>; // 도크 인덱스 → px
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

// 드래그 배선. sign: 드래그 방향과 크기 증가의 관계(높이는 아래로 끌면 작아져서 -1).
function makeDraggable(
  handle: HTMLElement,
  axis: "x" | "y",
  sign: 1 | -1,
  getBase: () => number,
  applyClamped: (candidate: number) => number,
  onEnd: (size: number) => void
): void {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const base = getBase();
    let last = base;
    handle.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent): void => {
      const delta = ((axis === "x" ? ev.clientX : ev.clientY) - startPos) * sign;
      last = applyClamped(base + delta);
    };
    const up = (ev: PointerEvent): void => {
      handle.releasePointerCapture(ev.pointerId);
      document.body.style.userSelect = "";
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      onEnd(last);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}

export function initResizableDocks(): void {
  const docks = document.getElementById("docks") as HTMLElement | null;
  const hSplit = document.getElementById("docks-splitter") as HTMLElement | null;
  if (!docks || !hSplit) return;
  const dockEls = Array.from(docks.querySelectorAll<HTMLElement>(".dock"));
  const layout = loadLayout();

  // 저장된 크기 복원
  if (layout.docksHeight) docks.style.height = `${layout.docksHeight}px`;
  if (layout.dockWidths) {
    for (const [idx, w] of Object.entries(layout.dockWidths)) {
      const el = dockEls[Number(idx)];
      if (el) el.style.flex = `0 0 ${w}px`;
    }
  }

  // 도크 영역 높이(가로 스플리터를 아래로 끌면 도크가 작아짐 → sign -1)
  makeDraggable(
    hSplit,
    "y",
    -1,
    () => docks.offsetHeight,
    (cand) => {
      const h = clamp(cand, 120, window.innerHeight - 200);
      docks.style.height = `${h}px`;
      return h;
    },
    (h) => {
      layout.docksHeight = h;
      saveLayout(layout);
    }
  );

  // 각 세로 스플리터는 왼쪽 도크(dockEls[index]) 폭 조절
  docks.querySelectorAll<HTMLElement>(".v-splitter").forEach((sp) => {
    const idx = Number(sp.dataset.index);
    const el = dockEls[idx];
    if (!el) return;
    makeDraggable(
      sp,
      "x",
      1,
      () => el.offsetWidth,
      (cand) => {
        const w = clamp(cand, 120, 600);
        el.style.flex = `0 0 ${w}px`;
        return w;
      },
      (w) => {
        layout.dockWidths = { ...(layout.dockWidths ?? {}), [idx]: w };
        saveLayout(layout);
      }
    );
  });
}
