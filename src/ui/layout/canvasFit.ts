// 캔버스를 "실제 표시 크기 × devicePixelRatio"로 렌더해 브라우저 축소(모아레/줄무늬)를 제거.
// #stage 크기 변화(도크 리사이즈 등)에 맞춰 자동 재조정.

export interface CanvasFitter {
  setAspect(aspect: number): void;
}

export function createCanvasFitter(
  stage: HTMLElement,
  canvases: HTMLCanvasElement[],
  onResize: (bufW: number, bufH: number) => void
): CanvasFitter {
  let aspect = 16 / 9;
  let lastBw = 0;
  let lastBh = 0;
  const PAD = 28; // #stage padding 14px × 2

  const fit = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // 과도한 버퍼 방지 위해 2로 캡
    const availW = stage.clientWidth - PAD;
    const availH = stage.clientHeight - PAD;
    if (availW <= 0 || availH <= 0) return;

    // 가용 영역 안에서 종횡비 유지하는 최대 크기
    let cssW = availW;
    let cssH = availW / aspect;
    if (cssH > availH) {
      cssH = availH;
      cssW = availH * aspect;
    }
    for (const c of canvases) {
      c.style.width = `${Math.round(cssW)}px`;
      c.style.height = `${Math.round(cssH)}px`;
    }

    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (bw === lastBw && bh === lastBh) return; // 변화 없으면 재할당 생략
    lastBw = bw;
    lastBh = bh;
    onResize(bw, bh);
  };

  new ResizeObserver(fit).observe(stage);
  return {
    setAspect(a: number): void {
      if (a > 0) aspect = a;
      fit();
    },
  };
}
