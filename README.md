# Lpay 주문 앱 — 데모 (토스페이먼츠 테스트 결제 · 서버리스)

QR 테이블 오더 손님앱의 **시연용 버전**이다. 백엔드 없이 브라우저만으로 동작하고, 실제 주문은 들어가지 않는다.

## 달라진 점 (운영 버전 대비)

| 영역 | 운영 | 데모 |
| --- | --- | --- |
| 매장/테이블 | QR URL의 token으로 서버에서 확인 | **매장 하나(라페이 데모 주점)** 고정. 어떤 URL로 들어와도 이 매장으로 연결 |
| 주문 방식 | `/order?token=`(테이블) · `/pickup?token=`(포장) | `/pickup`으로 시작하는 경로 = 포장, 그 외 모든 경로 = 테이블(1번) |
| 메뉴/주문/주문내역/직원호출 | 백엔드 API | `src/lib/endpoints.ts` + `localStorage` (`lpay-demo:db:v1`) |
| 실시간 주문 상태 | STOMP WebSocket | 결제 승인 후 시간 경과로 자동 진행: 접수(8초) → 조리중(25초) → 조리완료(45초) → 서빙/픽업완료 |
| 결제 | 페이앱 | **토스페이먼츠 SDK v2 + 결제 승인 API** (테스트 키 — 실제 청구 없음) |

## 결제 흐름 (토스페이먼츠, [API 레퍼런스](https://docs.tosspayments.com/reference))

```
"결제하기"(장바구니) → 주문 생성(결제대기, localStorage)
  → PayScreen: preparePayment() 로 토스 orderId·금액을 저장
              widgets.setAmount → renderPaymentMethods / renderAgreement (주문서형 결제 UI)
  → "N원 결제하기" → widgets.requestPayment()  → 토스 결제창(테스트)
  → 인증 성공: /{order|pickup}/payment/success?paymentKey&orderId&amount 로 리다이렉트
       → confirmPayment(): 저장해 둔 금액과 대조 → POST https://api.tosspayments.com/v1/payments/confirm
       → 승인(DONE) 시 주문 접수 → 완료 화면
  → 실패/취소: /{order|pickup}/payment/fail?code&message → 결제대기 주문 취소, 장바구니 복귀
```

코드: [`src/lib/toss.ts`](src/lib/toss.ts)(SDK·승인 API), [`src/components/PayScreen.tsx`](src/components/PayScreen.tsx),
[`src/lib/endpoints.ts`](src/lib/endpoints.ts)(`preparePayment`/`confirmPayment`), [`src/session.tsx`](src/session.tsx)(복귀 URL 파싱).

> ⚠️ 서버가 없어서 **결제 승인 API를 브라우저에서 직접 호출**한다(원래는 시크릿 키를 가진 서버가 호출해야 함).
> 그래서 토스 **문서용 공개 테스트 키**만 쓰고, `live_` 키는 코드에서 거부한다. 라이브 결제가 필요하면 반드시 서버를 둬야 한다.
> 내 상점 테스트 키를 쓰려면 `.env.local`에 `VITE_TOSS_CLIENT_KEY=test_gck_…`, `VITE_TOSS_SECRET_KEY=test_gsk_…`
> (주문서형/결제창형 연동 키 쌍)을 넣는다. 테스트 결제 내역은 토스 개발자센터에서 볼 수 있다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173  (아무 경로나 열어도 됨)
npm run build
```

Vercel 등 정적 호스팅에 올릴 때는 모든 경로를 `index.html`로 보내는 SPA rewrite([`vercel.json`](vercel.json))가 필요하다.
결제 복귀 경로(`/order/payment/success` 등)도 같은 rewrite로 처리된다.

데모 데이터 초기화: 브라우저 콘솔에서 `localStorage.clear()`.

> `API_SPEC.md` / `GEARING.md` / `PERF_DIAGNOSIS.md`는 운영 백엔드 연동 시절 문서로, 이 데모 브랜치에서는 더 이상 유효하지 않다.
