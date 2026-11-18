// 실시간 주문 상태 — 원래는 STOMP(WebSocket) 구독이었는데, 데모에는 서버가 없으므로
// localStorage 의 주문을 1초마다 다시 계산해(조리 단계는 시간 경과로 자동 진행) 변화가 있을 때만 알려 준다.
import { peekOrder } from './endpoints'
import type { OrderResponse } from './dto'

/** 특정 주문의 상태 변화를 구독한다. 반환된 함수를 호출하면 해제한다. */
export function subscribeOrderStatus(
  orderId: number,
  onUpdate: (order: OrderResponse) => void,
): () => void {
  let lastStatus = peekOrder(orderId)?.status
  const timer = setInterval(() => {
    const o = peekOrder(orderId)
    if (!o || o.status === lastStatus) return
    lastStatus = o.status
    onUpdate(o)
  }, 1000)
  return () => clearInterval(timer)
}
