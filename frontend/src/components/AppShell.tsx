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
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-brand-800 transition hover:text-brand-600"
          >
            Lunchkraam
          </Link>
          <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
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
              className="ml-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              Uitloggen
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-sm text-slate-500">
        Elke lunchkraam kaart heeft 10 knipjes — 1 tosti = 1 knipje.
      </footer>
    </div>
  )
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-brand-100/60 hover:text-brand-900"
    >
      {children}
    </Link>
  )
}
