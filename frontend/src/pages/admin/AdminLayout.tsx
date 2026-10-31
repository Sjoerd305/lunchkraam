import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../useAuth'

/* Tabs follow the routes in App.tsx. Kraammedewerkers see a subset; the betalingswachtrij lives on /kraam. */

export function AdminLayout() {
  const { user } = useAuth()
  const loc = useLocation()

  if (!user?.is_admin && !user?.is_operator) {
    return <Navigate to="/" replace />
  }

  const operatorOnly = Boolean(user.is_operator && !user.is_admin)
  const operatorPathAllowed =
    loc.pathname === '/admin' ||
    loc.pathname === '/admin/expenses' ||
    loc.pathname === '/admin/finance' ||
    loc.pathname === '/admin/finance-control' ||
    loc.pathname === '/admin/requests' ||
    loc.pathname === '/admin/expenses-overview'
  if (operatorOnly && !operatorPathAllowed) {
    return <Navigate to="/admin" replace />
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 border-b border-slate-200/90 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">Lunchkraam</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Beheer</h1>
        </div>
        <nav className="flex flex-wrap gap-2 sm:justify-end" aria-label="Beheer">
          <AdminTab to="/admin" end>
            Overzicht
          </AdminTab>
          {user.is_admin ? <AdminTab to="/admin/accounts">Accounts</AdminTab> : null}
          <AdminTab to="/admin/finance">Financiën</AdminTab>
          <AdminTab to="/admin/finance-control">Verkoopcontrole</AdminTab>
          <AdminTab to="/admin/expenses">Boodschappen</AdminTab>
          {user.is_admin ? <AdminTab to="/admin/settings">Instellingen</AdminTab> : null}
        </nav>
      </div>
      <Outlet />
    </div>
  )
}

function AdminTab({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          isActive ? 'bg-brand-700 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
