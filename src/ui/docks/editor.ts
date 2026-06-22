import type { Store } from "../../entities/scene/store";
import { getSelectedLayer, setParam, setColor, setSelect } from "../../entities/scene/reducer";

// 슬라이더 라벨(한국어)
const LABELS: Record<string, string> = {
  strength: "강도", texture: "질감 보존",
  clarity: "잡티/주름 완화", evenTone: "피부톤 균일화", brighten: "얼굴 밝히기", darkCircle: "다크서클 완화",
  brightness: "밝기", contrast: "대비", tone: "톤", white: "화이트밸런스",
  saturation: "채도", warmth: "따뜻함",
  exposure: "노출(±)", highlights: "하이라이트(±)", shadows: "그림자(±)", gamma: "감마(±)",
  tint: "색조 녹↔마젠타(±)", vibrance: "생동감(±)", hue: "색상 회전(±)", sharpness: "선명도",
  structure: "구조(로컬 대비±)", fade: "페이드", vignette: "비네트", grain: "그레인",
  splitTone: "스플릿톤 강도", splitBalance: "스플릿 밸런스(±)",
  splitShadow: "스플릿 그림자", splitHighlight: "스플릿 하이라이트",
  hslBand: "HSL 색상",
  whiten: "화이트닝",
  slim: "얼굴 갸름", faceSize: "작은 얼굴", cheekbone: "광대 축소", jaw: "V라인 턱",
  chinLength: "턱 길이(±)", forehead: "이마 축소",
  eyeSize: "눈 크게", eyeSpacing: "눈 간격(±)", eyeCorner: "눈꼬리(±)", pupil: "동공 확대",
  eyeBrighten: "눈 밝히기", aegyo: "애교살",
  noseSize: "코 축소", noseBridge: "콧대 슬림", noseTip: "코끝 축소", noseWing: "코볼 축소",
  mouthSize: "입 크기", lipThick: "입술 도톰", smile: "입꼬리(미소)", browHeight: "눈썹 높이",
  // W4b 확장
  faceLength: "얼굴 길이(±)", jawWidth: "턱폭(하관)", temple: "관자놀이", cheekReduce: "볼살 축소",
  cheekLift: "볼 리프팅", innerCorner: "앞트임", outerCorner: "뒤트임", eyeHeight: "눈 높이",
  eyePosY: "눈 위치 상하(±)", philtrum: "인중 길이(±)", lipWidth: "입술 너비(±)", cupidBow: "큐피드 보우",
  noseRoot: "코뿌리", noseLength: "코 길이(±)", browDist: "눈썹 간격(±)",
  lipstick: "립스틱", blush: "블러셔", eyeshadow: "아이섀도", eyebrow: "아이브로우",
  liner: "아이라이너", contour: "컨투어", eyelash: "속눈썹",
  intensity: "강도", preset: "프리셋",
  blur: "배경 흐림", headSize: "머리 크기(소두)",
};

const HSL_KEY = /^hsl[HSL]\d$/;

export class EditorDock {
  private titleEl = document.getElementById("editor-title") as HTMLElement;
  private bodyEl = document.getElementById("editor-body") as HTMLElement;
  private suppress = false; // 슬라이더 드래그 중 자기 유발 재렌더 차단(드래그 끊김 방지)

  constructor(private store: Store) {
    this.store.subscribe(() => this.render());
    this.render();
  }

  // 슬라이더 행 한 줄 생성(일반 파라미터 + HSL 위젯 공용)
  private makeSlider(layerId: string, key: string, value: number, labelText: string): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "slider-row";
    const label = document.createElement("div");
    label.className = "label";
    const val = document.createElement("b");
    val.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = labelText;
    label.append(span, val);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0"; slider.max = "100";
    slider.value = String(value);
    slider.addEventListener("input", () => {
      val.textContent = slider.value;
      // suppress로 자기 유발 재렌더를 막아 드래그 중 슬라이더 DOM이 파괴되지 않게 함.
      // store는 갱신되므로 GL 프리뷰는 다음 프레임에 즉시 반영됨.
      this.suppress = true;
      this.store.update((st) => setParam(st, layerId, key, Number(slider.value)));
      this.suppress = false;
    });
    wrap.append(label, slider);
    return wrap;
  }

  private render(): void {
    if (this.suppress) return;
    const layer = getSelectedLayer(this.store.get());
    this.titleEl.textContent = `편집 — ${layer.name}`;
    this.bodyEl.innerHTML = "";
    const keys = Object.keys(layer.params).filter((k) => !HSL_KEY.test(k)); // HSL은 전용 위젯
    if (keys.length === 0 && !layer.colors && !layer.selects) {
      const e = document.createElement("div");
      e.className = "editor-empty";
      e.textContent = "조절할 항목이 없습니다";
      this.bodyEl.appendChild(e);
      return;
    }
    keys.forEach((key) => {
      this.bodyEl.appendChild(this.makeSlider(layer.id, key, layer.params[key], LABELS[key] ?? key));
    });

    // 드롭다운(필터 프리셋 등) — hslBand는 HSL 위젯에서 따로 렌더
    if (layer.selects) {
      Object.keys(layer.selects).forEach((key) => {
        if (key === "hslBand") return;
        const sel = layer.selects![key];
        const row = document.createElement("div");
        row.className = "color-row";
        const span = document.createElement("span");
        span.textContent = LABELS[key] ?? key;
        const dd = document.createElement("select");
        dd.className = "tds-select";
        sel.options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          if (opt === sel.value) o.selected = true;
          dd.appendChild(o);
        });
        dd.addEventListener("change", () => this.store.update((st) => setSelect(st, layer.id, key, dd.value)));
        row.append(span, dd);
        this.bodyEl.appendChild(row);
      });
    }

    // HSL 8밴드 위젯: 밴드 드롭다운 + 활성 밴드 H/S/L 3슬라이더
    const hslSel = layer.selects?.hslBand;
    if (hslSel) {
      const band = Math.max(0, hslSel.options.indexOf(hslSel.value));
      const row = document.createElement("div");
      row.className = "color-row";
      const span = document.createElement("span");
      span.textContent = LABELS.hslBand;
      const dd = document.createElement("select");
      dd.className = "tds-select";
      hslSel.options.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        if (opt === hslSel.value) o.selected = true;
        dd.appendChild(o);
      });
      dd.addEventListener("change", () => this.store.update((st) => setSelect(st, layer.id, "hslBand", dd.value)));
      row.append(span, dd);
      this.bodyEl.appendChild(row);

      const chans: [string, string][] = [["H", "색상(±)"], ["S", "채도(±)"], ["L", "밝기(±)"]];
      chans.forEach(([ch, lbl]) => {
        const key = `hsl${ch}${band}`;
        this.bodyEl.appendChild(this.makeSlider(layer.id, key, layer.params[key] ?? 50, lbl));
      });
    }

    // 색상(메이크업/스플릿톤 등) — 컬러 피커
    if (layer.colors) {
      Object.keys(layer.colors).forEach((key) => {
        const row = document.createElement("div");
        row.className = "color-row";
        const span = document.createElement("span");
        span.textContent = `${LABELS[key] ?? key} 색`;
        const picker = document.createElement("input");
        picker.type = "color";
        picker.value = layer.colors![key];
        picker.addEventListener("input", () => {
          this.suppress = true;
          this.store.update((st) => setColor(st, layer.id, key, picker.value));
          this.suppress = false;
        });
        row.append(span, picker);
        this.bodyEl.appendChild(row);
      });
    }
  }
}
