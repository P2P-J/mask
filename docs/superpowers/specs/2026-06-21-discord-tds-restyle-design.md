# Discord + TDS 컴포넌트 재스타일링 설계

작성일: 2026-06-21

## 목표

현재 화면의 **레이아웃·위치·DOM 구조는 그대로 두고**, 컴포넌트의 비주얼만
Discord 다크 무드 + Toss Design System(TDS) 컴포넌트 관례로 재스타일링한다.

- 톤: **다크 서피스 + Toss blue(#3182F6) 강조**
- 작업 범위: CSS 위주 (`src/styles.css`). 필요 시 `index.html`에 클래스 미세 추가.
- 동적 렌더 파일(`src/ui/*.ts`)은 기존 클래스명을 그대로 사용 → 거의 손대지 않음.

## 비목표 (명시적 제외)

- 레이아웃/패널 배치/스플리터 동작 변경 없음
- 새 컴포넌트·기능 추가 없음
- 라이트 모드 토글 등 테마 전환 기능 없음

## 디자인 토큰 (`:root` 교체)

```
--bg:            #1e1f22   /* 앱 최하단 배경 */
--surface:       #2b2d31   /* 도크/패널 */
--surface-2:     #313338   /* 입력·행·스테이지 크롬 */
--surface-3:     #383a40   /* hover */
--accent:        #3182F6   /* 강조 (Toss blue) */
--accent-hover:  #1b64da
--accent-press:  #1957c2
--accent-soft:   rgba(49,130,246,.15)   /* 선택 배경/포커스 링 */
--text-strong:   #f2f3f5
--text:          #b5bac1
--text-muted:    #80848e
--border:        #232428
--divider:       #3f4147
--radius-sm:     8px
--radius-md:     12px
--radius-lg:     16px
--shadow:        0 8px 24px rgba(0,0,0,.32)
--track:         var(--surface-3)
```

기존 토큰명(`--primary`, `--secondary`, `--panel`, `--rail` 등)은 styles.css 내부
및 일부 .ts 에서 참조될 수 있으므로, **기존 변수명을 새 값으로 매핑**하여 깨짐을
방지한다(예: `--primary: var(--accent)`). 사용처를 grep으로 확인 후 정리한다.

## 컴포넌트별 스펙

| 컴포넌트 | 클래스 | 변경 내용 |
|---|---|---|
| 상단바 | `#topbar` | `--surface` 배경, 하단 `--divider` 경계 |
| 브랜드 dot | `.brand .dot` | 색상 → `--accent` |
| 셀렉트 | `.tds-select` | Toss 필드형: `--bg` 채움, 8px, 밝은 글자, 셰브론 밝게, hover lighten, `:focus-visible` 블루 링 |
| 토글버튼 | `.tds-toggle-btn` | secondary: `--surface-2`, hover `--surface-3` |
| 스테이지 | `#stage` `#gl-canvas` | 배경 `--bg`, 캔버스 그림자 다크 |
| 라이브 뱃지 | `.live-badge` | 반투명 다크 pill, 밝은 글자, dot 유지(라이브=레드 허용) |
| 진단 패널 | `#diagnostics` | `--surface` 배경, `--border` 경계 |
| 스플리터 | `.h-splitter`/`.v-splitter` | `--divider` 배경, hover `--accent` |
| 도크 헤더 | `.dock > header` | 작은 대문자/볼드 muted 라벨, `--surface` 배경, `＋` 블루 |
| 리스트 행 | `.row` `.scene-row` | hover `--surface-3`; **선택 = `--accent-soft` 배경 + 좌측 블루 바 + 강조 텍스트**; eye 아이콘 블루 |
| 슬라이더 | `input[type=range]` | `accent-color: var(--accent)` + 커스텀 썸 폴백(블루), 트랙 `--surface-3` |
| 슬라이더 라벨 | `.slider-row .label b` | 값 강조색 → `--accent` |
| 컬러 행 | `.color-row` | 다크 글자, 컬러 인풋 테두리 `--border` |
| CTA primary | `.cta.primary` | 블루 솔리드·흰글자·볼드·`--radius-md`·hover `--accent-hover`·press 살짝 축소 |
| CTA ghost | `.cta.ghost` | `--surface-2` 배경, 밝은 글자, hover `--surface-3` |
| CTA active | `.cta.active` | `--accent-soft` 배경 + 블루 글자 |
| 토스트 | `#toast` | 다크 elevated pill, 밝은 글자 |
| 이름변경 인풋 | `.scene-rename` | `--bg` 채움, `--accent` 테두리 |

## 접근성 / 인터랙션 (TDS 관례)

- 모든 인터랙티브 요소(버튼/셀렉트/행/슬라이더)에 `:focus-visible` 블루 링
  (`box-shadow: 0 0 0 3px var(--accent-soft)` 또는 outline).
- 버튼 press 시 미세 스케일(`transform: scale(.98)`)로 토스식 탭 피드백.
- hover/active/disabled 상태를 토큰 기반으로 일관 적용.

## 검증

- `npm run dev` 로 앱 실행 후 각 패널(장면/레이어/편집/제어)에서 컴포넌트 상태
  (기본/hover/선택/포커스/disabled)를 육안 확인.
- 기존 토큰명 참조가 남아 색이 깨지는 곳이 없는지 grep + 실행 확인.
- 레이아웃/위치/스플리터 동작이 이전과 동일한지 확인.
