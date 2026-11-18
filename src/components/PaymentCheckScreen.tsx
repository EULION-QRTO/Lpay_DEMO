import Frame from './Frame'
import Header from './Header'

// 결제 승인 중 화면 — 토스 결제창에서 인증을 마치고 successUrl 로 돌아온 직후 잠깐 보여준다.
// 이 동안 토스 결제 승인 API(POST /v1/payments/confirm)를 호출하고, 승인되면 자동으로 완료 화면으로 넘어간다.
export default function PaymentCheckScreen({ onOpenHistory }: { onOpenHistory: () => void }) {
  return (
    <Frame>
      <Header
        onOrderHistory={onOpenHistory}
        secondRow={
          <span className="rounded-[16px] bg-[#ededed] px-[18px] py-[5px] text-[15px] font-bold text-[#373737]">
            결제 승인 중
          </span>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[16px] px-[30px] pb-[110px] text-center">
        <p className="text-[20px] font-bold leading-[normal] text-black">결제를 승인하고 있어요…</p>
        <p className="text-[14px] font-medium text-[#969ca3]">
          잠시만 기다려 주세요. 승인되면 자동으로 넘어가요.
        </p>
      </main>
    </Frame>
  )
}
