import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import * as api from '../api'
import { queryKeys } from '../queryKeys'

export type UseAdminSalesYearsSelectOptions = {
  isOperatorOnly: boolean
  /** Typically `Boolean(user)`. */
  enabled: boolean
  /**
   * When loading the sales-years list fails. Safe to pass an inline function:
   * the latest callback is always invoked via a ref.
   */
  onYearsError?: (message: string) => void
}

/**
 * Shared admin/operator pattern: fetch sales years, keep a selected year in sync
 * with the list, and reset the calendar year when the list request fails.
 */
export function useAdminSalesYearsSelect(options: UseAdminSalesYearsSelectOptions): {
  yearsQuery: UseQueryResult<number[], Error>
  year: number | null
  setYear: Dispatch<SetStateAction<number | null>>
} {
  const { isOperatorOnly, enabled, onYearsError } = options
  const onYearsErrorRef = useRef(onYearsError)
  onYearsErrorRef.current = onYearsError

  const yearsQuery = useQuery({
    queryKey: queryKeys.admin.salesYears(isOperatorOnly),
    queryFn: () => (isOperatorOnly ? api.getOperatorSalesYears() : api.getAdminSalesYears()),
    enabled,
  })

  const [year, setYear] = useState<number | null>(null)

  useEffect(() => {
    if (!yearsQuery.data) return
    const ys = yearsQuery.data
    setYear((prev) => {
      if (prev !== null && ys.includes(prev)) return prev
      return ys[0] ?? new Date().getFullYear()
    })
  }, [yearsQuery.data])

  useEffect(() => {
    if (!yearsQuery.isError || !yearsQuery.error) return
    setYear(new Date().getFullYear())
    const msg =
      yearsQuery.error instanceof api.ApiError ? yearsQuery.error.message : 'Laden mislukt.'
    onYearsErrorRef.current?.(msg)
  }, [yearsQuery.isError, yearsQuery.error])

  return { yearsQuery, year, setYear }
}
