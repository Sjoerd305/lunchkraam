import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import * as api from './api'

type AuthState = {
  user: api.User | null
  pendingCardRequests: number
  tikkieWarnings: api.TikkieWarning[]
  paymentAmountEUR: string
  csrf: string
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null)
  const [pendingCardRequests, setPendingCardRequests] = useState(0)
  const [tikkieWarnings, setTikkieWarnings] = useState<api.TikkieWarning[]>([])
  const [paymentAmountEUR, setPaymentAmountEUR] = useState('15')
  const [csrf, setCsrf] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const data = await api.getMe()
    setUser(data.user)
    setPendingCardRequests(data.pending_card_requests)
    setTikkieWarnings(data.tikkie_warnings)
    if (data.payment_amount_eur) setPaymentAmountEUR(data.payment_amount_eur)
    setCsrf(data.csrf_token)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh().catch(() => {
      setUser(null)
      setPendingCardRequests(0)
      setTikkieWarnings([])
      setCsrf('')
      setLoading(false)
    })
  }, [refresh])

  const value: AuthState = {
    user,
    pendingCardRequests,
    tikkieWarnings,
    paymentAmountEUR,
    csrf,
    loading,
    refresh,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
