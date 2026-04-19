import { useEffect } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import * as api from '../api'
import type { AlertOptions } from '../components/alertDialogContext'

type AlertFn = (opts: AlertOptions) => Promise<void>

/** Shows a single error alert when a TanStack Query enters the error state (e.g. failed load). */
export function useQueryErrorAlert(
  query: Pick<UseQueryResult<unknown, unknown>, 'isError' | 'error'>,
  opts: { title: string; alert: AlertFn; fallbackMessage?: string },
): void {
  const { title, alert, fallbackMessage = 'Laden mislukt.' } = opts
  useEffect(() => {
    if (!query.isError || !query.error) return
    const msg = query.error instanceof api.ApiError ? query.error.message : fallbackMessage
    void alert({ title, message: msg, variant: 'error' })
  }, [query.isError, query.error, alert, title, fallbackMessage])
}
