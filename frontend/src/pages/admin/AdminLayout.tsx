import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../useAuth'

export function AdminLayout() {
  const { user } = useAuth()
  const loc = useLocation()

  if (!user?.is_admin && !user?.is_operator) {
    return <Navigate to="/" replace />
  }

  const operatorOnly = Boolean(user.is_operator && !user.is_admin)
  const operatorPathAllowed =
    loc.pathname.startsWith('/admin/requests') ||
    loc.pathname === '/admin/expenses' ||
    loc.pathname === '/admin/expenses-overview'
  if (operatorOnly && !operatorPathAllowed) {
    return <Navigate to="/admin/requests" replace />
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 border-b border-slate-200/90 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">
            {operatorOnly ? 'Lunchkraam' : 'Beheer'}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {operatorOnly ? 'Betalingswachtrij' : 'Admin'}
          </h1>
        </div>
        <nav className="flex flex-wrap gap-2 sm:justify-end">
          {user.is_admin ? (
            <AdminTab to="/admin" end>
              Overzicht
            </AdminTab>
          ) : null}
          <AdminTab to="/admin/requests">Betalingswachtrij</AdminTab>
          {user.is_admin ? <AdminTab to="/admin/accounts">Accounts</AdminTab> : null}
          <AdminTab to="/admin/expenses-overview">Overzichten</AdminTab>
          <AdminTab to="/admin/expenses">Boodschappen</AdminTab>
          {user.is_admin ? <AdminTab to="/admin/settings">Instellingen</AdminTab> : null}
        </nav>
      </div>
      <Outlet />
    </div>
  )
}

function AdminTab({
  to,
  end,
  children,
}: {
  to: string
  end?: boolean
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          isActive
            ? 'bg-brand-700 text-white shadow-md'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
