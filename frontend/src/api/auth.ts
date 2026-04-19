import { apiJson, apiVoid } from '../apiRequest'
import { meResponseSchema } from '../api.schemas'
import type { MeResponse } from './types'

export async function getMe(): Promise<MeResponse> {
  return apiJson('/api/me', meResponseSchema)
}

export async function localLogin(csrf: string, username: string, password: string): Promise<void> {
  await apiVoid('/api/auth/local/login', {
    method: 'POST',
    csrf,
    body: { username: username.trim(), password },
  })
}

export async function changeOwnPassword(
  csrf: string,
  body: { current_password: string; new_password: string },
): Promise<void> {
  await apiVoid('/api/account/password', { method: 'POST', csrf, body })
}

export async function logout(csrf: string): Promise<void> {
  await apiVoid('/api/logout', { method: 'POST', csrf })
}
