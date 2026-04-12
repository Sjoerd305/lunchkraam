import { PaymentRequestsPanel } from '../../components/PaymentRequestsPanel'
import type { AdminRequest, User } from '../../api'

type Props = {
  user: User
  paymentLoading: boolean
  paymentLoadFailed: boolean
  paymentRows: AdminRequest[]
  paymentBusyId: number | null
  onRefresh: () => void
  onFulfill: (id: number, knipjesRemaining: number) => void
  onReject: (id: number) => void
}

export function KraamPaymentQueueSection({
  user,
  paymentLoading,
  paymentLoadFailed,
  paymentRows,
  paymentBusyId,
  onRefresh,
  onFulfill,
  onReject,
}: Props) {
  return (
    <section className="space-y-4 rounded-2xl border border-amber-200/90 bg-amber-50/40 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-amber-950">Betalingen in de wachtrij</h2>
          <p className="text-sm text-amber-900/85">
            Accordeer als betaald. Weigeren kan alleen zolang er nog geen knipje is gebruikt.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="min-h-10 shrink-0 rounded-xl border border-amber-300/80 bg-white px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100/60"
        >
          Vernieuwen
        </button>
      </div>
      {paymentLoading && paymentRows.length === 0 ? (
        <p className="text-amber-900/80">Betalingsaanvragen laden…</p>
      ) : paymentLoadFailed && paymentRows.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-white/90 p-4 text-center">
          <p className="text-sm text-amber-950">Kon de wachtrij niet laden.</p>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="mt-3 rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-900"
          >
            Opnieuw proberen
          </button>
        </div>
      ) : (
        <PaymentRequestsPanel
          rows={paymentRows}
          busyId={paymentBusyId}
          canManageRequest={(row) => Boolean(user.is_admin || row.kind !== 'avondeten')}
          onFulfill={(id, k) => void onFulfill(id, k)}
          onReject={(id) => void onReject(id)}
          layout="cards-only"
        />
      )}
    </section>
  )
}
