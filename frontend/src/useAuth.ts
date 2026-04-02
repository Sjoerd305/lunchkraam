import { useContext } from 'react'
import { AuthSessionContext, type AuthState } from './authSessionContext'

export function useAuth(): AuthState {
  const ctx = useContext(AuthSessionContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
