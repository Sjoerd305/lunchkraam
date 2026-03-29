import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

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

type Panel =
  | { kind: 'alert'; title: string; message: string; variant: AlertVariant }
  | {
      kind: 'confirm'
      title: string
      message: string
      confirmLabel: string
      cancelLabel: string
      tone: ConfirmTone
    }

type DialogContextValue = {
  alert: (opts: AlertOptions) => Promise<void>
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function AlertDialogProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const alertResolveRef = useRef<(() => void) | null>(null)
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null)

  const closeAlert = useCallback(() => {
    alertResolveRef.current?.()
    alertResolveRef.current = null
    setPanel(null)
  }, [])

  const finishConfirm = useCallback((ok: boolean) => {
    confirmResolveRef.current?.(ok)
    confirmResolveRef.current = null
    setPanel(null)
  }, [])

  const alertFn = useCallback((opts: AlertOptions) => {
    return new Promise<void>((resolve) => {
      confirmResolveRef.current = null
      alertResolveRef.current = resolve
      setPanel({
        kind: 'alert',
        title: opts.title,
        message: opts.message,
        variant: opts.variant ?? 'success',
      })
    })
  }, [])

  const confirmFn = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      alertResolveRef.current = null
      confirmResolveRef.current = resolve
      setPanel({
        kind: 'confirm',
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Bevestigen',
        cancelLabel: opts.cancelLabel ?? 'Annuleren',
        tone: opts.tone ?? 'brand',
      })
    })
  }, [])

  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (panel.kind === 'alert') closeAlert()
      else finishConfirm(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [panel, closeAlert, finishConfirm])

  const onBackdrop = useCallback(() => {
    if (!panel) return
    if (panel.kind === 'alert') closeAlert()
    else finishConfirm(false)
  }, [panel, closeAlert, finishConfirm])

  return (
    <DialogContext.Provider value={{ alert: alertFn, confirm: confirmFn }}>
      {children}
      {panel ? (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-900/55 p-4 sm:items-center"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onBackdrop()
          }}
          role="presentation"
        >
          {panel.kind === 'alert' ? (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="alert-dialog-title"
              aria-describedby="alert-dialog-desc"
              className={`mx-auto w-full max-w-md rounded-2xl border-2 bg-white p-6 shadow-2xl sm:max-h-[min(90vh,32rem)] ${
                panel.variant === 'error' ? 'border-red-200' : 'border-brand-200'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="alert-dialog-title" className="text-lg font-bold text-slate-900">
                {panel.title}
              </h2>
              <p
                id="alert-dialog-desc"
                className="mt-3 max-h-[50vh] overflow-y-auto text-sm leading-relaxed text-slate-600"
              >
                {panel.message}
              </p>
              <button
                type="button"
                autoFocus
                onClick={closeAlert}
                className={`mt-6 min-h-12 w-full rounded-xl py-3.5 text-sm font-semibold text-white shadow-md active:opacity-90 ${
                  panel.variant === 'error'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-brand-700 hover:bg-brand-800'
                }`}
              >
                OK
              </button>
            </div>
          ) : (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-desc"
              className="mx-auto w-full max-w-md rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-2xl sm:max-h-[min(90vh,32rem)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-900">
                {panel.title}
              </h2>
              <p
                id="confirm-dialog-desc"
                className="mt-3 max-h-[50vh] overflow-y-auto text-sm leading-relaxed text-slate-600"
              >
                {panel.message}
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => finishConfirm(false)}
                  className="btn-secondary min-h-12 w-full rounded-xl py-3 sm:w-auto"
                >
                  {panel.cancelLabel}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => finishConfirm(true)}
                  className={`min-h-12 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-md active:opacity-90 sm:w-auto ${
                    panel.tone === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-brand-700 hover:bg-brand-800'
                  }`}
                >
                  {panel.confirmLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </DialogContext.Provider>
  )
}

export function useAlertDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useAlertDialog must be used within AlertDialogProvider')
  return ctx
}
