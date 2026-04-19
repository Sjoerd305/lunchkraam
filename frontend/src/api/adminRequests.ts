import { apiJson, apiVoid } from '../apiRequest'
import { adminRequestsResponseSchema } from '../api.schemas'
import type { AdminRequest } from './types'

export async function getAdminRequests(): Promise<AdminRequest[]> {
  const payload = await apiJson('/api/admin/requests', adminRequestsResponseSchema)
  return payload.requests
}

export async function fulfillRequest(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/admin/requests/${id}/fulfill`, { method: 'POST', csrf })
}

export async function rejectAdminRequest(csrf: string, id: number): Promise<void> {
  await apiVoid(`/api/admin/requests/${id}/reject`, { method: 'POST', csrf })
}
