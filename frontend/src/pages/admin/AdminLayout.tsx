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
    loc.pathname === '/admin' ||
    loc.pathname.startsWith('/admin/requests') ||
    loc.pathname === '/admin/expenses' ||
    loc.pathname === '/admin/expenses-overview' ||
    loc.pathname === '/admin/finance' ||
    loc.pathname === '/admin/finance-control'
  if (operatorOnly && !operatorPathAllowed) {
    return <Navigate to="/admin/requests" replace />
  }
  return (
    <div className="flex flex-wrap gap-8">
      <nav className="w-full shrink-0 md:w-52" aria-label="Beheer">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-1 md:overflow-visible md:px-0">
          <SideGroup label="Dagelijks" />
          <SideLink to="/admin" end>
            Overzicht
          </SideLink>
          <SideLink to="/admin/requests">Betalingswachtrij</SideLink>
          <SideLink to="/admin/expenses">Boodschappen</SideLink>
          <SideGroup label="Financiën" />
          <SideLink to="/admin/finance">Financiën</SideLink>
          <SideLink to="/admin/finance-control">Verkoopcontrole</SideLink>
          {user.is_admin ? (
            <>
              <SideGroup label="Instellingen" />
              <SideLink to="/admin/accounts">Accounts</SideLink>
              <SideLink to="/admin/settings">Instellingen</SideLink>
            </>
          ) : null}
        </div>
      </nav>
      <div className="min-w-0 flex-[999_1_560px]">
        <Outlet />
      </div>
    </div>
  )
}

function SideGroup({ label }: { label: string }) {
  return <p className="eyebrow hidden pb-2 pl-3 pt-4 first:pt-0 md:block">{label}</p>
}

function SideLink({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-11 shrink-0 items-center rounded-[10px] px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          isActive ? 'bg-brand-900 text-white' : 'text-ink hover:bg-ground-deep'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
