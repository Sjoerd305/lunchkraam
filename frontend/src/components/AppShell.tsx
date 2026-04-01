import { useEffect } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import * as api from '../api'
import { useAlertDialog } from './AlertDialogProvider'

export function AppShell() {
  const { user, csrf, refresh, tikkieWarnings } = useAuth()
  const { alert } = useAlertDialog()
  const navigate = useNavigate()
  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || 'dev'

  async function onLogout() {
    try {
      await api.logout(csrf)
      await refresh()
      navigate('/login', { replace: true })
    } catch {
      navigate('/login', { replace: true })
    }
  }

  useEffect(() => {
    if (!user || (!user.is_admin && !user.is_operator)) return
    if (tikkieWarnings.length === 0) return
    const warningSignature = JSON.stringify(
      tikkieWarnings.map((warning) => `${warning.kind}:${warning.expires_at}:${warning.days_remaining}`),
    )
    const shownKey = `tikkie-warning-shown:${warningSignature}`
    if (window.sessionStorage.getItem(shownKey) === '1') return

    window.sessionStorage.setItem(shownKey, '1')
    const message = tikkieWarnings
      .map((warning) => {
        const dayLabel = warning.days_remaining === 1 ? 'dag' : 'dagen'
        return `- ${warning.message} (nog ${warning.days_remaining} ${dayLabel})`
      })
      .join('\n')
    void alert({
      title: 'Tikkie verloopt binnenkort',
      message: `Een of meer tikkie-links moeten vernieuwd worden:\n${message}`,
      variant: 'error',
    })
  }, [alert, tikkieWarnings, user])

  return (
    <div className="min-h-screen bg-linear-to-b from-brand-50 via-white to-slate-50 text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-brand-800 transition hover:text-brand-600"
          >
            Lunchkraam
          </Link>
          <nav className="flex flex-wrap items-center gap-0.5 sm:gap-1">
            <NavLink to="/">Dashboard</NavLink>
            <NavLink to="/cards">Mijn kaarten</NavLink>
            <NavLink to="/buy">Kaart kopen</NavLink>
            <NavLink to="/tosti">Tosti bestellen</NavLink>
            {user?.is_admin || user?.is_operator ? <NavLink to="/kraam">Kraam</NavLink> : null}
            {user?.is_admin || user?.is_operator ? (
              <NavLink to={user?.is_admin ? '/admin' : '/admin/requests'}>
                {user?.is_admin ? 'Admin' : 'Betalingen'}
              </NavLink>
            ) : null}
            <details className="relative ml-1">
              <summary className="btn-secondary cursor-pointer list-none px-3 py-1.5 text-sm font-medium">
                Account
              </summary>
              <div className="absolute right-0 z-30 mt-2 min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {user?.auth_kind === 'local' ? (
                  <Link
                    to="/account/password"
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Wachtwoord wijzigen
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  Uitloggen
                </button>
              </div>
            </details>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-5 sm:py-10">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-sm text-slate-500 sm:px-5 sm:pb-10">
        10 knipjes per kaart · 1 tosti = 1 knipje · versie {appVersion}
      </footer>
    </div>
  )
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-brand-100/60 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {children}
    </Link>
  )
}
