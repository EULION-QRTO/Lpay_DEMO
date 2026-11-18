import { useEffect, useRef, useState } from 'react'
import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk'
import Frame from './Frame'
import Header from './Header'
import BottomButton from './BottomButton'
import backArrow from '../assets/back-arrow.svg'
import { loadWidgets } from '../lib/toss'
import { preparePayment, type PreparedPayment } from '../lib/endpoints'
import { paymentReturnUrls, useSession } from '../session'
import { ApiError } from '../lib/api'

// 결제대기 화면 — 유료 상품이 있는 주문에서 진입한다.
// 토스페이먼츠 주문서형 결제 UI(결제수단 + 약관)를 이 화면에 그리고, 하단 버튼을 누르면
// widgets.requestPayment() 로 토스 결제창을 연다(테스트 키라 실제 결제는 일어나지 않는다).
// 인증이 끝나면 토스가 successUrl / failUrl 로 페이지를 이동시키고, 그 뒤 처리는 StoreApp 이 이어받는다.
export default function PayScreen({
  orderId,
  onBack,
  onOpenHistory,
  onError,
}: {
  /** 우리 쪽 주문 ID */
  orderId: number
  onBack: () => void
  onOpenHistory: () => void
  onError: (message: string) => void
}) {
  const { session } = useSession()
  const [prepared, setPrepared] = useState<PreparedPayment | null>(null)
  const [ready, setReady] = useState(false)
  const [paying, setPaying] = useState(false)
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let alive = true
    const rendered: { destroy: () => Promise<void> }[] = []
    ;(async () => {
      try {
        // 1) 결제 요청 전에 orderId·amount 를 저장(데모 서버)  2) SDK 초기화
        const [p, widgets] = await Promise.all([preparePayment(orderId), loadWidgets()])
        if (!alive) return
        // 3) 결제 금액 설정 → 결제수단/약관 UI 렌더링
        await widgets.setAmount({ currency: 'KRW', value: p.amount })
        const [methods, agreement] = await Promise.all([
          widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
          widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' }),
        ])
        rendered.push(methods, agreement)
        if (!alive) {
          rendered.forEach((w) => void w.destroy().catch(() => {}))
          return
        }
        widgetsRef.current = widgets
        setPrepared(p)
        setReady(true)
      } catch (e) {
        if (alive) onErrorRef.current(e instanceof ApiError ? e.message : '결제 화면을 불러오지 못했어요.')
      }
    })()
    return () => {
      alive = false
      widgetsRef.current = null
      rendered.forEach((w) => void w.destroy().catch(() => {}))
    }
  }, [orderId])

  const pay = async () => {
    const widgets = widgetsRef.current
    if (!widgets || !prepared || paying) return
    setPaying(true)
    try {
      await widgets.requestPayment({
        orderId: prepared.orderId,
        orderName: prepared.orderName,
        ...paymentReturnUrls(session.mode),
      })
      // 성공/실패 모두 successUrl/failUrl 로 페이지가 이동하므로 보통 여기까지 오지 않는다.
    } catch (e) {
      // 결제창을 닫는 등 이동 없이 끝난 경우(PAY_PROCESS_CANCELED 등) — 그대로 이 화면에서 다시 시도할 수 있다.
      const err = e as { code?: string; message?: string }
      if (err?.code !== 'USER_CANCEL' && err?.code !== 'PAY_PROCESS_CANCELED') {
        onErrorRef.current(err?.message ?? '결제 요청에 실패했어요.')
      }
    } finally {
      setPaying(false)
    }
  }

  const amount = prepared?.amount
  return (
    <Frame>
      <Header
        onOrderHistory={onOpenHistory}
        secondRow={
          <div className="flex items-center gap-[36px]">
            <button
              type="button"
              onClick={onBack}
              aria-label="뒤로 가기"
              className="flex h-[29px] w-[15px] items-center justify-center"
            >
              <img alt="" className="h-[15px] w-[9px] -scale-x-100" src={backArrow} />
            </button>
            <span className="rounded-[16px] bg-[#ededed] px-[18px] py-[5px] text-[15px] font-bold text-[#373737]">
              결제대기
            </span>
          </div>
        }
      />

      <main className="min-h-0 flex-1 overflow-y-auto pb-[110px]">
        {!ready && (
          <p className="px-[30px] py-[40px] text-center text-[14px] font-medium text-[#969ca3]">
            결제 수단을 불러오는 중…
          </p>
        )}
        <div className="mx-[16px] mt-[16px] overflow-hidden rounded-[16px] bg-white">
          <div id="payment-method" />
          <div id="agreement" />
        </div>
        <p className="px-[30px] pb-[8px] pt-[16px] text-center text-[11px] font-medium leading-[1.5] text-[#969ca3]">
          데모 시연용 토스페이먼츠 테스트 결제예요.
          <br />
          카드번호는 아무 값이나 입력해도 되고, 실제로 청구되지 않아요.
        </p>
      </main>

      <BottomButton
        label={paying ? '결제창으로 이동 중…' : amount != null ? `${amount.toLocaleString()}원 결제하기` : '결제하기'}
        active={ready && !paying}
        disabled={!ready || paying}
        onClick={pay}
      />
    </Frame>
  )
}
