import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import * as api from '../api'

export function AppShell() {
  const { user, csrf, refresh } = useAuth()
  const navigate = useNavigate()

  async function onLogout() {
    try {
      await api.logout(csrf)
      await refresh()
      navigate('/login', { replace: true })
    } catch {
      navigate('/login', { replace: true })
    }
  }

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
            <button
              type="button"
              onClick={() => void onLogout()}
              className="btn-secondary ml-1 shrink-0 px-3 py-1.5 text-sm font-medium"
            >
              Uitloggen
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-5 sm:py-10">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-sm text-slate-500 sm:px-5 sm:pb-10">
        Elke lunchkraam kaart heeft 10 knipjes — 1 tosti = 1 knipje.
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
