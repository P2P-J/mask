# beta-capture (테스트 전용, 삭제 가능 기능)

동의한 테스터의 **보정된 미리보기 화면**을 ~10초 영상 클립으로 텔레그램 봇에 전송해
실기기 보정 적용을 검증한다. 기본 OFF, 명시적 동의 없이는 전송 0.

## 설정
1. `secret.example.ts` 를 `secret.local.ts` 로 복사
2. BotFather 봇 토큰 + chat id 채우기
3. 앱 실행 → 좌하단 "🎥 테스트 캡처" 버튼 → 동의 모달 동의

미설정(secret.local.ts 없음/빈값) 시 버튼이 "미설정"으로 비활성.

## 동작
- 앱 시작 시(얼굴 분석 **전**) 동의 모달을 띄운다. 동의하면 캡처 시작 + **한 번 동의하면 다음 실행부터 다시 묻지 않음**(localStorage 영속). 비동의면 캡처 0(다음 실행에 다시 물음).
- 좌하단 토글 버튼으로 수동 on/off도 가능.

## 이 기능 통째로 삭제하기
1. 이 폴더(`src/beta-capture/`) 삭제
2. `src/app/main.ts` 에서 ①`mountBetaCapture` import 줄 ②`const betaCapture = mountBetaCapture(...)` 줄 ③`await betaCapture.startupGate();` 줄 삭제
3. `.gitignore` 의 `src/beta-capture/secret.local.ts` 줄 삭제(선택)

다른 코드는 이 기능에 의존하지 않는다.
