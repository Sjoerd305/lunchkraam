import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import * as api from '../api'
import { queryKeys } from '../queryKeys'

export type EmptySalesYearsListBehavior = 'resetSelectionToCurrentYear' | 'keepPreviousOrNow'

export type UseAdminSalesYearsSelectOptions = {
  isOperatorOnly: boolean
  /** Typically `Boolean(user)`. */
  enabled: boolean
  /**
   * When loading the sales-years list fails. Safe to pass an inline function:
   * the latest callback is always invoked via a ref.
   */
  onYearsError?: (message: string) => void
  /**
   * When the API returns an empty year list: keep the previous selection (or now)
   * — used by admin-only charts — or reset to the current calendar year (default).
   */
  emptyYearsListBehavior?: EmptySalesYearsListBehavior
}

/**
 * Shared admin/operator pattern: fetch sales years, keep a selected year in sync
 * with the list, and on list load failure reset to the current calendar year.
 * Use `emptyYearsListBehavior: 'keepPreviousOrNow'` when an empty API year list
 * must not discard an existing selection (e.g. admin-only charts).
 */
export function useAdminSalesYearsSelect(options: UseAdminSalesYearsSelectOptions): {
  yearsQuery: UseQueryResult<number[], Error>
  year: number | null
  setYear: Dispatch<SetStateAction<number | null>>
} {
  const { isOperatorOnly, enabled, onYearsError, emptyYearsListBehavior } = options
  const onYearsErrorRef = useRef(onYearsError)

  useEffect(() => {
    onYearsErrorRef.current = onYearsError
  }, [onYearsError])

  const yearsQuery = useQuery({
    queryKey: queryKeys.admin.salesYears(isOperatorOnly),
    queryFn: () => (isOperatorOnly ? api.getOperatorSalesYears() : api.getAdminSalesYears()),
    enabled,
  })

  const [year, setYear] = useState<number | null>(null)

  useEffect(() => {
    if (!yearsQuery.data) return
    const ys = yearsQuery.data
    const yNow = new Date().getFullYear()

    if (ys.length === 0 && emptyYearsListBehavior === 'keepPreviousOrNow') {
      setYear((prev) => prev ?? yNow)
      return
    }

    setYear((prev) => {
      if (prev !== null && ys.includes(prev)) return prev
      return ys[0] ?? yNow
    })
  }, [yearsQuery.data, emptyYearsListBehavior])

  useEffect(() => {
    if (!yearsQuery.isError || !yearsQuery.error) return
    setYear(new Date().getFullYear())
    const msg =
      yearsQuery.error instanceof api.ApiError ? yearsQuery.error.message : 'Laden mislukt.'
    onYearsErrorRef.current?.(msg)
  }, [yearsQuery.isError, yearsQuery.error])

  return { yearsQuery, year, setYear }
}
