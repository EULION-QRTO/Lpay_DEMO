import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Product, type TabKey, splitMenuBoard } from '../data'
import { useSession, cleanUrlAfterPayment } from '../session'
import { ApiError } from '../lib/api'
import {
  menuBoard,
  createOrder,
  callStaff,
  ordersByTable,
  ordersByPhone,
  cancelOrder,
  cancelPendingOrders,
  confirmPayment,
} from '../lib/endpoints'
import { subscribeOrderStatus } from '../lib/realtime'
import type { OrderResponse } from '../lib/dto'
import OrderScreen from './OrderScreen'
import CartScreen from './CartScreen'
import PayScreen from './PayScreen'
import PaymentCheckScreen from './PaymentCheckScreen'
import HistoryScreen from './HistoryScreen'
import DoneScreen from './DoneScreen'
import PhoneEntryModal from './PhoneEntryModal'

const CART_KEY = 'lpay-demo:cart'
function loadCart(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(CART_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}
function saveCart(q: Record<string, number>) {
  try {
    sessionStorage.setItem(CART_KEY, JSON.stringify(q))
  } catch {
    /* noop */
  }
}

type View = 'order' | 'cart' | 'pay' | 'pay-check' | 'history' | 'done'

export default function StoreApp() {
  const { session, phone, setPhone, paymentReturn } = useSession()
  // 토스 결제창에서 성공으로 돌아왔으면 '결제 승인 중'에서 시작한다(실패 복귀는 아래 effect 가 장바구니로 보낸다).
  const [view, setView] = useState<View>(paymentReturn?.result === 'success' ? 'pay-check' : 'order')
  const [historyReturn, setHistoryReturn] = useState<View>('order')
  const [tab, setTab] = useState<TabKey>('menu')

  // 메뉴판 (API)
  const [menu, setMenu] = useState<{ menu: Product[]; etc: Product[] } | null>(null)
  const [menuLoading, setMenuLoading] = useState(true)

  // 장바구니: menuId(string) → 수량. 결제창으로 페이지가 이동했다 돌아와도 유지되도록 sessionStorage 에 보관한다.
  const [quantities, setQuantities] = useState<Record<string, number>>(loadCart)
  useEffect(() => saveCart(quantities), [quantities])

  // 주문/결제
  const [order, setOrder] = useState<OrderResponse | null>(null)
  const [placing, setPlacing] = useState(false)

  // 주문내역
  const [history, setHistory] = useState<OrderResponse[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [notice, setNotice] = useState<string | null>(null)
  const flash = useCallback((msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 2500)
  }, [])

  // 메뉴판 로드
  useEffect(() => {
    let alive = true
    setMenuLoading(true)
    menuBoard()
      .then((board) => {
        if (alive) setMenu(splitMenuBoard(board))
      })
      .catch((e) => {
        if (alive) flash(e instanceof ApiError ? e.message : '메뉴를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (alive) setMenuLoading(false)
      })
    return () => {
      alive = false
    }
  }, [flash])

  // 토스 결제창에서 돌아온 경우(successUrl / failUrl) — 한 번만 처리한다.
  //  · 성공: 승인 API 호출(주문 접수 처리) → 완료 화면
  //  · 실패/취소: 결제대기 주문을 정리하고 장바구니로 복귀
  useEffect(() => {
    if (!paymentReturn) return
    let alive = true
    ;(async () => {
      try {
        if (paymentReturn.result === 'success') {
          const o = await confirmPayment(paymentReturn)
          if (!alive) return
          setOrder(o)
          setQuantities({})
          setView('done')
        } else {
          cancelPendingOrders(paymentReturn.orderId)
          if (!alive) return
          flash(
            paymentReturn.code === 'PAY_PROCESS_CANCELED' || paymentReturn.code === 'USER_CANCEL'
              ? '결제를 취소했어요.'
              : paymentReturn.message,
          )
          setView('cart')
        }
      } catch (e) {
        if (!alive) return
        // 승인 실패(금액 불일치·승인 거절 등) — 대기 주문을 정리하고 다시 결제할 수 있게 장바구니로 돌려보낸다.
        cancelPendingOrders(paymentReturn.result === 'success' ? paymentReturn.orderId : null)
        flash(e instanceof ApiError ? e.message : '결제 승인에 실패했어요.')
        setView('cart')
      } finally {
        if (alive) cleanUrlAfterPayment(session.mode)
      }
    })()
    return () => {
      alive = false
    }
    // 결제 복귀 정보는 페이지 로드 시 한 번 정해지고 바뀌지 않는다 — 최초 1회만 실행하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 주문 상태 구독 — 결제 승인(RECEIVED) 이후 조리중 → 조리완료 → 서빙/픽업까지 시간이 지나며
  // 자동으로 바뀐다(realtime.ts). order.status/statusLabel 만 갱신하면 완료 화면 배지가 따라 바뀐다.
  useEffect(() => {
    if (!order) return
    return subscribeOrderStatus(order.id, setOrder)
  }, [order?.id])

  const allItems = useMemo(() => (menu ? [...menu.menu, ...menu.etc] : []), [menu])
  const priceById = useMemo(() => {
    const m = new Map<string, Product>()
    for (const it of allItems) m.set(it.id, it)
    return m
  }, [allItems])

  const increment = (id: string) => {
    if (priceById.get(id)?.soldOut) return
    setQuantities((q) => ({ ...q, [id]: (q[id] ?? 0) + 1 }))
  }
  const decrement = (id: string) =>
    setQuantities((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) - 1) }))

  const total = allItems.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * item.price, 0)
  const hasSelection = allItems.some((item) => (quantities[item.id] ?? 0) > 0)

  const openHistory = () => {
    setHistoryReturn(view)
    setView('history')
    void loadHistory()
  }

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      let list: OrderResponse[] = []
      if (session.mode === 'table') {
        list = await ordersByTable()
      } else if (phone) {
        list = await ordersByPhone(phone)
      }
      setHistory(list)
    } catch (e) {
      flash(e instanceof ApiError ? e.message : '주문내역을 불러오지 못했습니다.')
    } finally {
      setHistoryLoading(false)
    }
  }, [session, phone, flash])

  // 주문 생성 → (유료면) 결제대기, (0원이면) 즉시 완료
  const placeOrder = async () => {
    if (!hasSelection || placing) return
    const items = allItems
      .filter((it) => (quantities[it.id] ?? 0) > 0)
      .map((it) => ({ menuId: Number(it.id), quantity: quantities[it.id] }))

    setPlacing(true)
    try {
      const created =
        session.mode === 'table'
          ? await createOrder({ orderType: 'DINE_IN', items })
          : await createOrder({ orderType: 'TAKEOUT', phoneNumber: phone, items })
      setOrder(created)
      if (created.status === 'RECEIVED') {
        // 합계 0원 → 결제 없이 즉시 접수
        setQuantities({})
        setView('done')
      } else {
        setView('pay')
      }
    } catch (e) {
      flash(e instanceof ApiError ? e.message : '주문에 실패했습니다.')
    } finally {
      setPlacing(false)
    }
  }

  const staffCall = async () => {
    if (session.mode !== 'table') return
    try {
      await callStaff()
      flash('직원을 호출했어요. 잠시만 기다려 주세요.')
    } catch (e) {
      flash(e instanceof ApiError ? e.message : '직원 호출에 실패했습니다.')
    }
  }

  const handlePay = () => {
    if (!hasSelection) return
    void placeOrder()
  }

  // 결제대기 화면에서 뒤로 가기 — 남는 결제대기 주문을 취소한다(PENDING_PAYMENT 에서만 가능).
  // 실패해도(이미 결제 확정 등) 어차피 화면은 장바구니로 돌아간다 — 손님이 다시 시도할 수 있게.
  const backFromPay = () => {
    if (order) void cancelOrder(order.id).catch(() => {})
    setOrder(null)
    setView('cart')
  }

  // 포장(togo) 주문은 전화번호를 먼저 입력해야 한다.
  const phoneGate = session.mode === 'togo' && !phone

  const noticeBar = notice ? (
    <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+96px)] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[16px] bg-[rgba(28,28,28,0.9)] px-[18px] py-[10px] text-[13px] font-semibold text-white">
      {notice}
    </div>
  ) : null

  if (!phoneGate && view === 'done') {
    return (
      <>
        <DoneScreen
          order={order}
          onMore={() => {
            setOrder(null)
            setView('order')
          }}
          onOpenHistory={openHistory}
        />
        {noticeBar}
      </>
    )
  }

  if (!phoneGate && view === 'pay-check') {
    return (
      <>
        <PaymentCheckScreen onOpenHistory={openHistory} />
        {noticeBar}
      </>
    )
  }

  if (!phoneGate && view === 'history') {
    return (
      <>
        <HistoryScreen orders={history} loading={historyLoading} onBack={() => setView(historyReturn)} />
        {noticeBar}
      </>
    )
  }

  if (!phoneGate && view === 'pay' && order) {
    return (
      <>
        <PayScreen
          orderId={order!.id}
          onBack={backFromPay}
          onOpenHistory={openHistory}
          onError={flash}
        />
        {noticeBar}
      </>
    )
  }

  if (!phoneGate && view === 'cart') {
    return (
      <>
        <CartScreen
          items={allItems}
          quantities={quantities}
          onIncrement={increment}
          onDecrement={decrement}
          total={total}
          placing={placing}
          onBack={() => setView('order')}
          onPay={handlePay}
          onOpenHistory={openHistory}
        />
        {noticeBar}
      </>
    )
  }

  return (
    <>
      <OrderScreen
        tab={tab}
        onTabChange={setTab}
        menuItems={menu?.menu ?? []}
        etcItems={menu?.etc ?? []}
        loading={menuLoading}
        quantities={quantities}
        onIncrement={increment}
        onDecrement={decrement}
        total={total}
        hasSelection={hasSelection}
        onOpenCart={() => setView('cart')}
        onOpenHistory={openHistory}
        onStaffCall={session.mode === 'table' ? staffCall : undefined}
        overlay={phoneGate ? <PhoneEntryModal onSubmit={setPhone} /> : undefined}
      />
      {noticeBar}
    </>
  )
}
