import { useCallback, useEffect, useState, type FormEvent } from 'react'
import * as api from '../../api'
import { useAuth } from '../../AuthContext'
import { useAlertDialog } from '../../components/AlertDialogProvider'

export function AdminSettingsPage() {
  const { csrf } = useAuth()
  const { alert } = useAlertDialog()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tikkieUrl, setTikkieUrl] = useState('')
  const [effective, setEffective] = useState('')
  const [envFallback, setEnvFallback] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api.getAdminSettings()
      setTikkieUrl(s.tikkie_url)
      setEffective(s.tikkie_url_effective)
      setEnvFallback(s.tikkie_url_env_config)
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : 'Laden mislukt.'
      void alert({ title: 'Instellingen laden mislukt', message: msg, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [alert])

  useEffect(() => {
    void load()
  }, [load])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const s = await api.patchAdminSettings(csrf, tikkieUrl)
      setTikkieUrl(s.tikkie_url)
      setEffective(s.tikkie_url_effective)
      setEnvFallback(s.tikkie_url_env_config)
      await alert({ title: 'Opgeslagen', message: 'Tikkie-link is bijgewerkt.', variant: 'success' })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-slate-600">Laden…</p>
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Betaling (Tikkie)</h2>
        <p className="mt-2 text-slate-600">
          De link op <strong>Kaart kopen</strong> voor leden. Laat het veld leeg om de waarde uit{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">TIKKIE_URL</code> in de serverconfig te
          gebruiken (handig als fallback na deploy).
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Tikkie-URL in database</span>
            <input
              type="url"
              value={tikkieUrl}
              onChange={(e) => setTikkieUrl(e.target.value)}
              placeholder="https://tikkie.me/pay/…"
              className="mt-1 w-full max-w-2xl rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Alleen <code>http(s)://</code> met host. Leeg = gebruik omgevingsvariabele als die gezet is.
            </span>
          </label>

          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            <p>
              <span className="font-medium text-slate-800">Actief voor leden:</span>{' '}
              {effective ? (
                <a
                  href={effective}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-brand-700 underline"
                >
                  {effective}
                </a>
              ) : (
                <span className="text-slate-500">(geen — configureer hier of TIKKIE_URL)</span>
              )}
            </p>
            {envFallback ? (
              <p className="mt-2 text-xs text-slate-500">
                Omgeving <code>TIKKIE_URL</code>:{' '}
                <span className="break-all font-mono">{envFallback}</span>
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </form>
      </section>
    </div>
  )
}
