import { apiJson } from '../apiRequest'
import { adminSettingsResponseSchema } from '../api.schemas'
import type { AdminAppSettings, AdminAppSettingsPatch } from './types'

export async function getAdminSettings(): Promise<AdminAppSettings> {
  return apiJson('/api/admin/settings', adminSettingsResponseSchema)
}

export async function patchAdminSettings(csrf: string, body: AdminAppSettingsPatch): Promise<AdminAppSettings> {
  return apiJson('/api/admin/settings', adminSettingsResponseSchema, { method: 'PATCH', csrf, body })
}
