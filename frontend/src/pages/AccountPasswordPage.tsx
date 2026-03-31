import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import { useAuth } from '../AuthContext'
import { useAlertDialog } from '../components/AlertDialogProvider'

export function AccountPasswordPage() {
  const navigate = useNavigate()
  const { user, csrf, refresh } = useAuth()
  const { alert } = useAlertDialog()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      await alert({
        title: 'Wachtwoord te kort',
        message: 'Gebruik minimaal 8 tekens voor het nieuwe wachtwoord.',
        variant: 'error',
      })
      return
    }
    if (newPassword !== confirmPassword) {
      await alert({
        title: 'Wachtwoorden komen niet overeen',
        message: 'Controleer of beide nieuwe wachtwoorden exact gelijk zijn.',
        variant: 'error',
      })
      return
    }

    setSaving(true)
    try {
      await api.changeOwnPassword(csrf, {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      await refresh()
      await alert({
        title: 'Wachtwoord bijgewerkt',
        message: 'Je wachtwoord is aangepast.',
        variant: 'success',
      })
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Wachtwoord wijzigen mislukt.'
      await alert({ title: 'Mislukt', message: msg, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="surface-card mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-slate-900">Wachtwoord wijzigen</h1>
      <p className="mt-2 text-sm text-slate-600">
        {user?.must_change_password
          ? 'Voor dit account is een wachtwoordwijziging verplicht. Kies een nieuw wachtwoord om door te gaan.'
          : 'Wijzig hier je eigen wachtwoord.'}
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Huidig wachtwoord</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="input-control mt-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Nieuw wachtwoord</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input-control mt-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Herhaal nieuw wachtwoord</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-control mt-1.5"
          />
        </label>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Opslaan…' : 'Wachtwoord opslaan'}
        </button>
      </form>
    </section>
  )
}
