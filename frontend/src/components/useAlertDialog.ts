import { useContext } from 'react'
import { AlertDialogContext, type DialogContextValue } from './alertDialogContext'

export function useAlertDialog(): DialogContextValue {
  const ctx = useContext(AlertDialogContext)
  if (!ctx) throw new Error('useAlertDialog must be used within AlertDialogProvider')
  return ctx
}
