# MyLetter 💌

친구에게 직접 꾸민 편지를 보내는 감성 웹서비스. **Cloudflare Workers + D1 + R2 + Static Assets** 기반으로 실행됩니다.

## 기능 (v0.1)
- 편지 쓰기 → 글꼴·종이 선택 → 배경/이미지 스티커 꾸미기 → 옵션 → 발급
- 고유 공유 URL, 발신자 표시, 종이 질감 및 씰링 없는 편지봉투 애니메이션
- 배경 사진 가운데 기준 cover, 반투명 가독성 안내판
- 비밀번호 보호(PBKDF2), 공개 날짜 예약, 열람 후 공유 메모지 답장
- 손글씨형 포스트잇 작성·드래그·자동 저장, 답장은 권한 있는 모두가 읽기 가능
- PC/모바일 대응, 작성 도중 임시 저장(텍스트 및 설정)
- 올린 이미지는 비공개 R2에 저장하며 권한을 확인한 Worker를 거쳐 제공

## 배포 방법
1. Node.js 20 이상 설치 후 `npm install`, `npx wrangler login`
2. `npx wrangler d1 create myletter-db` 를 실행합니다. 출력된 **database_id**를 `wrangler.jsonc`의 `database_id`에 대입합니다.
3. `npx wrangler r2 bucket create myletter-assets` 를 실행합니다. 버킷명은 `wrangler.jsonc`의 `bucket_name`과 같아야 합니다.
4. `npx wrangler d1 migrations apply myletter-db --remote` (최초 1회 DB 테이블 생성)
5. `npm run deploy` 실행. 발급된 **workers.dev 주소** 또는 연결한 사용자 도메인에서 실행됩니다.

로컬 개발: `npx wrangler d1 migrations apply myletter-db --local` 뒤 `npm run dev`.
Cloudflare 계정 연결 및 D1/R2 생성은 저장소에 코드 추가만으로 자동 처리되지 않습니다.

## 글꼴
Pretendard와 Wanted Sans는 공개 웹폰트 CSS를 사용합니다. 홍국생명 이서윤체, AI올컷 히피체, 교보 손글씨 2025 이유빈은 배포 라이선스 및 실제 파일 제공 범위를 확인하여 **각자 적법하게 확보한 웹폰트 파일을** `public/fonts/`에 넣으면 사용됩니다. 파일 경로는 `public/style.css`의 @font-face를 참조하세요. 파일이 없을 경우 대체 글꼴로 표시되며, 글꼴의 실제 디자인을 보장하지 않습니다. **특히 교보서체는 임베딩·재배포 조건을 확인하고 허가 없는 번들을 추가하지 마세요.**

## 보안 설계
- 보안이 설정된 편지는 서버에서 열람 및 이미지 접근 검증. 비밀번호 해시만 저장하며 제한된 잠금 해제 시도.
- 발급 즉시 반환되는 관리 토큰은 원문 저장 안 함. 관리 링크 노출 주의.
- 포스트잇은 누구나 읽되, 작성자 브라우저가 보유한 권한 토큰이 있어야 위치를 수정할 수 있음.
- 고유 링크 보유자는 내용을 볼 수 있으므로 민감한 정보는 넣지 않는 것을 권장.

## 파일 구조
- `src/worker.js` API 서버 / D1 / R2 연동
- `public/index.html`, `public/app.js`, `public/style.css` 웹앱
- `migrations/0001_init.sql` 데이터베이스 초기화
- `wrangler.jsonc` Worker 설정

## 다음 개선 후보
실시간 협업(WebSocket), 답장 신고/삭제/관리, 별도 계정, 정밀한 모바일 제스처, 이미지 편집 도구, 수신자가 메모를 관리할 수 있는 복구 계정.
