import type * as api from '../../api'
import { formatEUR } from '../../utils/formatMoney'
import { shopExpensePurposeLabel } from './adminShopExpensesHelpers'

export type AdminShopExpensesPendingReviewsProps = {
  pendingReviews: api.PendingImportReview[]
  reviewActioning: number | null
  onMergeReview: (reviewId: number) => void
  onDismissReview: (reviewId: number) => void
}

export function AdminShopExpensesPendingReviews(props: AdminShopExpensesPendingReviewsProps) {
  const { pendingReviews, reviewActioning, onMergeReview, onDismissReview } = props
  if (pendingReviews.length === 0) return null

  return (
    <section className="surface-card">
      <h3 className="text-sm font-semibold text-slate-800">Mogelijke duplicaten ({pendingReviews.length})</h3>
      <p className="mt-2 text-sm text-slate-600">
        Deze Revolut-transacties komen overeen met handmatig ingevoerde uitgaven (zelfde bedrag en datum). Kies per
        regel wat je wilt doen.
      </p>
      <div className="mt-4 space-y-4">
        {pendingReviews.map((rv) => (
          <div key={rv.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revolut-import</span>
                <p className="mt-1 font-medium tabular-nums text-slate-900">{formatEUR(rv.revolut.amount_eur)}</p>
                <p className="text-sm text-slate-700">{rv.revolut.spent_on}</p>
                <p className="text-xs text-slate-600">{rv.revolut.description || '\u2014'}</p>
                <p className="text-xs text-slate-500">{shopExpensePurposeLabel(rv.revolut.purpose)}</p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Handmatige boeking
                </span>
                <p className="mt-1 font-medium tabular-nums text-slate-900">
                  {formatEUR(rv.matched_manual.amount_eur)}
                </p>
                <p className="text-sm text-slate-700">{rv.matched_manual.spent_on}</p>
                <p className="text-xs text-slate-600">{rv.matched_manual.description || '\u2014'}</p>
                <p className="text-xs text-slate-500">{shopExpensePurposeLabel(rv.matched_manual.purpose)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={reviewActioning === rv.id}
                onClick={() => onMergeReview(rv.id)}
                className="btn-primary min-h-9 px-3 text-xs"
              >
                {reviewActioning === rv.id ? 'Bezig\u2026' : 'Samenvoegen'}
              </button>
              <button
                type="button"
                disabled={reviewActioning === rv.id}
                onClick={() => onDismissReview(rv.id)}
                className="text-xs font-semibold text-red-700 hover:text-red-900"
              >
                Overslaan
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Samenvoegen = handmatige boeking verwijderen, Revolut-import behouden (bonnetjes worden overgezet).
              Overslaan = Revolut-import negeren.
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
