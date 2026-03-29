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
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Nieuw lokaal account (jeugd / zonder Google)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Gebruikersnaam alleen kleine letters, cijfers en . _ — minimaal 8 tekens wachtwoord. Vink{' '}
          <strong>Matroos</strong> aan om knipjes aan de kraam af te mogen nemen. <strong>Beheerder</strong> geeft
          toegang tot dit admin-gedeelte.
        </p>
        <form onSubmit={(e) => void onCreate(e)} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Gebruikersnaam</span>
            <input
              required
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Weergavenaam</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="optioneel"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
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
              className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={newIsOperator} onChange={(e) => setNewIsOperator(e.target.checked)} />
            Matroos (knipjes afnemen aan kraam)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
            Beheerder (admin)
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {creating ? 'Bezig…' : 'Account aanmaken'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Alle gebruikers</h2>
        {loading ? (
          <p className="text-slate-600">Laden…</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-md">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Naam</th>
                  <th className="px-4 py-3">Login / e-mail</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Matroos</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-slate-600">{r.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.auth_kind === 'local' ? (
                        <span className="font-mono">{r.local_username}</span>
                      ) : (
                        r.email
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.auth_kind === 'local' ? 'Lokaal' : 'Google'}
                    </td>
                    <td className="px-4 py-3">{r.is_operator ? 'Ja' : '—'}</td>
                    <td className="px-4 py-3">{r.is_admin ? 'Ja' : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {r.auth_kind === 'local' ? (
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="text-sm font-semibold text-brand-700 hover:underline"
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
              <span className="font-medium">Nieuw wachtwoord</span>
              <input
                type="password"
                autoComplete="new-password"
                value={editPwd}
                onChange={(e) => setEditPwd(e.target.value)}
                minLength={editPwd ? 8 : 0}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
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
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditId(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
              >
                Annuleren
              </button>
              <button
                type="button"
                disabled={savingId !== null || (editPwd.length > 0 && editPwd.length < 8)}
                onClick={() => void saveEdit()}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
