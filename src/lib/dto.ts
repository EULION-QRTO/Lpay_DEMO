// 데모용 데이터 모델 — 원래 백엔드(QRTO-API) 손님 도메인 DTO 모양을 그대로 유지한다.
// 서버가 없으므로 이 값들은 src/lib/demoServer.ts 가 localStorage 위에서 만들어 준다.

/** 메뉴 단건 */
export interface MenuResponse {
  id: number
  storeId: number
  categoryId: number
  name: string
  price: number
  description: string | null
  imageUrl: string | null
  soldOut: boolean
  createdAt: string
  updatedAt: string
}

/** GET /api/customer/menu-board?token= — 카테고리별 그룹 */
export interface MenuBoardResponse {
  categories: {
    categoryId: number
    categoryName: string
    sortOrder: number
    menus: MenuResponse[]
  }[]
}

/* ── 주문 ── */
export type OrderType = 'DINE_IN' | 'TAKEOUT'
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'RECEIVED'
  | 'PREPARING'
  | 'COOKED'
  | 'SERVED'
  | 'PICKED_UP'
  | 'CANCELED'

export interface OrderItemResponse {
  menuId: number
  menuName: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

export interface OrderResponse {
  id: number
  storeId: number
  orderType: OrderType
  orderTypeLabel: string
  tableId: number | null
  /** 테이블명 스냅샷(DINE_IN) — 테이블이 삭제돼도 과거 주문엔 남는다 */
  tableName?: string | null
  /** TAKEOUT. 손님 응답은 마스킹(`**-****-5678`)되어 온다 */
  phoneNumber: string | null
  /** TAKEOUT 4자리 */
  pickupNo: string | number | null
  status: OrderStatus
  statusLabel: string
  totalPrice: number
  items: OrderItemResponse[]
  createdAt: string
}

/** 주문 생성 요청 */
export interface CreateOrderRequest {
  orderType: OrderType
  /** [TAKEOUT] 필수, 숫자 10~11자리 */
  phoneNumber?: string
  /** 1~50개, menuId 중복 불가 */
  items: { menuId: number; quantity: number }[]
}

/* ── 직원 호출 ── */
export interface StaffCallResponse {
  id: number
  storeId: number
  tableId: number
  status: 'CALLED' | 'RESOLVED'
  createdAt: string
}
