import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../useAuth'
import * as api from '../api'
import { useAlertDialog } from './useAlertDialog'
import { useTostiRealtime } from '../useTostiRealtime'
import { LogoBadge } from './Logo'
import { activeTostiCard, useMyCards } from '../hooks/useMyCards'
import { queryKeys } from '../queryKeys'

/* Navigatie volgt dezelfde routes en rolregels als App.tsx en AdminLayout.tsx. */

export function AppShell() {
  const { user, csrf, refresh, tikkieWarnings } = useAuth()
  const { alert } = useAlertDialog()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || 'dev'
  const lastProfileRefreshAtRef = useRef(0)
  const menuDetailsRef = useRef<HTMLDetailsElement>(null)

  const staff = Boolean(user?.is_admin || user?.is_operator)
  const adminHome = user?.is_admin ? '/admin' : '/admin/requests'

  const cardsQuery = useMyCards()
  const activeCard = activeTostiCard(cardsQuery.data)
  const bites = activeCard ? 10 - activeCard.knipjes_remaining : 0
  const logoTitle = activeCard
    ? bites === 0
      ? 'Nieuwe tostikaart, nog geen hap eruit'
      : `${bites} van 10 knipjes gebruikt`
    : 'Lunchkraam'

  function closeUserMenu() {
    if (menuDetailsRef.current) {
      menuDetailsRef.current.open = false
    }
  }

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

  useTostiRealtime(
    '/ws/mijn-tosti',
    Boolean(user),
    (reason) => {
      if (reason === 'my_tosti_orders') {
        // Geleverde tosti = knipje eraf = hap uit het logo.
        void queryClient.invalidateQueries({ queryKey: queryKeys.member.myCards })
        return
      }
      if (reason !== 'user_profile_updated') return
      const now = Date.now()
      if (now - lastProfileRefreshAtRef.current < 1500) return
      lastProfileRefreshAtRef.current = now
      void refresh()
      void queryClient.invalidateQueries({ queryKey: queryKeys.member.myCards })
    },
    ['user_profile_updated', 'my_tosti_orders'],
  )

  const initials =
    (user?.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'

  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 sm:px-6 lg:gap-10">
          <Link to="/" className="flex shrink-0 items-center gap-3 py-3" title={logoTitle}>
            <LogoBadge bites={bites} title={logoTitle} />
            <span className="flex flex-col leading-tight">
              <span className="font-display text-lg font-bold text-brand-900">Lunchkraam</span>
              <span className="text-xs font-medium text-ink-muted">Maasgroep 18</span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-7 md:flex" aria-label="Hoofdmenu">
            <TopLink to="/" end>
              Overzicht
            </TopLink>
            <TopLink to="/cards">Mijn kaarten</TopLink>
            <TopLink to="/buy">Kaart kopen</TopLink>
            <TopLink to="/tosti">Tosti bestellen</TopLink>
            {staff ? (
              <>
                <span aria-hidden="true" className="my-4 w-px self-stretch bg-line" />
                <TopLink to="/kraam">Kraam</TopLink>
                <TopLink to={adminHome} match="/admin">
                  Beheer
                </TopLink>
              </>
            ) : null}
          </nav>

          <details ref={menuDetailsRef} className="relative ml-auto">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-full border border-line bg-ground py-1 pl-1 pr-3 text-sm font-semibold text-ink hover:bg-ground-deep [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-white"
              >
                {initials}
              </span>
              <span className="hidden max-w-32 truncate sm:inline">{user?.name?.split(' ')[0] || 'Account'}</span>
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-ink-muted"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="absolute right-0 z-30 mt-2 min-w-52 rounded-[12px] border border-line bg-white p-1.5 shadow-lg">
              <p className="truncate px-3 py-2 text-xs text-ink-muted">{user?.email || user?.local_username}</p>
              {user?.auth_kind === 'local' ? (
                <Link
                  to="/account/password"
                  onClick={closeUserMenu}
                  className="block rounded-[8px] px-3 py-2 text-sm text-ink hover:bg-ground"
                >
                  Wachtwoord wijzigen
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  closeUserMenu()
                  void onLogout()
                }}
                className="block w-full rounded-[8px] px-3 py-2 text-left text-sm text-ink hover:bg-ground"
              >
                Uitloggen
              </button>
            </div>
          </details>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-8 md:pb-10">
        <Outlet />
      </main>

      <footer className="hidden border-t border-line md:block">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-ink-muted sm:px-6">
          10 knipjes per kaart · 1 tosti = 1 knipje · versie {appVersion}
        </p>
      </footer>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-white px-1 pb-[max(env(safe-area-inset-bottom),6px)] md:hidden"
        aria-label="Navigatie"
      >
        <TabLink to="/" end label="Overzicht">
          <path d="M3 11 12 3l9 8" />
          <path d="M5 10v10h14V10" />
        </TabLink>
        <TabLink to="/cards" label="Kaarten">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 12h.01M11 12h.01M15 12h.01" />
        </TabLink>
        <TabLink to="/tosti" label="Tosti">
          <path d="M4 10a4 4 0 0 1 3.2-5.8A3.6 3.6 0 0 1 12 3a3.6 3.6 0 0 1 4.8 1.2A4 4 0 0 1 20 10v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        </TabLink>
        {staff ? (
          <>
            <TabLink to="/kraam" label="Kraam">
              <path d="M3 9 5 4h14l2 5" />
              <path d="M3 9h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
              <path d="M5 14v6h14v-6" />
            </TabLink>
            <TabLink to={adminHome} match="/admin" label="Beheer">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </TabLink>
          </>
        ) : (
          <TabLink to="/buy" label="Kopen">
            <circle cx="9" cy="20" r="1" />
            <circle cx="18" cy="20" r="1" />
            <path d="M2 3h3l2.7 11.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L22 7H6" />
          </TabLink>
        )}
      </nav>
    </div>
  )
}

function TopLink({
  to,
  end,
  match,
  children,
}: {
  to: string
  end?: boolean
  /** Prefix om als actief te tellen wanneer die afwijkt van `to` (Beheer → /admin/...). */
  match?: string
  children: ReactNode
}) {
  const { pathname } = useLocation()
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `border-b-[3px] py-5 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          isActive || (match && pathname.startsWith(match))
            ? 'border-accent-400 text-brand-900'
            : 'border-transparent text-ink-muted hover:text-ink'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function TabLink({
  to,
  end,
  match,
  label,
  children,
}: {
  to: string
  end?: boolean
  match?: string
  label: string
  children: ReactNode
}) {
  const { pathname } = useLocation()
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[11px] font-semibold ${
          isActive || (match && pathname.startsWith(match)) ? 'text-brand-900' : 'text-ink-muted'
        }`
      }
    >
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
      {label}
    </NavLink>
  )
}
