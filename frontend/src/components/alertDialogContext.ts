import { createContext } from 'react'

export type AlertVariant = 'success' | 'error'

export type AlertOptions = {
  title: string
  message: string
  variant?: AlertVariant
}

export type ConfirmTone = 'brand' | 'danger'

export type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Primary button style */
  tone?: ConfirmTone
}

export type DialogContextValue = {
  alert: (opts: AlertOptions) => Promise<void>
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

export const AlertDialogContext = createContext<DialogContextValue | null>(null)
