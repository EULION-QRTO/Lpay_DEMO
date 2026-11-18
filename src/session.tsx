import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DEMO_STORE_NAME, DEMO_TABLE_NAME } from './lib/demoMenu'

// 데모 앱 — 매장은 하나(DEMO_STORE_NAME)뿐이고, 어떤 URL로 들어와도 이 매장으로 연결된다.
// (원래는 QR URL의 token 으로 매장/테이블을 서버에서 확인했다.)
//   /pickup 으로 시작하는 경로  → 포장(togo) 주문
//   그 외 모든 경로(/, /order, /아무거나 …) → 테이블(DINE_IN) 주문
// 토스 결제창에서 돌아오는 경로는 주문 방식을 경로에 실어 둔다:
//   /order/payment/success, /pickup/payment/fail  (+ 토스가 붙여 주는 쿼리)
// 포장 주문의 전체 전화번호는 이 브라우저(localStorage)에만 보관한다.

export type StoreSession =
  | { storeName: string; mode: 'table'; tableName: string }
  | { storeName: string; mode: 'togo' }

const PHONE_KEY = 'lpay-demo:phone'

// 전화번호에서 숫자만 남긴 뒤 마지막 4자리 (픽업 주문을 구분하는 값).
export function phoneLast4(phone: string): string {
  return phone.replace(/\D/g, '').slice(-4)
}

/** 토스 결제창에서 돌아온 결과 — successUrl / failUrl 의 쿼리 파라미터. */
export type PaymentReturn =
  | { result: 'success'; paymentKey: string; orderId: string; amount: number }
  | { result: 'fail'; code: string; message: string; orderId: string | null }

type Entry = { mode: 'table' | 'togo'; paymentReturn: PaymentReturn | null }

// 현재 URL에서 주문 방식과 (있다면) 결제 결과를 읽는다.
export function parseEntry(loc: Location = window.location): Entry {
  const path = loc.pathname
  const mode = path.startsWith('/pickup') ? 'togo' : 'table'
  const q = new URLSearchParams(loc.search)

  let paymentReturn: PaymentReturn | null = null
  if (path.endsWith('/payment/success')) {
    const paymentKey = q.get('paymentKey')
    const orderId = q.get('orderId')
    const amount = Number(q.get('amount'))
    paymentReturn =
      paymentKey && orderId && Number.isFinite(amount)
        ? { result: 'success', paymentKey, orderId, amount }
        : { result: 'fail', code: 'INVALID_RETURN', message: '결제 결과를 확인할 수 없어요.', orderId: null }
  } else if (path.endsWith('/payment/fail')) {
    paymentReturn = {
      result: 'fail',
      code: q.get('code') ?? 'UNKNOWN',
      message: q.get('message') ?? '결제에 실패했어요.',
      orderId: q.get('orderId'),
    }
  }
  return { mode, paymentReturn }
}

/** 결제 복귀 처리가 끝나면 주소를 깔끔한 경로(/order, /pickup)로 되돌린다 — 새로고침 시 중복 승인 방지. */
export function cleanUrlAfterPayment(mode: 'table' | 'togo'): void {
  try {
    window.history.replaceState(null, '', mode === 'togo' ? '/pickup' : '/order')
  } catch {
    /* noop */
  }
}

/** 토스 successUrl / failUrl — 주문 방식을 경로에 실어 보낸다. */
export function paymentReturnUrls(mode: 'table' | 'togo'): { successUrl: string; failUrl: string } {
  const base = `${window.location.origin}${mode === 'togo' ? '/pickup' : '/order'}/payment`
  return { successUrl: `${base}/success`, failUrl: `${base}/fail` }
}

function readStoredPhone(): string {
  try {
    return localStorage.getItem(PHONE_KEY) ?? ''
  } catch {
    return ''
  }
}

type SessionContextValue = {
  session: StoreSession
  // 픽업 주문에서 손님이 입력한 "전체" 전화번호(숫자만). 테이블 주문/입력 전에는 빈 문자열.
  phone: string
  setPhone: (phone: string) => void
  // 헤더에 표시할 위치/주문 방식 라벨.
  locationLabel: string
  // 토스 결제창에서 돌아온 경우의 결과(URL). 아니면 null.
  paymentReturn: PaymentReturn | null
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const entry = useMemo(() => parseEntry(), [])
  const [phone, setPhoneState] = useState(() => (entry.mode === 'togo' ? readStoredPhone() : ''))

  const setPhone = useCallback((full: string) => {
    setPhoneState(full)
    try {
      localStorage.setItem(PHONE_KEY, full)
    } catch {
      /* 저장 실패는 무시 — 이번 세션 동안 상태(phone)로 계속 사용 가능 */
    }
  }, [])

  const value = useMemo<SessionContextValue>(() => {
    const session: StoreSession =
      entry.mode === 'table'
        ? { mode: 'table', storeName: DEMO_STORE_NAME, tableName: DEMO_TABLE_NAME }
        : { mode: 'togo', storeName: DEMO_STORE_NAME }
    const locationLabel =
      session.mode === 'table'
        ? `홀 ${session.tableName} 테이블`
        : `${phone ? phoneLast4(phone) : 'NULL'}-픽업`
    return { session, phone, setPhone, locationLabel, paymentReturn: entry.paymentReturn }
  }, [entry, phone, setPhone])

  // 탭 제목을 "Lpay · {매장명}"으로.
  useEffect(() => {
    document.title = `Lpay · ${DEMO_STORE_NAME}`
  }, [])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>')
  return ctx
}
