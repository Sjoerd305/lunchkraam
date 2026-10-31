import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState, type FormEvent } from 'react'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { CardHistoryPanel } from '../../components/CardHistoryPanel'
import { useAlertDialog } from '../../components/useAlertDialog'
import { useQueryErrorAlert } from '../../hooks/useQueryErrorAlert'
import { queryKeys } from '../../queryKeys'
import { cardKindBadgeClass, cardKindLabel } from '../../utils/cardKindPresentation'
import { formatDateNL } from '../../utils/cardTransactionLabels'

type Filter = 'active' | 'all'

const checkbox = 'h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500 disabled:opacity-40'

function UserCardsRow({ userId, onChanged }: { userId: number; onChanged: () => Promise<void> }) {
  const cardsQuery = useQuery({
    queryKey: queryKeys.admin.userCards(userId),
    queryFn: () => api.getAdminUserCards(userId),
  })
  const [openHistoryCard, setOpenHistoryCard] = useState<number | null>(null)

  if (cardsQuery.isPending) return <p className="text-sm text-slate-500">Kaarten laden…</p>
  if (cardsQuery.isError) return <p className="text-sm text-amber-800">Kaarten laden mislukt.</p>
  const cards = cardsQuery.data
  if (cards.length === 0) return <p className="text-sm text-slate-500">Geen kaarten.</p>

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {cards.map((c) => (
        <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-mono text-slate-500">#{c.id}</span>
              <span className={cardKindBadgeClass(c.kind, 'cards')}>{cardKindLabel(c.kind)}</span>
              {c.source === 'physical' ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-900">fysiek (schatting)</span>
              ) : null}
              <span className="text-slate-500">· {formatDateNL(c.created_at)}</span>
            </span>
            <span className="font-semibold tabular-nums text-slate-900">
              {c.knipjes_remaining} <span className="font-normal text-slate-500">/ 10</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpenHistoryCard((prev) => (prev === c.id ? null : c.id))}
            className="mt-2 text-xs font-semibold text-brand-700 hover:underline"
          >
            {openHistoryCard === c.id ? 'Historie verbergen' : 'Historie'}
          </button>
          {openHistoryCard === c.id ? (
            <div className="mt-2">
              <CardHistoryPanel cardId={c.id} onChanged={onChanged} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function AdminLocalUsersPage() {
  const { csrf, user: me } = useAuth()
  const { alert, confirm } = useAlertDialog()
  const queryClient = useQueryClient()
  const listQuery = useQuery({
    queryKey: queryKeys.admin.users,
    queryFn: () => api.getAdminUsers(),
  })
  useQueryErrorAlert(listQuery, { title: 'Gebruikers laden mislukt', alert })

  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')
  const [expandedUser, setExpandedUser] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const [creating, setCreating] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [newIsOperator, setNewIsOperator] = useState(false)
  const [newMustChangePassword, setNewMustChangePassword] = useState(true)

  const [editId, setEditId] = useState<number | null>(null)
  const [editPwd, setEditPwd] = useState('')
  const [editMustChangePassword, setEditMustChangePassword] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const inactiveCount = rows.filter((r) => !r.is_active).length
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'active' && !r.is_active) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.local_username ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, filter, search])

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.users })

  function patchRow(id: number, patch: Partial<api.AdminUserRow>) {
    queryClient.setQueryData(queryKeys.admin.users, (old: api.AdminUserRow[] | undefined) =>
      (old ?? []).map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.createLocalUser(csrf, {
        username,
        name: displayName,
        password,
        is_admin: newIsAdmin,
        is_operator: newIsOperator,
        must_change_password: newMustChangePassword,
      })
      setUsername('')
      setDisplayName('')
      setPassword('')
      setNewIsAdmin(false)
      setNewIsOperator(false)
      setNewMustChangePassword(true)
      await invalidateUsers()
      await alert({
        title: 'Account aangemaakt',
        message: 'Het account kan nu inloggen met gebruikersnaam en wachtwoord.',
        variant: 'success',
      })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Aanmaken mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  async function toggleMatroosJeugd(r: api.AdminUserRow, next: boolean) {
    setBusyId(r.id)
    patchRow(r.id, { is_matroos_jeugd: next })
    try {
      await api.patchUserMatroosJeugd(csrf, r.id, next)
    } catch (e) {
      patchRow(r.id, { is_matroos_jeugd: r.is_matroos_jeugd })
      const msg = e instanceof api.ApiError ? e.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function toggleRole(r: api.AdminUserRow, role: 'is_admin' | 'is_operator', next: boolean) {
    const body = { is_admin: r.is_admin, is_operator: r.is_operator, [role]: next }
    if (role === 'is_admin' && !next) {
      const ok = await confirm({
        title: 'Beheerdersrechten intrekken?',
        message: `${r.name} verliest toegang tot accounts, instellingen en het accorderen van avondetenkaarten.`,
        confirmLabel: 'Ja, intrekken',
        cancelLabel: 'Terug',
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusyId(r.id)
    patchRow(r.id, body)
    try {
      await api.patchUserRoles(csrf, r.id, body)
    } catch (e) {
      patchRow(r.id, { is_admin: r.is_admin, is_operator: r.is_operator })
      const msg = e instanceof api.ApiError ? e.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function toggleActive(r: api.AdminUserRow) {
    const next = !r.is_active
    if (!next) {
      const ok = await confirm({
        title: 'Account deactiveren?',
        message: `${r.name} kan daarna niet meer inloggen en staat niet meer in de ledenkeuze aan de kraam. Kaarten en historie blijven bewaard; je kunt het account later weer activeren.`,
        confirmLabel: 'Ja, deactiveren',
        cancelLabel: 'Terug',
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusyId(r.id)
    try {
      await api.patchUserActive(csrf, r.id, next)
      await invalidateUsers()
      await queryClient.invalidateQueries({ queryKey: queryKeys.operator.members })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  function startEdit(r: api.AdminUserRow) {
    if (r.auth_kind !== 'local') return
    setEditId(r.id)
    setEditPwd('')
    setEditMustChangePassword(r.must_change_password)
  }

  async function saveEdit() {
    if (editId === null) return
    const row = rows.find((r) => r.id === editId)
    if (!row) return
    setSavingId(editId)
    try {
      await api.patchLocalUser(csrf, editId, {
        password: editPwd,
        is_admin: row.is_admin,
        is_operator: row.is_operator,
        must_change_password: editMustChangePassword,
      })
      setEditId(null)
      await invalidateUsers()
      await alert({ title: 'Opgeslagen', message: 'Account bijgewerkt.', variant: 'success' })
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-10">
      <section className="surface-card">
        <h2 className="text-lg font-semibold text-slate-900">Rollen</h2>
        <dl className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <dt className="font-semibold text-slate-900">Kraammedewerker</dt>
            <dd className="mt-1">
              Kraampagina: bestellingen, knipjes, avondeten, kaartverkoop, betalingen. Onder Beheer: overzicht, financiën,
              verkoopcontrole en boodschappen.
            </dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <dt className="font-semibold text-slate-900">Beheerder</dt>
            <dd className="mt-1">
              Alles van kraammedewerker, plus accounts, instellingen en het accorderen van avondetenkaarten.
            </dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <dt className="font-semibold text-slate-900">Matroos (jeugd)</dt>
            <dd className="mt-1">Geen rechten maar een vlag: alleen deze leden kunnen een avondetenkaart kopen.</dd>
          </div>
        </dl>
      </section>

      <section className="surface-card">
        <h2 className="text-lg font-semibold text-slate-900">Nieuw lokaal account (zonder Google)</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Voor wie geen account in de Google Workspace heeft. Gebruikersnaam: 3–32 tekens, kleine letters, cijfers, . _ -
          Wachtwoord minimaal 8 tekens.
        </p>
        <form onSubmit={(e) => void onCreate(e)} className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Gebruikersnaam</span>
            <input
              required
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-control mt-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Weergavenaam</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="optioneel"
              className="input-control mt-1.5"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Wachtwoord</span>
            <input
              required
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              className="input-control mt-1.5"
            />
          </label>
          <div className="rounded-xl border border-slate-100 bg-slate-50/90 p-4 sm:col-span-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Rechten</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className={`mt-0.5 shrink-0 ${checkbox}`}
                  checked={newIsOperator}
                  onChange={(e) => setNewIsOperator(e.target.checked)}
                />
                <span>Kraammedewerker</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className={`mt-0.5 shrink-0 ${checkbox}`}
                  checked={newIsAdmin}
                  onChange={(e) => setNewIsAdmin(e.target.checked)}
                />
                <span>Beheerder</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className={`mt-0.5 shrink-0 ${checkbox}`}
                  checked={newMustChangePassword}
                  onChange={(e) => setNewMustChangePassword(e.target.checked)}
                />
                <span>Wachtwoord wijzigen bij eerste login verplicht</span>
              </label>
            </div>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={creating} className="btn-primary">
              {creating ? 'Bezig…' : 'Account aanmaken'}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Alle gebruikers</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op naam, e-mail of login…"
              className="input-control min-h-10 w-64 max-w-full"
              aria-label="Zoek gebruikers"
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="select-control min-h-10">
              <option value="active">Alleen actief</option>
              <option value="all">Inclusief gedeactiveerd{inactiveCount > 0 ? ` (${inactiveCount})` : ''}</option>
            </select>
          </div>
        </div>
        <p className="px-6 pt-3 text-xs text-slate-500">
          Rechten en de jeugd-vlag kun je voor elk account direct aanvinken, ook voor Google-accounts. Je eigen rechten en
          status zijn vergrendeld.
        </p>
        {listQuery.isLoading ? (
          <p className="px-6 py-10 text-sm text-slate-600">Laden…</p>
        ) : visibleRows.length === 0 ? (
          <p className="px-6 py-10 text-sm text-slate-600">Geen gebruikers gevonden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Naam</th>
                  <th className="px-4 py-3.5">Login / e-mail</th>
                  <th className="px-4 py-3.5">Kaarten</th>
                  <th className="px-4 py-3.5" title="Kraampagina en beheer">
                    Kraam
                  </th>
                  <th className="px-4 py-3.5">Beheerder</th>
                  <th className="px-4 py-3.5" title="Mag avondetenkaart kopen">
                    Matroos (jeugd)
                  </th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((r) => {
                  const isMe = me?.id === r.id
                  const locked = busyId === r.id || isMe
                  const expanded = expandedUser === r.id
                  return (
                    <Fragment key={r.id}>
                      <tr className={`transition-colors hover:bg-slate-50/90 ${r.is_active ? '' : 'bg-slate-50 text-slate-500'}`}>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-slate-900">{r.name}</div>
                          <div className="text-xs text-slate-500">
                            {r.auth_kind === 'local' ? 'Lokaal' : 'Google'} · #{r.id}
                            {isMe ? ' · jij' : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          {r.auth_kind === 'local' ? <span className="font-mono">{r.local_username}</span> : r.email}
                          {r.must_change_password ? (
                            <div className="text-xs text-amber-800">Wachtwoordwissel verplicht</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => setExpandedUser(expanded ? null : r.id)}
                            className="text-left text-sm font-semibold text-brand-700 hover:underline"
                            aria-expanded={expanded}
                          >
                            {r.cards_total === 0
                              ? 'Geen kaarten'
                              : `${r.cards_total} ${r.cards_total === 1 ? 'kaart' : 'kaarten'} · ${r.knipjes_total} knipjes`}
                          </button>
                          {r.pending_requests > 0 ? (
                            <div className="text-xs text-amber-800">
                              {r.pending_requests} {r.pending_requests === 1 ? 'betaling' : 'betalingen'} open
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            className={checkbox}
                            checked={r.is_operator}
                            disabled={locked}
                            onChange={(e) => void toggleRole(r, 'is_operator', e.target.checked)}
                            aria-label={`Kraammedewerker voor ${r.name}`}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            className={checkbox}
                            checked={r.is_admin}
                            disabled={locked}
                            onChange={(e) => void toggleRole(r, 'is_admin', e.target.checked)}
                            aria-label={`Beheerder voor ${r.name}`}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            className={checkbox}
                            checked={r.is_matroos_jeugd}
                            disabled={busyId === r.id}
                            onChange={(e) => void toggleMatroosJeugd(r, e.target.checked)}
                            aria-label={`Matroos (jeugd) voor ${r.name}`}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          {r.is_active ? (
                            <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-900">Actief</span>
                          ) : (
                            <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              Gedeactiveerd{r.disabled_at ? ` ${formatDateNL(r.disabled_at)}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                            {r.auth_kind === 'local' ? (
                              <button
                                type="button"
                                onClick={() => startEdit(r)}
                                className="text-sm font-semibold text-brand-700 hover:underline"
                              >
                                Wachtwoord
                              </button>
                            ) : null}
                            {!isMe ? (
                              <button
                                type="button"
                                disabled={busyId === r.id}
                                onClick={() => void toggleActive(r)}
                                className={`text-sm font-semibold hover:underline disabled:opacity-50 ${
                                  r.is_active ? 'text-red-700' : 'text-brand-700'
                                }`}
                              >
                                {r.is_active ? 'Deactiveren' : 'Activeren'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-slate-50/70">
                          <td colSpan={8} className="px-4 py-4">
                            <UserCardsRow
                              userId={r.id}
                              onChanged={async () => {
                                await queryClient.invalidateQueries({ queryKey: queryKeys.admin.userCards(r.id) })
                                await invalidateUsers()
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editId !== null ? (
        <div
          className="fixed inset-0 z-[280] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-local-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="edit-local-title" className="text-lg font-bold text-slate-900">
              Wachtwoord lokaal account
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Laat het wachtwoord leeg om het niet te wijzigen. Na een nieuw wachtwoord moet de gebruiker het bij de volgende
              login zelf aanpassen.
            </p>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-700">Nieuw wachtwoord</span>
              <input
                type="password"
                autoComplete="new-password"
                value={editPwd}
                onChange={(e) => setEditPwd(e.target.value)}
                minLength={editPwd ? 8 : 0}
                className="input-control mt-1.5"
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editMustChangePassword}
                onChange={(e) => setEditMustChangePassword(e.target.checked)}
              />
              Wachtwoord wijzigen bij eerstvolgende login verplicht
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setEditId(null)} className="btn-secondary">
                Annuleren
              </button>
              <button
                type="button"
                disabled={savingId !== null || (editPwd.length > 0 && editPwd.length < 8)}
                onClick={() => void saveEdit()}
                className="btn-primary"
              >
                {savingId !== null ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
