import { createContext } from 'react'
import type * as api from './api'

export type AuthState = {
  user: api.User | null
  pendingCardRequests: number
  tikkieWarnings: api.TikkieWarning[]
  paymentAmountEUR: string
  csrf: string
  loading: boolean
  refresh: () => Promise<void>
}

export const AuthSessionContext = createContext<AuthState | null>(null)
