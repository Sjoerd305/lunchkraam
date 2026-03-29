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

type DialogContextValue = {
  alert: (opts: AlertOptions) => Promise<void>
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function AlertDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [variant, setVariant] = useState<AlertVariant>('success')
  const resolveRef = useRef<(() => void) | null>(null)

  const close = useCallback(() => {
    resolveRef.current?.()
    resolveRef.current = null
    setOpen(false)
  }, [])

  const alertFn = useCallback((opts: AlertOptions) => {
    return new Promise<void>((resolve) => {
      resolveRef.current = resolve
      setTitle(opts.title)
      setMessage(opts.message)
      setVariant(opts.variant ?? 'success')
      setOpen(true)
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  return (
    <DialogContext.Provider value={{ alert: alertFn }}>
      {children}
      {open ? (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-900/55 p-4 sm:items-center"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-desc"
            className={`mx-auto w-full max-w-md rounded-2xl border-2 bg-white p-6 shadow-2xl sm:max-h-[min(90vh,32rem)] ${
              variant === 'error' ? 'border-red-200' : 'border-brand-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="alert-dialog-title" className="text-lg font-bold text-slate-900">
              {title}
            </h2>
            <p
              id="alert-dialog-desc"
              className="mt-3 max-h-[50vh] overflow-y-auto text-sm leading-relaxed text-slate-600"
            >
              {message}
            </p>
            <button
              type="button"
              autoFocus
              onClick={close}
              className={`mt-6 min-h-12 w-full rounded-xl py-3.5 text-sm font-semibold text-white shadow-md active:opacity-90 ${
                variant === 'error'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-brand-700 hover:bg-brand-800'
              }`}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  )
}

export function useAlertDialog(): DialogContextValue['alert'] {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useAlertDialog must be used within AlertDialogProvider')
  return ctx.alert
}
