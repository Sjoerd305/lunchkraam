import { apiJson } from '../apiRequest'
import {
  adminDashboardResponseSchema,
  adminSalesStatsResponseSchema,
  yearsResponseSchema,
} from '../api.schemas'
import type { AdminDashboardStats, AdminSalesStats } from './types'

export async function getAdminSalesYears(): Promise<number[]> {
  const payload = await apiJson('/api/admin/sales-years', yearsResponseSchema)
  return payload.years.filter((y) => y > 0)
}

export async function getAdminSalesStats(year: number): Promise<AdminSalesStats> {
  const payload = await apiJson(`/api/admin/sales-stats?year=${year}`, adminSalesStatsResponseSchema)
  return payload.year > 0 ? payload : { ...payload, year }
}

export async function getOperatorSalesYears(): Promise<number[]> {
  const payload = await apiJson('/api/operator/sales-years', yearsResponseSchema)
  return payload.years.filter((y) => y > 0)
}

export async function getOperatorSalesStats(year: number): Promise<AdminSalesStats> {
  const payload = await apiJson(`/api/operator/sales-stats?year=${year}`, adminSalesStatsResponseSchema)
  return payload.year > 0 ? payload : { ...payload, year }
}

export async function getAdminDashboard(): Promise<AdminDashboardStats> {
  return apiJson('/api/admin/dashboard', adminDashboardResponseSchema)
}
