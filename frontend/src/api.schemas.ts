import { z } from 'zod'

const stringWithDefault = (fallback: string) =>
  z.preprocess((value) => (typeof value === 'string' ? value : undefined), z.string().default(fallback))

const intWithDefault = (fallback: number) =>
  z.preprocess(
    (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined),
    z.number().int().default(fallback),
  )

const booleanLike = z.preprocess((value) => Boolean(value), z.boolean())

export const cardKindSchema = z.enum(['tosti', 'avondeten']).catch('tosti')
export const shopExpensePurposeSchema = z.enum(['lunchkraam', 'avondeten']).catch('lunchkraam')

const userSchema = z.object({
  id: intWithDefault(0),
  email: stringWithDefault(''),
  name: stringWithDefault(''),
  is_admin: booleanLike,
  is_operator: booleanLike,
  is_matroos_jeugd: booleanLike,
  must_change_password: booleanLike,
  auth_kind: z.enum(['google', 'local']).catch('google'),
  local_username: z.preprocess(
    (value) => (typeof value === 'string' ? value : undefined),
    z.string().optional(),
  ),
})

const myPendingRequestSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  created_at: stringWithDefault(''),
  knipjes_remaining: intWithDefault(10),
})

const cardSchema = z.object({
  id: intWithDefault(0),
  kind: cardKindSchema,
  knipjes_remaining: intWithDefault(0),
  created_at: stringWithDefault(''),
})

export const meResponseSchema = z.object({
  user: userSchema.nullable().catch(null),
  pending_card_requests: intWithDefault(0),
  csrf_token: stringWithDefault(''),
  payment_amount_eur: stringWithDefault('15'),
  payment_amount_avondeten_eur: stringWithDefault('12'),
})

export const cardsResponseSchema = z.object({
  cards: z.array(cardSchema).catch([]),
})

export const buyInfoResponseSchema = z.object({
  payment_amount_eur: stringWithDefault(''),
  payment_amount_avondeten_eur: stringWithDefault('12'),
  tikkie_url: stringWithDefault(''),
  tikkie_url_avondeten: stringWithDefault(''),
  bank_transfer_instructions: stringWithDefault(''),
  my_pending_requests: z.array(myPendingRequestSchema).catch([]),
})
