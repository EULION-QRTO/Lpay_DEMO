// 데모 "DB" — 백엔드 대신 브라우저 localStorage 에 주문/직원호출을 저장한다.
// (결제창으로 페이지가 이동했다 돌아와도 주문이 남아 있어야 하므로 메모리 상태로는 부족하다.)
// localStorage 를 못 쓰는 환경(사생활 보호 모드 등)에서는 이번 탭 메모리로만 동작한다.
import type { OrderItemResponse, OrderType, StaffCallResponse } from './dto'

export interface PaymentSummary {
  paymentKey: string
  method: string | null
  approvedAt: string | null
  receiptUrl: string | null
}

export interface OrderRecord {
  id: number
  orderType: OrderType
  tableName: string | null
  /** 전체 번호(숫자만) — 손님에게는 마스킹해서 내려준다 */
  phone: string | null
  items: OrderItemResponse[]
  totalPrice: number
  createdAt: string
  /** 결제 승인 시각(ms) — null 이면 아직 결제대기. 이 시각 기준으로 조리 단계가 자동 진행된다. */
  paidAt: number | null
  canceled: boolean
  /** 토스에 넘긴 주문번호(orderId). 결제 요청 직전에 발급·저장한다. */
  tossOrderId: string | null
  payment: PaymentSummary | null
}

export interface DemoDb {
  nextOrderId: number
  orders: OrderRecord[]
  staffCalls: StaffCallResponse[]
}

const KEY = 'lpay-demo:db:v1'
let memory: DemoDb | null = null

const empty = (): DemoDb => ({ nextOrderId: 1001, orders: [], staffCalls: [] })

export function readDb(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DemoDb
    return memory ?? empty()
  } catch {
    return memory ?? empty()
  }
}

export function writeDb(db: DemoDb): void {
  memory = db
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* 저장 실패 — 메모리 사본으로 계속 동작 */
  }
}

/** 데모 데이터 초기화(주문내역 비우기). */
export function resetDemo(): void {
  memory = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
