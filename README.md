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

## 배포 방법 (Cloudflare GitHub 자동 배포)

**D1 ID 자리표시자 문제(10021)를 수정했습니다.** Wrangler 4.45+는 D1과 R2에 리소스 ID가 없으면 자동 프로비저닝을 시도합니다.

1. Cloudflare Workers & Pages → Worker의 **Build/Deploy 설정**에서 연결된 GitHub 저장소 `Tdotcoperation/myletter` 및 `main` 브랜치를 확인합니다.
2. 배포 명령어는 기존처럼 `npx wrangler deploy`를 사용합니다. 빌드 명령어는 따로 필요하지 않습니다.
3. GitHub 코드 수정으로 새 배포가 시작됩니다. 첫 배포에서는 Wrangler가 D1 데이터베이스를 생성하고 R2 버킷을 연결할 수 있습니다.
4. 첫 API 요청 시 Worker가 `letters`, `assets`, `stickers`, `replies`, 보안 관련 테이블을 자동으로 생성합니다. DB 초기화가 확인되면 편지를 작성해 발급해 보세요.
5. Cloudflare에서 생성한 `workers.dev` URL 또는 연결한 사용자 도메인으로 접속합니다.

참고: Cloudflare 계정 정책이나 기존에 생성된 리소스와의 연결 상태에 따라 수동 조치가 필요할 수 있습니다. 자동 프로비저닝은 Cloudflare의 베타 기능입니다. 동일한 D1이 이미 있다면 Cloudflare 대시보드에서 **실제 UUID**를 확인해 `wrangler.jsonc`의 `database_id`에 넣는 수동 방식도 가능합니다. 임의의 ID를 적으면 다시 10021 오류가 납니다.

로컬 개발: `npm install`, `npx wrangler login`, `npm run dev`를 실행합니다. 테스트는 `npm run check`로 할 수 있습니다.

수동 D1 마이그레이션을 수행하려면 Cloudflare에서 실제 DB ID를 확인해 Wrangler 설정에 입력한 뒤 `npx wrangler d1 migrations apply myletter-db --remote`를 사용합니다. 자동 생성된 스키마는 `CREATE TABLE IF NOT EXISTS`를 사용하므로 기존 데이터는 유지됩니다.

## 글꼴
Pretendard, Wanted Sans, 흥국생명 이서윤체, AI올컷 히피체는 공개 웹폰트 CDN으로 적용합니다(외부 네트워크가 필요합니다). 교보 손글씨 2025 이유빈은 공식 서체의 임베딩·재배포 제한을 확인해야 하므로 이 저장소에 파일을 포함하지 않습니다. 적법한 웹 임베딩 권한을 확보한 경우 `public/fonts/kyobo-yubin.woff2`를 직접 배치해 적용하세요. 허가되지 않은 폰트 변환이나 재배포는 하지 마세요. 파일이 없으면 손글씨 대체 폰트로 표시됩니다.

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
