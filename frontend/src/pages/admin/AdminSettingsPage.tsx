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
  const [tikkieUrlAvondeten, setTikkieUrlAvondeten] = useState('')
  const [effective, setEffective] = useState('')
  const [effectiveAvondeten, setEffectiveAvondeten] = useState('')
  const [envFallback, setEnvFallback] = useState('')
  const [envFallbackAvondeten, setEnvFallbackAvondeten] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api.getAdminSettings()
      setTikkieUrl(s.tikkie_url)
      setTikkieUrlAvondeten(s.tikkie_url_avondeten)
      setEffective(s.tikkie_url_effective)
      setEffectiveAvondeten(s.tikkie_url_avondeten_effective)
      setEnvFallback(s.tikkie_url_env_config)
      setEnvFallbackAvondeten(s.tikkie_url_avondeten_env_config)
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
      const s = await api.patchAdminSettings(csrf, {
        tikkie_url: tikkieUrl,
        tikkie_url_avondeten: tikkieUrlAvondeten,
      })
      setTikkieUrl(s.tikkie_url)
      setTikkieUrlAvondeten(s.tikkie_url_avondeten)
      setEffective(s.tikkie_url_effective)
      setEffectiveAvondeten(s.tikkie_url_avondeten_effective)
      setEnvFallback(s.tikkie_url_env_config)
      setEnvFallbackAvondeten(s.tikkie_url_avondeten_env_config)
      await alert({ title: 'Opgeslagen', message: 'Tikkie-links zijn bijgewerkt.', variant: 'success' })
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
          Aparte links voor de <strong>tostikaart</strong> en de <strong>avondetenkaart</strong> (ander bedrag).
          Laat een veld leeg om de server-fallback voor dat type te gebruiken.
        </p>
      </div>

      <section className="surface-card">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tostikaart</h3>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Tikkie-link (opgeslagen in deze app)</span>
              <input
                type="url"
                value={tikkieUrl}
                onChange={(e) => setTikkieUrl(e.target.value)}
                placeholder="https://tikkie.me/pay/…"
                className="input-control mt-1.5 max-w-2xl font-mono"
              />
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
                  <span className="text-slate-500">(geen — vul in of stel TIKKIE_URL op de server in)</span>
                )}
              </p>
              {envFallback ? (
                <p className="mt-2 text-xs text-slate-500">
                  Server-fallback (alleen-lezen):{' '}
                  <span className="break-all font-mono">{envFallback}</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Avondetenkaart</h3>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Tikkie-link voor avondeten (ander tarief)</span>
              <input
                type="url"
                value={tikkieUrlAvondeten}
                onChange={(e) => setTikkieUrlAvondeten(e.target.value)}
                placeholder="https://tikkie.me/pay/…"
                className="input-control mt-1.5 max-w-2xl font-mono"
              />
            </label>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
              <p>
                <span className="font-medium text-slate-800">Actief voor leden (matroos jeugd):</span>{' '}
                {effectiveAvondeten ? (
                  <a
                    href={effectiveAvondeten}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-brand-700 underline"
                  >
                    {effectiveAvondeten}
                  </a>
                ) : (
                  <span className="text-slate-500">
                    (geen — vul in of stel TIKKIE_URL_AVONDETEN op de server in)
                  </span>
                )}
              </p>
              {envFallbackAvondeten ? (
                <p className="mt-2 text-xs text-slate-500">
                  Server-fallback (alleen-lezen):{' '}
                  <span className="break-all font-mono">{envFallbackAvondeten}</span>
                </p>
              ) : null}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Alleen geldige <code className="rounded bg-slate-100 px-1">http(s)://</code>-URL met hostnaam. Leeg
            laten: dan geldt de waarde uit de serverconfiguratie voor dat type.
          </p>

          <button type="submit" disabled={saving} className="btn-primary px-5">
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </form>
      </section>
    </div>
  )
}
