import { useCallback, useEffect, useState } from 'react'
import * as api from '../../api'
import { useAuth } from '../../AuthContext'
import { PaymentRequestsPanel } from '../../components/PaymentRequestsPanel'
import { useAlertDialog } from '../../components/AlertDialogProvider'
import { useTostiRealtime } from '../../useTostiRealtime'

export function AdminRequestsPage() {
  const { csrf, user } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const [rows, setRows] = useState<api.AdminRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const list = await api.getAdminRequests()
      setRows(list)
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      setLoadFailed(true)
      setRows([])
      void alert({ title: 'Laden mislukt', message: msg, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [alert])

  useEffect(() => {
    void load()
  }, [load])

  const onPaymentRealtime = useCallback(
    (reason: string) => {
      if (reason === 'open' || reason === 'payment_requests') {
        void load()
      }
    },
    [load],
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
        ? 'Betalingscontrole afronden? Het lid heeft de kaart al met 10 knipjes; tijdens de verkoop hoef je nu niets extra’s te doen.'
        : `Betalingscontrole afronden? Op de kaart staan nog ${knipjesRemaining} knipje(s); het lid kon die al gebruiken.`
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
      await load()
      await alert({
        title: 'Geaccordeerd',
        message:
          'De aanvraag is uit de wachtrij gehaald. De kaart bleef gewoon bruikbaar voor het lid.',
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
      message:
        'Geen betaling ontvangen? De voorlopige kaart wordt verwijderd. Het lid kan later opnieuw een kaart aanvragen.',
      confirmLabel: 'Ja, weigeren',
      cancelLabel: 'Terug',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(id)
    try {
      await api.rejectAdminRequest(csrf, id)
      await load()
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

  if (loading && !loadFailed) {
    return <p className="text-slate-600">Laden…</p>
  }

  if (loadFailed && rows.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-md">
        <p className="text-slate-600">Aanvragen konden niet worden geladen.</p>
        <button
          type="button"
          onClick={() => void load()}
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
            <strong>Weigeren</strong> is alleen mogelijk zolang er nog geen knipje is gebruikt (geen tosti
            geleverd). Zodra het lid een knipje heeft gebruikt, moet je de betaling <strong>accorderen</strong>{' '}
            zodra die binnen is.
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
