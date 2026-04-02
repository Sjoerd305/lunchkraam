import { useCallback, useEffect, useState, type ReactNode } from 'react'
import * as api from './api'
import { AuthSessionContext } from './authSessionContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null)
  const [pendingCardRequests, setPendingCardRequests] = useState(0)
  const [tikkieWarnings, setTikkieWarnings] = useState<api.TikkieWarning[]>([])
  const [paymentAmountEUR, setPaymentAmountEUR] = useState('15')
  const [csrf, setCsrf] = useState('')
  const [loading, setLoading] = useState(true)

  const applyMe = useCallback((data: api.MeResponse) => {
    setUser(data.user)
    setPendingCardRequests(data.pending_card_requests)
    setTikkieWarnings(data.tikkie_warnings)
    if (data.payment_amount_eur) setPaymentAmountEUR(data.payment_amount_eur)
    setCsrf(data.csrf_token)
    setLoading(false)
  }, [])

  const clearSession = useCallback(() => {
    setUser(null)
    setPendingCardRequests(0)
    setTikkieWarnings([])
    setCsrf('')
    setLoading(false)
  }, [])

  const refresh = useCallback(async () => {
    const data = await api.getMe()
    applyMe(data)
  }, [applyMe])

  useEffect(() => {
    let ignore = false
    api
      .getMe()
      .then((data) => {
        if (!ignore) applyMe(data)
      })
      .catch(() => {
        if (!ignore) clearSession()
      })
    return () => {
      ignore = true
    }
  }, [applyMe, clearSession])

  const value = {
    user,
    pendingCardRequests,
    tikkieWarnings,
    paymentAmountEUR,
    csrf,
    loading,
    refresh,
  }

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
}
