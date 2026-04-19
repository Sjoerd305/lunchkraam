import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { PaymentRequestsPanel } from '../../components/PaymentRequestsPanel'
import { useAlertDialog } from '../../components/useAlertDialog'
import { queryKeys } from '../../queryKeys'
import { useTostiRealtime } from '../../useTostiRealtime'

export function AdminRequestsPage() {
  const { csrf, user } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<number | null>(null)

  const listQuery = useQuery({
    queryKey: queryKeys.admin.requests,
    queryFn: () => api.getAdminRequests(),
  })

  useEffect(() => {
    if (!listQuery.isError || !listQuery.error) return
    const msg = listQuery.error instanceof api.ApiError ? listQuery.error.message : 'Laden mislukt.'
    void alert({ title: 'Laden mislukt', message: msg, variant: 'error' })
  }, [listQuery.isError, listQuery.error, alert])

  const onPaymentRealtime = useCallback(
    (reason: string) => {
      if (reason === 'open' || reason === 'payment_requests') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests })
      }
    },
    [queryClient],
  )

  useTostiRealtime(
    '/ws/kraam',
    Boolean(user && (user.is_admin || user.is_operator)),
    onPaymentRealtime,
    ['payment_requests'],
  )

  async function onFulfill(id: number, knipjesRemaining: number) {
    const msg =
      knipjesRemaining === 10
        ? 'Accorderen? Op de kaart staan nog 10 knipjes.'
        : `Accorderen? Op de kaart staan nog ${knipjesRemaining} knipje(s).`
    const ok = await confirm({
      title: 'Betaling accorderen?',
      message: msg,
      confirmLabel: 'Accorderen',
      cancelLabel: 'Terug',
      tone: 'brand',
    })
    if (!ok) return
    setBusyId(id)
    try {
      await api.fulfillRequest(csrf, id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests })
      await alert({
        title: 'Geaccordeerd',
        message: 'De aanvraag is uit de wachtrij gehaald.',
        variant: 'success',
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Toekennen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function onReject(id: number) {
    const ok = await confirm({
      title: 'Aanvraag weigeren?',
      message: 'De voorlopige kaart wordt verwijderd.',
      confirmLabel: 'Ja, weigeren',
      cancelLabel: 'Terug',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(id)
    try {
      await api.rejectAdminRequest(csrf, id)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.requests })
      await alert({
        title: 'Afgewezen',
        message: 'De aanvraag is geannuleerd en de kaart is verwijderd.',
        variant: 'success',
      })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Weigeren mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  const rows = listQuery.data ?? []

  if (listQuery.isLoading) {
    return <p className="text-slate-600">Laden…</p>
  }

  if (listQuery.isError && rows.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-md">
        <p className="text-slate-600">Aanvragen konden niet worden geladen.</p>
        <button
          type="button"
          onClick={() => void listQuery.refetch()}
          className="min-h-12 w-full max-w-xs rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-800"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PaymentRequestsPanel
        title="Openstaande aanvragen"
        intro={
          <p>
            <strong>Weigeren</strong> alleen zonder knipjegebruik. Daarna: <strong>accorderen</strong> zodra betaald.
          </p>
        }
        rows={rows}
        busyId={busyId}
        onFulfill={(id, k) => void onFulfill(id, k)}
        onReject={(id) => void onReject(id)}
        layout="responsive"
      />
    </div>
  )
}
