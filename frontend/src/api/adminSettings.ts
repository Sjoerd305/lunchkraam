import { apiJson } from '../apiRequest'
import { adminSettingsResponseSchema } from '../api.schemas'
import type { AdminAppSettings } from './types'

export async function getAdminSettings(): Promise<AdminAppSettings> {
  return apiJson('/api/admin/settings', adminSettingsResponseSchema)
}

export async function patchAdminSettings(
  csrf: string,
  body: { tikkie_url: string; tikkie_url_avondeten: string },
): Promise<AdminAppSettings> {
  return apiJson('/api/admin/settings', adminSettingsResponseSchema, {
    method: 'PATCH',
    csrf,
    body: {
      tikkie_url: body.tikkie_url,
      tikkie_url_avondeten: body.tikkie_url_avondeten,
    },
  })
}
