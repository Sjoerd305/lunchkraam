import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import * as api from '../../api'
import { useAuth } from '../../useAuth'
import { useAlertDialog } from '../../components/useAlertDialog'
import { useQueryErrorAlert } from '../../hooks/useQueryErrorAlert'
import { queryKeys } from '../../queryKeys'
import { formatDateNL } from '../../utils/cardTransactionLabels'

type FormState = api.AdminAppSettingsPatch

const emptyForm: FormState = {
  tikkie_url: '',
  tikkie_url_avondeten: '',
  payment_amount_eur: '',
  payment_amount_avondeten_eur: '',
  bank_transfer_instructions: '',
}

function toForm(s: api.AdminAppSettings): FormState {
  return {
    tikkie_url: s.tikkie_url,
    tikkie_url_avondeten: s.tikkie_url_avondeten,
    payment_amount_eur: s.payment_amount_eur,
    payment_amount_avondeten_eur: s.payment_amount_avondeten_eur,
    bank_transfer_instructions: s.bank_transfer_instructions,
  }
}

type TikkieTone = 'ok' | 'warn' | 'expired' | 'none'

function tikkieStatus(expiresAt: string, setAt: string): { text: string; tone: TikkieTone } {
  if (!expiresAt) {
    return { text: 'Geen vervaldatum bekend: de link komt uit de serverconfiguratie of is nooit hier gezet.', tone: 'none' }
  }
  const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  const base = `Ingesteld op ${formatDateNL(setAt)}, verloopt op ${formatDateNL(expiresAt)}`
  if (days < 0) return { text: `${base} (verlopen)`, tone: 'expired' }
  if (days <= 2) return { text: `${base} (nog ${days} ${days === 1 ? 'dag' : 'dagen'})`, tone: 'warn' }
  return { text: `${base} (nog ${days} dagen)`, tone: 'ok' }
}

const toneClass: Record<TikkieTone, string> = {
  expired: 'text-red-700',
  warn: 'text-amber-800',
  ok: 'text-brand-800',
  none: 'text-slate-500',
}

function EffectiveLine({ label, value, env, isUrl }: { label: string; value: string; env: string; isUrl?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
      <p>
        <span className="font-medium text-slate-800">{label}:</span>{' '}
        {value ? (
          isUrl ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className="break-all text-brand-700 underline">
              {value}
            </a>
          ) : (
            <span className="whitespace-pre-wrap break-words">{value}</span>
          )
        ) : (
          <span className="text-slate-500">(niets ingesteld)</span>
        )}
      </p>
      {env ? (
        <p className="mt-2 text-xs text-slate-500">
          Server-fallback uit <code className="rounded bg-slate-100 px-1">.env</code>:{' '}
          <span className="break-all font-mono">{env}</span>
        </p>
      ) : null}
    </div>
  )
}

export function AdminSettingsPage() {
  const { csrf, refresh } = useAuth()
  const { alert } = useAlertDialog()
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: queryKeys.admin.settings,
    queryFn: () => api.getAdminSettings(),
  })
  useQueryErrorAlert(settingsQuery, { title: 'Instellingen laden mislukt', alert })

  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    if (settingsQuery.data) setForm(toForm(settingsQuery.data))
  }, [settingsQuery.data])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const s = await api.patchAdminSettings(csrf, form)
      queryClient.setQueryData(queryKeys.admin.settings, s)
      setForm(toForm(s))
      await refresh()
      await alert({ title: 'Opgeslagen', message: 'De instellingen zijn bijgewerkt.', variant: 'success' })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Opslaan mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const current = settingsQuery.data
  if (settingsQuery.isLoading || !current) {
    return <p className="text-slate-600">Laden…</p>
  }

  const tostiTikkie = tikkieStatus(current.tikkie_url_expires_at, current.tikkie_url_set_at)
  const avondetenTikkie = tikkieStatus(current.tikkie_url_avondeten_expires_at, current.tikkie_url_avondeten_set_at)

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Instellingen</h2>
        <p className="mt-2 text-slate-600">
          Wat je hier invult gaat vóór de waarde uit de serverconfiguratie. Laat een veld leeg om die fallback te gebruiken.
        </p>
      </div>

      <section className="surface-card space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Prijzen</h3>
          <p className="mt-1 text-sm text-slate-600">
            Geaccordeerde verkopen leggen de prijs van dat moment vast; een wijziging raakt alleen nieuwe verkopen.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Tostikaart (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.payment_amount_eur}
              onChange={(e) => set('payment_amount_eur', e.target.value)}
              placeholder={current.payment_amount_eur_env_config || '15'}
              className="input-control mt-1.5 max-w-xs"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Actief voor leden: <strong>€{current.payment_amount_eur_effective || '—'}</strong>
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Avondetenkaart (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.payment_amount_avondeten_eur}
              onChange={(e) => set('payment_amount_avondeten_eur', e.target.value)}
              placeholder={current.payment_amount_avondeten_eur_env_config || '12'}
              className="input-control mt-1.5 max-w-xs"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Actief voor leden: <strong>€{current.payment_amount_avondeten_eur_effective || '—'}</strong>
            </span>
          </label>
        </div>
      </section>

      <section className="surface-card space-y-8">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Betaling via Tikkie</h3>
          <p className="mt-1 text-sm text-slate-600">
            Een Tikkie-link is {current.tikkie_validity_days} dagen geldig. Kraammedewerkers en beheerders krijgen twee dagen
            vooraf een waarschuwing bij inloggen.
          </p>
        </div>
        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tostikaart</h4>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Tikkie-link</span>
            <input
              type="url"
              value={form.tikkie_url}
              onChange={(e) => set('tikkie_url', e.target.value)}
              placeholder="https://tikkie.me/pay/…"
              className="input-control mt-1.5 max-w-2xl font-mono"
            />
          </label>
          <p className={`text-sm ${toneClass[tostiTikkie.tone]}`}>{tostiTikkie.text}</p>
          <EffectiveLine label="Actief voor leden" value={current.tikkie_url_effective} env={current.tikkie_url_env_config} isUrl />
        </div>
        <div className="space-y-4 border-t border-slate-100 pt-6">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Avondetenkaart</h4>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Tikkie-link (ander bedrag)</span>
            <input
              type="url"
              value={form.tikkie_url_avondeten}
              onChange={(e) => set('tikkie_url_avondeten', e.target.value)}
              placeholder="https://tikkie.me/pay/…"
              className="input-control mt-1.5 max-w-2xl font-mono"
            />
          </label>
          <p className={`text-sm ${toneClass[avondetenTikkie.tone]}`}>{avondetenTikkie.text}</p>
          <EffectiveLine
            label="Actief voor leden met de vlag matroos (jeugd)"
            value={current.tikkie_url_avondeten_effective}
            env={current.tikkie_url_avondeten_env_config}
            isUrl
          />
        </div>
      </section>

      <section className="surface-card space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Overschrijven</h3>
          <p className="mt-1 text-sm text-slate-600">
            Tekst die leden zien onder "Overschrijven" op Kaart kopen, bijvoorbeeld rekeningnummer, naam en omschrijving.
          </p>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Instructies</span>
          <textarea
            value={form.bank_transfer_instructions}
            onChange={(e) => set('bank_transfer_instructions', e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={'NL00 BANK 0123 4567 89\nt.n.v. Maasgroep 18\nOmschrijving: tostikaart + je naam'}
            className="input-control mt-1.5 max-w-2xl"
          />
        </label>
        <EffectiveLine
          label="Actief voor leden"
          value={current.bank_transfer_instructions_effective}
          env={current.bank_transfer_instructions_env_config}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary px-5">
          {saving ? 'Opslaan…' : 'Alles opslaan'}
        </button>
        <button type="button" disabled={saving} onClick={() => setForm(toForm(current))} className="btn-secondary">
          Wijzigingen weggooien
        </button>
      </div>
    </form>
  )
}
