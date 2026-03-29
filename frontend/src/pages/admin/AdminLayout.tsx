import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../AuthContext'

export function AdminLayout() {
  const { user } = useAuth()
  if (!user?.is_admin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Beheer</p>
          <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        </div>
        <nav className="flex flex-wrap gap-2">
          <AdminTab to="/admin" end>
            Overzicht
          </AdminTab>
          <AdminTab to="/admin/requests">Betalingswachtrij</AdminTab>
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
        `rounded-xl px-4 py-2 text-sm font-semibold transition ${
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
