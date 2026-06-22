# 베타 캡처(텔레그램 전송) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동의한 테스터의 **보정된 미리보기 화면**을 짧은 영상 클립으로 잘라 개발자의 텔레그램 봇으로 전송해, 실기기에서 보정이 제대로 적용되는지 준실시간으로 검증한다.

**Architecture:** 기능 전체를 **격리 폴더 `src/beta-capture/`** 에 담아 통째로 삭제 가능하게 만든다. 기존 코드 접점은 `src/app/main.ts` 의 **import 1줄 + 호출 1줄** 뿐. UI는 자체 플로팅 버튼·배지를 DOM에 주입해 기존 dock/styles.css 를 건드리지 않는다. 비밀값(봇 토큰·chat id)은 폴더 안 gitignore 파일(`secret.local.ts`)에만 두고, 없으면 기능이 조용히 비활성된다.

**Tech Stack:** TypeScript, `HTMLCanvasElement.captureStream()` + `MediaRecorder`(클립 인코딩), Telegram Bot API `sendVideo`/`sendDocument`(multipart fetch), Vite `import.meta.glob`(선택적 비밀파일 로드), Vitest(순수 헬퍼 단위테스트, env=node).

**핵심 안전장치(타협 불가):** ①기본 OFF ②명시적 동의 모달(무엇/어디로/왜/중단가능) — 비동의 시 전송 0 ③전송 중 상시 `🔴` 배지 + 즉시 중단 ④캡처 범위 = 보정 캔버스(`gl-canvas`)만 ⑤토큰 소스 하드코딩 금지·gitignore.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/beta-capture/README.md` | 기능 설명 + **삭제 방법**(seam 문서) |
| `src/beta-capture/secret.example.ts` | 비밀값 템플릿(커밋됨). 복사해서 secret.local.ts 생성 |
| `src/beta-capture/secret.local.ts` | 실제 토큰·chatId (**gitignore**, 없어도 빌드됨) |
| `src/beta-capture/config.ts` | `parseConfig`(순수) + `loadConfig`(glob로 secret.local 선택 로드) |
| `src/beta-capture/state.ts` | 동의 영속(localStorage, storage 주입 가능) |
| `src/beta-capture/telegram.ts` | `apiUrl`/`methodForMime`(순수) + `sendClip`(multipart 전송) |
| `src/beta-capture/capture.ts` | `pickMime`(순수) + `CaptureLoop`(captureStream+MediaRecorder 클립 루프) |
| `src/beta-capture/consent.ts` | `showConsentModal(): Promise<boolean>` |
| `src/beta-capture/indicator.ts` | `Indicator` 배지 + 중단 버튼 |
| `src/beta-capture/styles.ts` | `injectStyles()` — `.bc-*` 스코프 스타일 주입(앱 styles.css 무관) |
| `src/beta-capture/index.ts` | `mountBetaCapture({ canvas })` — 전체 배선, teardown 반환 |
| `src/beta-capture/*.test.ts` | 순수 헬퍼 단위테스트(config/state/telegram/capture) |
| `src/app/main.ts` | **수정(접점)**: import + `mountBetaCapture({ canvas: glCanvas })` 1줄 |
| `.gitignore` | **수정**: `src/beta-capture/secret.local.ts` 추가 |

**삭제(나중에):** ①`src/beta-capture/` 폴더 삭제 ②`main.ts` 의 import·호출 줄 삭제 ③`.gitignore` 의 secret.local 줄 삭제(선택). 끝.

---

## Task 1: 폴더 스캐폴딩 + gitignore + 삭제 문서

**Files:**
- Create: `src/beta-capture/README.md`
- Create: `src/beta-capture/secret.example.ts`
- Modify: `.gitignore` (끝에 추가)

- [ ] **Step 1: secret.example.ts 작성**

```ts
// 이 파일을 복사해 같은 폴더에 secret.local.ts 로 만들고 값을 채우세요.
// secret.local.ts 는 .gitignore 되어 깃/공개 소스에 올라가지 않습니다.
// (단, 빌드된 .exe 에는 포함됨 — 베타 종료 후 BotFather /revoke 권장)
export const SECRET: { token: string; chatId: string } = {
  token: "",   // 예: "123456789:AAE..."
  chatId: "",  // 예: "7765239300"
};
```

- [ ] **Step 2: README.md 작성(삭제 방법 포함)**

```markdown
# beta-capture (테스트 전용, 삭제 가능 기능)

동의한 테스터의 **보정된 미리보기 화면**을 ~10초 영상 클립으로 텔레그램 봇에 전송해
실기기 보정 적용을 검증한다. 기본 OFF, 명시적 동의 없이는 전송 0.

## 설정
1. `secret.example.ts` 를 `secret.local.ts` 로 복사
2. BotFather 봇 토큰 + chat id 채우기
3. 앱 실행 → 좌하단 "🎥 테스트 캡처" 버튼 → 동의 모달 동의

미설정(secret.local.ts 없음/빈값) 시 버튼이 "미설정"으로 비활성.

## 이 기능 통째로 삭제하기
1. 이 폴더(`src/beta-capture/`) 삭제
2. `src/app/main.ts` 에서 `mountBetaCapture` import 줄과 호출 줄 삭제
3. `.gitignore` 의 `src/beta-capture/secret.local.ts` 줄 삭제(선택)

다른 코드는 이 기능에 의존하지 않는다.
```

- [ ] **Step 3: .gitignore 에 secret 추가**

`.gitignore` 끝에 append:
```
# beta-capture 비밀값(테스트 전용 기능)
src/beta-capture/secret.local.ts
```

- [ ] **Step 4: 커밋**

```bash
git add src/beta-capture/README.md src/beta-capture/secret.example.ts .gitignore
git commit -m "feat(beta-capture): 폴더 스캐폴딩 + 삭제문서 + gitignore"
```

---

## Task 2: config.ts — 설정 파싱/로드

**Files:**
- Create: `src/beta-capture/config.ts`
- Test: `src/beta-capture/config.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("토큰/chatId 둘 다 있어야 설정 반환, 기본 클립10초·15fps", () => {
    const c = parseConfig({ token: "T", chatId: "C" });
    expect(c).toEqual({ token: "T", chatId: "C", clipSeconds: 10, fps: 15 });
  });
  it("토큰 없으면 null", () => {
    expect(parseConfig({ token: "", chatId: "C" })).toBeNull();
  });
  it("chatId 없으면 null", () => {
    expect(parseConfig({ token: "T", chatId: "" })).toBeNull();
  });
  it("undefined 입력도 null(크래시 금지)", () => {
    expect(parseConfig(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/beta-capture/config.test.ts`
Expected: FAIL — "parseConfig is not a function"

- [ ] **Step 3: config.ts 구현**

```ts
export interface TgConfig {
  token: string;
  chatId: string;
  clipSeconds: number;
  fps: number;
}

// 순수: secret 객체 → 검증된 설정 또는 null
export function parseConfig(secret: { token?: string; chatId?: string } | undefined): TgConfig | null {
  const token = secret?.token?.trim();
  const chatId = secret?.chatId?.trim();
  if (!token || !chatId) return null;
  return { token, chatId, clipSeconds: 10, fps: 15 };
}

// secret.local.ts 를 선택적으로 로드(없어도 빌드/실행됨)
export function loadConfig(): TgConfig | null {
  const mods = import.meta.glob<{ SECRET?: { token?: string; chatId?: string } }>(
    "./secret.local.ts",
    { eager: true }
  );
  const mod = Object.values(mods)[0];
  return parseConfig(mod?.SECRET);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/beta-capture/config.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/beta-capture/config.ts src/beta-capture/config.test.ts
git commit -m "feat(beta-capture): config 파싱/로드(선택적 secret)"
```

---

## Task 3: state.ts — 동의 영속

**Files:**
- Create: `src/beta-capture/state.ts`
- Test: `src/beta-capture/state.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { hasConsent, setConsent } from "./state";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("consent state", () => {
  it("기본은 미동의", () => {
    expect(hasConsent(fakeStorage())).toBe(false);
  });
  it("동의 저장 후 true", () => {
    const s = fakeStorage();
    setConsent(true, s);
    expect(hasConsent(s)).toBe(true);
  });
  it("동의 철회 후 false", () => {
    const s = fakeStorage();
    setConsent(true, s);
    setConsent(false, s);
    expect(hasConsent(s)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/beta-capture/state.test.ts`
Expected: FAIL — module/exports 없음

- [ ] **Step 3: state.ts 구현**

```ts
const KEY = "mask.betaCapture.consent.v1";

type Reader = { getItem(k: string): string | null };
type Writer = Reader & { setItem(k: string, v: string): void; removeItem(k: string): void };

export function hasConsent(storage: Reader = localStorage): boolean {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setConsent(v: boolean, storage: Writer = localStorage): void {
  try {
    if (v) storage.setItem(KEY, "1");
    else storage.removeItem(KEY);
  } catch {
    /* 프라이빗 모드 등 무시 */
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/beta-capture/state.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/beta-capture/state.ts src/beta-capture/state.test.ts
git commit -m "feat(beta-capture): 동의 영속(storage 주입)"
```

---

## Task 4: telegram.ts — 전송

**Files:**
- Create: `src/beta-capture/telegram.ts`
- Test: `src/beta-capture/telegram.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect, vi } from "vitest";
import { apiUrl, methodForMime, sendClip } from "./telegram";

describe("telegram helpers", () => {
  it("apiUrl 구성", () => {
    expect(apiUrl("T", "sendVideo")).toBe("https://api.telegram.org/botT/sendVideo");
  });
  it("mp4 → sendVideo, 그 외 → sendDocument", () => {
    expect(methodForMime("video/mp4;codecs=h264")).toBe("sendVideo");
    expect(methodForMime("video/webm;codecs=vp8")).toBe("sendDocument");
  });
  it("sendClip: 올바른 method URL로 POST하고 ok 반환", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" });
    const ok = await sendClip(
      { token: "T", chatId: "C", clipSeconds: 10, fps: 15 },
      blob,
      "video/mp4;codecs=h264",
      "cap",
      fetchImpl
    );
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.telegram.org/botT/sendVideo",
      expect.objectContaining({ method: "POST" })
    );
  });
  it("sendClip: 네트워크 예외면 false(앱 영향 없음)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const blob = new Blob([new Uint8Array([1])], { type: "video/webm" });
    const ok = await sendClip(
      { token: "T", chatId: "C", clipSeconds: 10, fps: 15 },
      blob,
      "video/webm",
      "",
      fetchImpl
    );
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/beta-capture/telegram.test.ts`
Expected: FAIL — exports 없음

- [ ] **Step 3: telegram.ts 구현**

```ts
import type { TgConfig } from "./config";

export function apiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

export function methodForMime(mime: string): "sendVideo" | "sendDocument" {
  return mime.includes("mp4") ? "sendVideo" : "sendDocument";
}

// 클립 한 개 전송. 성공 시 true, 실패/예외 시 false(throw 안 함).
export async function sendClip(
  cfg: TgConfig,
  blob: Blob,
  mime: string,
  caption: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const method = methodForMime(mime);
  const field = method === "sendVideo" ? "video" : "document";
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const form = new FormData();
  form.append("chat_id", cfg.chatId);
  if (caption) form.append("caption", caption);
  form.append(field, blob, `clip.${ext}`);
  try {
    const res = await fetchImpl(apiUrl(cfg.token, method), { method: "POST", body: form });
    return !!res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/beta-capture/telegram.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/beta-capture/telegram.ts src/beta-capture/telegram.test.ts
git commit -m "feat(beta-capture): 텔레그램 클립 전송(mp4→video/그외→document)"
```

---

## Task 5: capture.ts — 클립 캡처 루프

**Files:**
- Create: `src/beta-capture/capture.ts`
- Test: `src/beta-capture/capture.test.ts`

- [ ] **Step 1: 실패 테스트 작성**(순수 `pickMime`만 단위테스트; 루프는 실기기 검증)

```ts
import { describe, it, expect } from "vitest";
import { pickMime } from "./capture";

describe("pickMime", () => {
  it("mp4 지원되면 mp4 선호", () => {
    expect(pickMime((t) => t === "video/mp4;codecs=h264")).toBe("video/mp4;codecs=h264");
  });
  it("mp4 미지원이면 webm/vp8", () => {
    expect(pickMime((t) => t.startsWith("video/webm"))).toBe("video/webm;codecs=vp8");
  });
  it("아무것도 보고 안 되면 video/webm 폴백", () => {
    expect(pickMime(() => false)).toBe("video/webm");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/beta-capture/capture.test.ts`
Expected: FAIL — pickMime 없음

- [ ] **Step 3: capture.ts 구현**

```ts
// 지원되는 첫 코덱 선택(mp4/H.264 우선 → 텔레그램 인라인 재생)
export function pickMime(isSupported: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string {
  const prefs = ["video/mp4;codecs=h264", "video/webm;codecs=vp8", "video/webm"];
  for (const t of prefs) if (isSupported(t)) return t;
  return "video/webm";
}

export type ClipHandler = (blob: Blob, mime: string) => void;

// 캔버스를 clipSeconds 단위 클립으로 반복 인코딩 → onClip 호출.
// 백프레셔: onClip 쪽이 바쁘면(전송 중) 호출자가 클립을 버린다(여기선 항상 emit).
export class CaptureLoop {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private active = false;
  private mime: string;

  constructor(
    private canvas: HTMLCanvasElement,
    private fps: number,
    private clipSeconds: number,
    private onClip: ClipHandler
  ) {
    this.mime = pickMime();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.stream = this.canvas.captureStream(this.fps);
    this.cycle();
  }

  // 한 클립 녹화 → emit → 다음 클립
  private cycle(): void {
    if (!this.active || !this.stream) return;
    const rec = new MediaRecorder(this.stream, { mimeType: this.mime });
    this.rec = rec;
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      if (chunks.length) this.onClip(new Blob(chunks, { type: this.mime }), this.mime);
      this.cycle(); // 다음 클립
    };
    rec.start();
    window.setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
    }, this.clipSeconds * 1000);
  }

  stop(): void {
    this.active = false;
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    this.rec = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/beta-capture/capture.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/beta-capture/capture.ts src/beta-capture/capture.test.ts
git commit -m "feat(beta-capture): 캔버스 클립 캡처 루프(pickMime+MediaRecorder)"
```

---

## Task 6: styles.ts — 스코프 스타일 주입

**Files:**
- Create: `src/beta-capture/styles.ts`

- [ ] **Step 1: styles.ts 구현**(앱 styles.css 무수정, `.bc-*` 클래스만)

```ts
let injected = false;

export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const css = `
.bc-launch{position:fixed;left:12px;bottom:12px;z-index:9998;font:13px/1.2 sans-serif;
  background:#2b2d31;color:#e3e5e8;border:1px solid #3a3d44;border-radius:8px;padding:8px 12px;cursor:pointer}
.bc-launch[disabled]{opacity:.5;cursor:not-allowed}
.bc-launch.on{background:#3182F6;border-color:#3182F6;color:#fff}
.bc-badge{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;
  display:none;align-items:center;gap:10px;font:13px/1.2 sans-serif;
  background:#2b2d31;color:#fff;border:1px solid #d23;border-radius:999px;padding:7px 14px}
.bc-badge.show{display:flex}
.bc-dot{width:9px;height:9px;border-radius:50%;background:#e23;animation:bc-blink 1s infinite}
@keyframes bc-blink{50%{opacity:.25}}
.bc-stop{background:#e23;color:#fff;border:0;border-radius:6px;padding:3px 9px;cursor:pointer;font:12px sans-serif}
.bc-modal-bg{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);
  display:flex;align-items:center;justify-content:center}
.bc-modal{max-width:420px;background:#1e1f22;color:#e3e5e8;border:1px solid #3a3d44;border-radius:12px;
  padding:20px;font:14px/1.5 sans-serif}
.bc-modal h3{margin:0 0 10px;font-size:16px}
.bc-modal ul{margin:10px 0;padding-left:18px}
.bc-row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.bc-btn{border:0;border-radius:8px;padding:9px 14px;cursor:pointer;font:14px sans-serif}
.bc-ok{background:#3182F6;color:#fff}
.bc-no{background:#3a3d44;color:#e3e5e8}`;
  const el = document.createElement("style");
  el.id = "bc-styles";
  el.textContent = css;
  document.head.appendChild(el);
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과(에러 없음)

- [ ] **Step 3: 커밋**

```bash
git add src/beta-capture/styles.ts
git commit -m "feat(beta-capture): 스코프 스타일 주입(.bc-*)"
```

---

## Task 7: consent.ts — 동의 모달

**Files:**
- Create: `src/beta-capture/consent.ts`

- [ ] **Step 1: consent.ts 구현**(명시 문구; 실기기 검증)

```ts
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
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 3: 커밋**

```bash
git add src/beta-capture/consent.ts
git commit -m "feat(beta-capture): 동의 모달(명시 문구)"
```

---

## Task 8: indicator.ts — 전송 중 배지

**Files:**
- Create: `src/beta-capture/indicator.ts`

- [ ] **Step 1: indicator.ts 구현**

```ts
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
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과

- [ ] **Step 3: 커밋**

```bash
git add src/beta-capture/indicator.ts
git commit -m "feat(beta-capture): 전송 중 상시 배지 + 중단 버튼"
```

---

## Task 9: index.ts — 배선 + main.ts 통합

**Files:**
- Create: `src/beta-capture/index.ts`
- Modify: `src/app/main.ts` (import 1줄 + 호출 1줄)

- [ ] **Step 1: index.ts 구현**(토글→동의→캡처→전송, 백프레셔)

```ts
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

// 좌하단 토글 버튼을 주입하고 전체 흐름을 배선. teardown 반환.
export function mountBetaCapture(opts: BetaCaptureOpts): () => void {
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
    return () => btn.remove();
  }

  let loop: CaptureLoop | null = null;
  let indicator: Indicator | null = null;
  let sending = false; // 백프레셔: 전송 중이면 다음 클립 버림

  const stop = (): void => {
    loop?.stop();
    loop = null;
    indicator?.hide();
    btn.classList.remove("on");
    btn.textContent = "🎥 테스트 캡처";
  };

  const start = (): void => {
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

  return () => {
    stop();
    indicator?.destroy();
    btn.remove();
  };
}
```

- [ ] **Step 2: main.ts 에 통합(접점 2줄)**

`src/app/main.ts` 상단 import 블록 끝(line 19 `LandmarkSmoother` import 다음 줄)에 추가:
```ts
import { mountBetaCapture } from "../beta-capture";
```
그리고 overlay 토글 블록 다음(현재 line 73 `syncOverlayToggle();` 아래)에 추가:
```ts
mountBetaCapture({ canvas: glCanvas });
```

- [ ] **Step 3: 타입체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 통과(에러 없음, dist 생성)

- [ ] **Step 4: 커밋**

```bash
git add src/beta-capture/index.ts src/app/main.ts
git commit -m "feat(beta-capture): 배선(토글→동의→캡처→전송) + main 통합"
```

---

## Task 10: 실기기 검증(수동) + CORS 확인

순수 로직 외(캡처·전송·CORS)는 실기기에서만 검증된다. dev 서버 띄우고 Windows Chrome `localhost`.

- [ ] **Step 1: secret.local.ts 생성**

`src/beta-capture/secret.example.ts` 를 `secret.local.ts` 로 복사하고 토큰·chatId 채움.

- [ ] **Step 2: dev 실행 + 콘솔 확인**

Run: `npm run dev -- --host` → Windows Chrome `http://localhost:<port>/`
- 좌하단 "🎥 테스트 캡처" 버튼 보이는지(미설정 아님).

- [ ] **Step 3: 동의 흐름**

버튼 클릭 → 동의 모달 → "동의 안 함" 시 아무 일 없음(전송 0) 확인 → 다시 클릭 → "동의하고 시작" → `🔴 전송 중` 배지 표시.

- [ ] **Step 4: 텔레그램 수신 확인**

~10초 후 텔레그램 채팅에 보정된 화면 영상 클립 도착하는지. **도착 안 하면** 브라우저 콘솔에서 `api.telegram.org` 요청이 **CORS 차단**인지 확인.
- 차단이면(폴백): 전송을 Electron 메인 프로세스로 옮긴다 — `electron/main.cjs` 에 IPC 핸들러 추가해 `sendClip` 을 메인에서 수행(렌더러는 blob을 ArrayBuffer로 IPC 전달). 이 폴백은 `electron/` 을 건드리므로 삭제성 저하 → CORS 통과하면 불필요. (대다수 환경에서 텔레그램 Bot API 는 `Access-Control-Allow-Origin: *` 라 통과 예상.)

- [ ] **Step 5: 중단 + 지속성**

배지의 "중단" 클릭 → 전송 멈춤·배지 사라짐. 새로고침 후 다시 켜면 동의 모달 없이 바로 시작(동의 영속) 확인.

- [ ] **Step 6: 최종 커밋(필요 시 상수 조정)**

클립 길이/fps 등 조정했으면 커밋.
```bash
git add -A && git commit -m "chore(beta-capture): 실기기 검증 반영"
```

---

## 테스트 전략 요약
- **단위테스트(node, 순수):** config 파싱, 동의 영속, telegram 헬퍼/전송(mock fetch), pickMime. → CI/로컬에서 자동.
- **수동(실기기):** captureStream·MediaRecorder·실제 텔레그램 전송·CORS·동의 UI. → DOM/카메라 필요, 헤드리스 불가.

## 리스크
- **CORS**(Task 10-4): 렌더러에서 텔레그램 직접 호출이 막히면 메인 프로세스 폴백 필요(삭제성 약간 저하). 통과 가능성 높음.
- **코덱**: Electron Chromium 이 mp4/H.264 미지원이면 webm 으로 `sendDocument` 전송(인라인 재생 대신 다운로드). 검증으론 무방.
- **토큰 노출**: 빌드 .exe 에 토큰 포함 → 베타 후 `/revoke` 권장(README 명시).
- **레이트리밋**: 테스터 수십 명 동시 전송 시 채팅당 초당 1건 초과 가능 → 현재 소수 베타 전제.
