import { useCallback, useEffect, useState, type FormEvent } from 'react'
import * as api from '../../api'
import { useAuth } from '../../AuthContext'
import { useAlertDialog } from '../../components/AlertDialogProvider'

export function AdminLocalUsersPage() {
  const { csrf } = useAuth()
  const { alert } = useAlertDialog()
  const [rows, setRows] = useState<api.AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [newIsOperator, setNewIsOperator] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [editPwd, setEditPwd] = useState('')
  const [editAdmin, setEditAdmin] = useState(false)
  const [editOp, setEditOp] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [matroosJeugdBusyId, setMatroosJeugdBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.getAdminUsers()
      setRows(list)
    } catch (e) {
      setRows([])
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      void alert({ title: 'Gebruikers laden mislukt', message: msg, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [alert])

  useEffect(() => {
    void load()
  }, [load])

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
      })
      setUsername('')
      setDisplayName('')
      setPassword('')
      setNewIsAdmin(false)
      setNewIsOperator(true)
      await load()
      await alert({
        title: 'Account aangemaakt',
        message: 'Het jeugd-/lokaal account kan nu inloggen met gebruikersnaam en wachtwoord.',
        variant: 'success',
      })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Aanmaken mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  function startEdit(r: api.AdminUserRow) {
    if (r.auth_kind !== 'local') return
    setEditId(r.id)
    setEditPwd('')
    setEditAdmin(r.is_admin)
    setEditOp(r.is_operator)
  }

  async function toggleMatroosJeugd(r: api.AdminUserRow, next: boolean) {
    setMatroosJeugdBusyId(r.id)
    try {
      await api.patchUserMatroosJeugd(csrf, r.id, next)
      await load()
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setMatroosJeugdBusyId(null)
    }
  }

  async function saveEdit() {
    if (editId === null) return
    setSavingId(editId)
    try {
      await api.patchLocalUser(csrf, editId, {
        password: editPwd,
        is_admin: editAdmin,
        is_operator: editOp,
      })
      setEditId(null)
      await load()
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
        <h2 className="text-lg font-semibold text-slate-900">
          Nieuw lokaal account (jeugd / zonder Google)
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Gebruikersnaam alleen kleine letters, cijfers en . _ — minimaal 8 tekens wachtwoord. Vink{' '}
          <strong className="font-semibold text-slate-800">Matroos</strong> aan om knipjes aan de kraam af te
          mogen nemen. <strong className="font-semibold text-slate-800">Beheerder</strong> geeft toegang tot dit
          admin-gedeelte.
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
                  className="mt-0.5 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                  checked={newIsOperator}
                  onChange={(e) => setNewIsOperator(e.target.checked)}
                />
                <span>Matroos (knipjes afnemen aan kraam)</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                  checked={newIsAdmin}
                  onChange={(e) => setNewIsAdmin(e.target.checked)}
                />
                <span>Beheerder (admin)</span>
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
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Alle gebruikers</h2>
        </div>
        {loading ? (
          <p className="px-6 py-10 text-sm text-slate-600">Laden…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-5 py-3.5">ID</th>
                  <th className="px-5 py-3.5">Naam</th>
                  <th className="px-5 py-3.5">Login / e-mail</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Matroos</th>
                  <th className="whitespace-nowrap px-5 py-3.5" title="Mag avondetenkaart kopen">
                    Jeugd avondeten
                  </th>
                  <th className="px-5 py-3.5">Admin</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50/90">
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-slate-600">{r.id}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">{r.name}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {r.auth_kind === 'local' ? (
                        <span className="font-mono">{r.local_username}</span>
                      ) : (
                        r.email
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {r.auth_kind === 'local' ? 'Lokaal' : 'Google'}
                    </td>
                    <td className="px-5 py-3.5">{r.is_operator ? 'Ja' : '—'}</td>
                    <td className="px-5 py-3.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                        checked={r.is_matroos_jeugd}
                        disabled={matroosJeugdBusyId !== null}
                        onChange={(e) => void toggleMatroosJeugd(r, e.target.checked)}
                        aria-label={`Matroos jeugd voor ${r.name}`}
                      />
                    </td>
                    <td className="px-5 py-3.5">{r.is_admin ? 'Ja' : '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      {r.auth_kind === 'local' ? (
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                        >
                          Bewerken
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
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
              Lokaal account bewerken
            </h3>
            <p className="mt-2 text-sm text-slate-600">Laat wachtwoord leeg om het niet te wijzigen.</p>
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
              <input type="checkbox" checked={editOp} onChange={(e) => setEditOp(e.target.checked)} />
              Matroos
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editAdmin} onChange={(e) => setEditAdmin(e.target.checked)} />
              Beheerder
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
