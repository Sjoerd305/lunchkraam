import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../useAuth'

const loginErrors: Record<string, string> = {
  oauth: 'Inloggen bij Google is geannuleerd of mislukt.',
  state: 'Beveiligingscontrole mislukt. Probeer opnieuw in te loggen.',
  code: 'Geen autorisatiecode ontvangen. Probeer het opnieuw.',
  token: 'Uitwisselen van de code mislukt. Probeer het opnieuw.',
  profile: 'Je Google-profiel kon niet worden opgehaald.',
  domain: 'Alleen accounts van jullie Google Workspace-organisatie mogen inloggen.',
  db: 'Account kon niet worden opgeslagen. Probeer het later opnieuw.',
}

export function LoginPage() {
  const { user, loading, refresh } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const errCode = params.get('error') ?? ''
  const errMsg = errCode ? loginErrors[errCode] ?? 'Inloggen mislukt.' : ''
  const [localUser, setLocalUser] = useState('')
  const [localPass, setLocalPass] = useState('')
  const [localBusy, setLocalBusy] = useState(false)
  const [localErr, setLocalErr] = useState('')

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [user, loading, navigate])

  async function onLocalSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalErr('')
    if (loading) {
      setLocalErr('Even wachten tot de pagina geladen is, en probeer opnieuw.')
      return
    }
    setLocalBusy(true)
    try {
      await api.localLogin('', localUser, localPass)
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Inloggen mislukt.'
      setLocalErr(msg)
    } finally {
      setLocalBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-brand-50 to-slate-100">
        <p className="text-slate-600">Laden…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-brand-100/80 via-white to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50">
        <div className="mb-2 text-center text-sm font-semibold uppercase tracking-wider text-brand-700">
          Lunchkraam
        </div>
        <h1 className="mb-2 text-center text-2xl font-bold text-slate-900">Maasgroep 18</h1>
        <p className="mb-6 text-center text-slate-600">
          Log in met Google, of met een door de beheerder aangemaakt account (jeugd / zonder Google).
        </p>
        {errMsg ? (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {errMsg}
          </div>
        ) : null}
        <form onSubmit={(e) => void onLocalSubmit(e)} className="mb-8 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-5">
          <h2 className="text-sm font-semibold text-slate-800">Lokaal inloggen</h2>
          {localErr ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {localErr}
            </div>
          ) : null}
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Gebruikersnaam</span>
            <input
              required
              autoComplete="username"
              value={localUser}
              onChange={(e) => setLocalUser(e.target.value)}
              className="input-control mt-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Wachtwoord</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={localPass}
              onChange={(e) => setLocalPass(e.target.value)}
              className="input-control mt-1.5"
            />
          </label>
          <button type="submit" disabled={localBusy} className="btn-secondary w-full py-3">
            {localBusy ? 'Bezig…' : 'Inloggen'}
          </button>
        </form>
        <p className="mb-4 text-center text-xs text-slate-500">of</p>
        <a
          href="/auth/google"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3.5 text-center text-sm font-semibold text-white shadow-md shadow-brand-700/25 transition hover:bg-brand-800"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Inloggen met Google
        </a>
      </div>
    </div>
  )
}
