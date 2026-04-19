import { ApiError, apiJson, apiVoid } from '../apiRequest'
import { adminUsersResponseSchema, userEnvelopeSchema } from '../api.schemas'
import type { AdminUserRow, User } from './types'

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const payload = await apiJson('/api/admin/users', adminUsersResponseSchema)
  return payload.users
}

export async function patchUserMatroosJeugd(csrf: string, userId: number, isMatroosJeugd: boolean): Promise<void> {
  await apiVoid(`/api/admin/users/${userId}/matroos-jeugd`, {
    method: 'PATCH',
    csrf,
    body: { is_matroos_jeugd: isMatroosJeugd },
  })
}

export async function createLocalUser(
  csrf: string,
  body: {
    username: string
    name: string
    password: string
    is_admin: boolean
    is_operator: boolean
    must_change_password: boolean
  },
): Promise<User> {
  const payload = await apiJson('/api/admin/users/local', userEnvelopeSchema, {
    method: 'POST',
    csrf,
    body: {
      username: body.username.trim().toLowerCase(),
      name: body.name.trim(),
      password: body.password,
      is_admin: body.is_admin,
      is_operator: body.is_operator,
      must_change_password: body.must_change_password,
    },
  })
  const u = payload.user
  if (!u) throw new ApiError(500, 'error', 'Ongeldig antwoord.')
  return u
}

export async function patchLocalUser(
  csrf: string,
  id: number,
  body: { password: string; is_admin: boolean; is_operator: boolean; must_change_password: boolean },
): Promise<User | null> {
  const payload = await apiJson(`/api/admin/users/${id}/local`, userEnvelopeSchema, {
    method: 'PATCH',
    csrf,
    body,
  })
  return payload.user
}
