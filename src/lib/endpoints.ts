// 데모 "백엔드" — 원래 QRTO-API 손님 도메인(`/api/customer/**`)을 호출하던 함수들을, 같은 이름/모양으로
// 브라우저 안(localStorage)에서 처리하도록 바꿨다. 서버 호출은 없고 "토스 결제 승인 API" 한 곳만 진짜로 호출한다
// (결제 승인은 ./toss.ts — 테스트 키라 실제 청구는 없다).
//
// 주문 흐름:  createOrder(결제대기) → preparePayment(토스 orderId·금액 저장) → 토스 결제창 → confirmPayment(승인)
//            → 주문 접수(RECEIVED). 이후 조리중 → 조리완료 → 서빙/픽업은 시간이 지나며 자동으로 진행된다.
import { ApiError } from './api'
import { confirmTossPayment, newTossOrderId } from './toss'
import { readDb, writeDb, type OrderRecord } from './demoDb'
import { DEMO_MENU_BOARD, DEMO_TABLE_NAME, findMenu } from './demoMenu'
import type {
  CreateOrderRequest,
  MenuBoardResponse,
  OrderResponse,
  OrderStatus,
  StaffCallResponse,
} from './dto'

/** 결제 승인 후 단계별 진행 시간(데모 시연용으로 짧게). 단위: 초 */
const STAGES: { until: number; status: OrderStatus }[] = [
  { until: 8, status: 'RECEIVED' },
  { until: 25, status: 'PREPARING' },
  { until: 45, status: 'COOKED' },
]

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: '결제대기',
  RECEIVED: '주문접수',
  PREPARING: '조리중',
  COOKED: '조리완료',
  SERVED: '서빙완료',
  PICKED_UP: '픽업완료',
  CANCELED: '주문취소',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** 서버 왕복처럼 보이게 하는 아주 짧은 지연 */
const latency = () => sleep(120)

function statusOf(rec: OrderRecord, now = Date.now()): OrderStatus {
  if (rec.canceled) return 'CANCELED'
  if (rec.paidAt == null) return 'PENDING_PAYMENT'
  const elapsed = (now - rec.paidAt) / 1000
  for (const s of STAGES) if (elapsed < s.until) return s.status
  return rec.orderType === 'DINE_IN' ? 'SERVED' : 'PICKED_UP'
}

const last4 = (phone: string) => phone.slice(-4)

function toResponse(rec: OrderRecord, now = Date.now()): OrderResponse {
  const status = statusOf(rec, now)
  return {
    id: rec.id,
    storeId: 1,
    orderType: rec.orderType,
    orderTypeLabel: rec.orderType === 'DINE_IN' ? '매장' : '포장',
    tableId: rec.orderType === 'DINE_IN' ? 1 : null,
    tableName: rec.tableName,
    phoneNumber: rec.phone ? `010-****-${last4(rec.phone)}` : null,
    pickupNo: rec.phone ? last4(rec.phone) : null,
    status,
    statusLabel: STATUS_LABEL[status],
    totalPrice: rec.totalPrice,
    items: rec.items,
    createdAt: rec.createdAt,
  }
}

function mutate<T>(fn: (orders: OrderRecord[], db: ReturnType<typeof readDb>) => T): T {
  const db = readDb()
  const result = fn(db.orders, db)
  writeDb(db)
  return result
}

function requireOrder(orders: OrderRecord[], id: number): OrderRecord {
  const rec = orders.find((o) => o.id === id)
  if (!rec) throw new ApiError('NOT_FOUND_ORDER', '주문을 찾을 수 없어요.', 404)
  return rec
}

/** 로컬 시각 ISO(오프셋 없음) — HistoryScreen 의 시각 표시 파서와 맞춘다. */
function localIso(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

/** 손님 메뉴판 */
export const menuBoard = async (): Promise<MenuBoardResponse> => {
  await latency()
  return DEMO_MENU_BOARD
}

/** 주문 생성 — 합계가 0원이면 결제 없이 바로 접수된다. */
export const createOrder = async (req: CreateOrderRequest): Promise<OrderResponse> => {
  await latency()
  if (req.orderType === 'TAKEOUT' && !/^\d{10,11}$/.test(req.phoneNumber ?? '')) {
    throw new ApiError('INVALID_PHONE', '전화번호를 확인해 주세요.', 400)
  }
  if (req.items.length < 1 || req.items.length > 50) {
    throw new ApiError('INVALID_ITEMS', '주문 항목을 확인해 주세요.', 400)
  }
  const items = req.items.map(({ menuId, quantity }) => {
    const m = findMenu(menuId)
    if (!m) throw new ApiError('NOT_FOUND_MENU', '존재하지 않는 메뉴가 있어요.', 404)
    if (m.soldOut) throw new ApiError('SOLD_OUT', `${m.name}은(는) 품절이에요.`, 409)
    if (!Number.isInteger(quantity) || quantity < 1) throw new ApiError('INVALID_QUANTITY', '수량을 확인해 주세요.', 400)
    return { menuId, menuName: m.name, unitPrice: m.price, quantity, lineTotal: m.price * quantity }
  })
  const totalPrice = items.reduce((s, i) => s + i.lineTotal, 0)

  return mutate((orders, db) => {
    const rec: OrderRecord = {
      id: db.nextOrderId++,
      orderType: req.orderType,
      tableName: req.orderType === 'DINE_IN' ? DEMO_TABLE_NAME : null,
      phone: req.orderType === 'TAKEOUT' ? (req.phoneNumber ?? null) : null,
      items,
      totalPrice,
      createdAt: localIso(),
      paidAt: totalPrice === 0 ? Date.now() : null,
      canceled: false,
      tossOrderId: null,
      payment: null,
    }
    orders.push(rec)
    return toResponse(rec)
  })
}

/** 주문 단건 */
export const getOrder = async (orderId: number): Promise<OrderResponse> => {
  await latency()
  return toResponse(requireOrder(readDb().orders, orderId))
}

/** 동기 조회 — 실시간 구독(realtime.ts)이 폴링할 때 쓴다. 없으면 null. */
export const peekOrder = (orderId: number): OrderResponse | null => {
  const rec = readDb().orders.find((o) => o.id === orderId)
  return rec ? toResponse(rec) : null
}

// 결제를 거친(승인된) 주문만 내역에 보인다 — 결제 전에 취소/이탈한 주문은 숨긴다. 최신순.
const visibleOrders = (pred: (o: OrderRecord) => boolean): OrderResponse[] => {
  const now = Date.now()
  return readDb()
    .orders.filter((o) => o.paidAt != null && pred(o))
    .sort((a, b) => b.id - a.id)
    .map((o) => toResponse(o, now))
}

/** 테이블 주문 내역 */
export const ordersByTable = async (): Promise<OrderResponse[]> => {
  await latency()
  return visibleOrders((o) => o.orderType === 'DINE_IN')
}

/** 픽업 주문 내역(전화번호 기준) */
export const ordersByPhone = async (phoneNumber: string): Promise<OrderResponse[]> => {
  await latency()
  return visibleOrders((o) => o.orderType === 'TAKEOUT' && o.phone === phoneNumber)
}

/** 주문 취소 — 결제대기 상태에서만 가능. */
export const cancelOrder = async (orderId: number): Promise<OrderResponse> => {
  await latency()
  return mutate((orders) => {
    const rec = requireOrder(orders, orderId)
    if (rec.paidAt != null) throw new ApiError('ALREADY_PAID', '이미 결제된 주문은 취소할 수 없어요.', 409)
    rec.canceled = true
    return toResponse(rec)
  })
}

/** 결제 전에 취소하지 못한 채 남은 결제대기 주문을 모두 취소한다(결제 실패/중단 후 정리용). */
export const cancelPendingOrders = (tossOrderId?: string | null): void => {
  mutate((orders) => {
    for (const o of orders) {
      if (o.paidAt != null || o.canceled) continue
      if (tossOrderId && o.tossOrderId && o.tossOrderId !== tossOrderId) continue
      o.canceled = true
    }
  })
}

/** 직원 호출 */
export const callStaff = async (): Promise<StaffCallResponse> => {
  await latency()
  return mutate((_orders, db) => {
    const call: StaffCallResponse = {
      id: db.staffCalls.length + 1,
      storeId: 1,
      tableId: 1,
      status: 'CALLED',
      createdAt: localIso(),
    }
    db.staffCalls.push(call)
    return call
  })
}

export interface PreparedPayment {
  /** 토스에 넘길 orderId (6~64자) */
  orderId: string
  amount: number
  orderName: string
}

/**
 * 결제 준비 — 토스 문서의 "결제를 요청하기 전에 orderId와 amount를 서버에 저장" 단계.
 * 승인 단계(confirmPayment)에서 successUrl 로 돌아온 금액과 저장해 둔 금액을 대조한다. 멱등.
 */
export const preparePayment = async (orderId: number): Promise<PreparedPayment> => {
  await latency()
  return mutate((orders) => {
    const rec = requireOrder(orders, orderId)
    if (rec.canceled) throw new ApiError('ORDER_CANCELED', '취소된 주문이에요.', 409)
    if (rec.paidAt != null) throw new ApiError('ALREADY_PAID', '이미 결제된 주문이에요.', 409)
    rec.tossOrderId ??= newTossOrderId()
    const first = rec.items[0].menuName
    const orderName = rec.items.length > 1 ? `${first} 외 ${rec.items.length - 1}건` : first
    return { orderId: rec.tossOrderId, amount: rec.totalPrice, orderName }
  })
}

/**
 * 결제 승인 — 토스 successUrl 로 돌아온 { paymentKey, orderId, amount } 를 검증하고
 * 토스 결제 승인 API(POST /v1/payments/confirm)를 호출한 뒤, 성공하면 주문을 접수 처리한다. 멱등.
 */
export const confirmPayment = async (p: {
  paymentKey: string
  orderId: string
  amount: number
}): Promise<OrderResponse> => {
  const found = readDb().orders.find((o) => o.tossOrderId === p.orderId)
  if (!found) throw new ApiError('NOT_FOUND_ORDER', '결제한 주문을 찾을 수 없어요.', 404)
  if (found.paidAt != null) return toResponse(found) // 새로고침 등으로 이미 처리됨
  if (found.canceled) throw new ApiError('ORDER_CANCELED', '취소된 주문이에요.', 409)
  // 결제 금액 위변조 방지 — 결제 요청 때 저장해 둔 금액과 다르면 승인하지 않는다.
  if (found.totalPrice !== p.amount) {
    throw new ApiError('AMOUNT_MISMATCH', '결제 금액이 주문 금액과 달라요.', 400)
  }

  const payment = await confirmTossPayment(p)
  if (payment.status !== 'DONE') {
    throw new ApiError('NOT_DONE', `결제가 완료되지 않았어요. (${payment.status})`, 409)
  }

  return mutate((orders) => {
    const rec = requireOrder(orders, found.id)
    rec.paidAt ??= Date.now()
    rec.payment = {
      paymentKey: payment.paymentKey,
      method: payment.method,
      approvedAt: payment.approvedAt,
      receiptUrl: payment.receipt?.url ?? null,
    }
    return toResponse(rec)
  })
}
