// 토스페이먼츠 연동 — 공식 문서(https://docs.tosspayments.com/reference) 기준.
//
//  · 결제 UI/요청  : JavaScript SDK v2 (@tosspayments/tosspayments-sdk) 주문서형 결제
//                    widgets().setAmount → renderPaymentMethods/renderAgreement → requestPayment
//                    (결제 인증이 끝나면 successUrl / failUrl 로 리다이렉트된다)
//  · 결제 승인     : POST https://api.tosspayments.com/v1/payments/confirm
//
// ⚠️ 데모 전용 구성이다. 클라이언트 키(test_gck_…)와 시크릿 키(test_gsk_…)는 토스 문서에 공개된 "문서용
// 테스트 키"이고, 테스트 키로는 카드가 실제로 청구되지 않는다(가상 승인). 원래 결제 승인은 시크릿 키를 가진
// 서버가 호출해야 하지만 이 데모는 서버가 없어서 브라우저에서 직접 호출한다 — 그래서 라이브 키(live_…)는
// 절대 쓰지 않도록 아래에서 막아둔다. 내 상점 테스트 키를 쓰려면 .env.local 에
//   VITE_TOSS_CLIENT_KEY=test_gck_...   VITE_TOSS_SECRET_KEY=test_gsk_...
// (주문서형/결제창형 연동 키 쌍)을 넣으면 된다.
import { loadTossPayments, ANONYMOUS, type TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk'
import { ApiError } from './api'

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

const CLIENT_KEY = env.VITE_TOSS_CLIENT_KEY ?? 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm'
const SECRET_KEY = env.VITE_TOSS_SECRET_KEY ?? 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6'

function assertTestKeys() {
  if (!CLIENT_KEY.startsWith('test_') || !SECRET_KEY.startsWith('test_')) {
    throw new ApiError('LIVE_KEY_FORBIDDEN', '데모에서는 토스 테스트 키(test_…)만 사용할 수 있어요.')
  }
}

const CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm'

/** 결제 승인 API 응답(Payment 객체) 중 데모가 쓰는 필드. */
export interface TossPayment {
  paymentKey: string
  orderId: string
  orderName: string
  status: string // DONE 이면 승인 완료
  method: string | null // 카드 / 간편결제 / 계좌이체 ...
  totalAmount: number
  approvedAt: string | null
  receipt?: { url: string } | null
  card?: { number?: string; issuerCode?: string } | null
  easyPay?: { provider?: string } | null
}

export interface ConfirmParams {
  paymentKey: string
  orderId: string
  amount: number
}

// 같은 paymentKey 에 대한 승인 요청이 동시에 두 번 나가지 않게 한다(React StrictMode 의 effect 이중 실행 등).
const confirmInFlight = new Map<string, Promise<TossPayment>>()

/** 결제 승인 — POST /v1/payments/confirm. 인증: Basic base64("{secretKey}:") */
export function confirmTossPayment(params: ConfirmParams): Promise<TossPayment> {
  assertTestKeys()
  let p = confirmInFlight.get(params.paymentKey)
  if (!p) {
    p = (async () => {
      let res: Response
      try {
        res = await fetch(CONFIRM_URL, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${SECRET_KEY}:`)}`,
            'Content-Type': 'application/json',
            // 재시도/중복 호출에도 같은 결과를 돌려받도록 — 문서: Idempotency-Key (최대 300자, 15일 유효)
            'Idempotency-Key': params.paymentKey,
          },
          body: JSON.stringify(params),
        })
      } catch {
        throw new ApiError('NETWORK', '토스페이먼츠 서버에 연결할 수 없어요.')
      }
      const json = (await res.json().catch(() => null)) as
        | (Partial<TossPayment> & { code?: string; message?: string })
        | null
      if (!res.ok || !json || json.code) {
        throw new ApiError(json?.code ?? String(res.status), json?.message ?? '결제 승인에 실패했어요.', res.status)
      }
      return json as TossPayment
    })()
    confirmInFlight.set(params.paymentKey, p)
    p.catch(() => confirmInFlight.delete(params.paymentKey))
  }
  return p
}

/** 주문서형 결제 위젯 인스턴스 — 비회원(ANONYMOUS) 결제. */
export async function loadWidgets(): Promise<TossPaymentsWidgets> {
  assertTestKeys()
  const tossPayments = await loadTossPayments(CLIENT_KEY)
  return tossPayments.widgets({ customerKey: ANONYMOUS })
}

/** 결제 요청 전에 쓰는 주문번호 — 문서 규칙: 6~64자, 영문 대소문자·숫자·-_= */
export function newTossOrderId(): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 16)
  return `lpay-${Date.now().toString(36)}-${rand}`
}
