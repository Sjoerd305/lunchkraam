import { Link } from 'react-router-dom'
import { useAuth } from '../useAuth'

export function DashboardPage() {
  const { user, pendingCardRequests, paymentAmountEUR } = useAuth()
  const name = user?.name?.trim() || 'daar'

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-lg shadow-slate-200/40">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Hallo, {name}
        </h1>
        <p className="mt-2 text-lg text-slate-600">Welkom bij je lunchkraam-overzicht.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/cards"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-md transition hover:border-brand-300 hover:shadow-lg"
        >
          <div className="text-sm font-semibold text-brand-700">Kaarten</div>
          <p className="mt-2 text-slate-600 group-hover:text-slate-800">
            Bekijk je kaarten en gebruik een knipje voor een tosti.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-brand-700">
            Ga naar kaarten →
          </span>
        </Link>
        <Link
          to="/buy"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-md transition hover:border-brand-300 hover:shadow-lg"
        >
          <div className="text-sm font-semibold text-brand-700">Nieuwe kaart</div>
          <p className="mt-2 text-slate-600 group-hover:text-slate-800">
            Koop een nieuwe lunchkraam kaart online (€{paymentAmountEUR}).
          </p>
          <p className="mt-3 text-sm text-slate-500">
            {pendingCardRequests > 0 ? (
              <>
                Je hebt{' '}
                <strong className="text-slate-800">{pendingCardRequests}</strong> openstaande{' '}
                {pendingCardRequests === 1 ? 'aanvraag' : 'aanvragen'} (betaling nog te controleren; je
                kaart kun je al gebruiken).
              </>
            ) : (
              'Geen openstaande aanvragen.'
            )}
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-brand-700">
            Kaart kopen →
          </span>
        </Link>
      </div>
    </div>
  )
}
