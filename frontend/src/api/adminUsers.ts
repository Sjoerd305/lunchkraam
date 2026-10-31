import { ApiError, apiJson, apiVoid } from '../apiRequest'
import { adminUsersResponseSchema, cardsResponseSchema, userEnvelopeSchema } from '../api.schemas'
import type { AdminUserRow, Card, User } from './types'

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

/** Rechten voor elk account (Google of lokaal); je eigen account kan niet worden gewijzigd. */
export async function patchUserRoles(
  csrf: string,
  userId: number,
  body: { is_admin: boolean; is_operator: boolean },
): Promise<void> {
  await apiVoid(`/api/admin/users/${userId}/roles`, { method: 'PATCH', csrf, body })
}

/** Account (de)activeren; gedeactiveerde accounts kunnen niet inloggen. */
export async function patchUserActive(csrf: string, userId: number, isActive: boolean): Promise<void> {
  await apiVoid(`/api/admin/users/${userId}/active`, { method: 'PATCH', csrf, body: { is_active: isActive } })
}

export async function getAdminUserCards(userId: number): Promise<Card[]> {
  const payload = await apiJson(`/api/admin/users/${userId}/cards`, cardsResponseSchema)
  return payload.cards
}

/**
 * Lokaal account voorbereiden op Google: bij de eerste Google-login met dit adres neemt die login het
 * account over (zelfde id: kaarten, aanvragen en historie blijven). Leeg adres = voorbereiding ongedaan maken.
 */
export async function setLocalUserGoogleEmail(csrf: string, userId: number, email: string): Promise<void> {
  await apiVoid(`/api/admin/users/${userId}/google-email`, { method: 'PATCH', csrf, body: { email: email.trim() } })
}

/** Lokaal account samenvoegen met een bestaand Google-account; het lokale account verdwijnt. */
export async function mergeUserInto(csrf: string, userId: number, targetUserId: number): Promise<void> {
  await apiVoid(`/api/admin/users/${userId}/merge-into`, { method: 'POST', csrf, body: { target_user_id: targetUserId } })
}

/** Gedeactiveerd account verwijderen; historie blijft onder "Verwijderde leden". */
export async function deleteUser(csrf: string, userId: number): Promise<void> {
  await apiVoid(`/api/admin/users/${userId}`, { method: 'DELETE', csrf })
}
