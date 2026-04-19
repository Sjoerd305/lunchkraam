import { describe, expect, it } from 'vitest'
import { ApiError, parseError } from './apiRequest'

describe('parseError', () => {
  it('maps JSON error envelope to ApiError', async () => {
    const res = new Response(JSON.stringify({ error: 'already_pending', message: 'Er is al een aanvraag.' }), {
      status: 409,
      statusText: 'Conflict',
    })
    const err = await parseError(res)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.code).toBe('already_pending')
    expect(err.message).toBe('Er is al een aanvraag.')
  })

  it('uses statusText when message is not a string', async () => {
    const res = new Response(JSON.stringify({ error: 'bad_request', message: 123 }), {
      status: 400,
      statusText: 'Bad Request',
    })
    const err = await parseError(res)
    expect(err.code).toBe('bad_request')
    expect(err.message).toBe('Bad Request')
  })

  it('uses plain text or HTML body when JSON is invalid', async () => {
    const res = new Response('<!DOCTYPE html><p>Gateway</p>', {
      status: 502,
      statusText: 'Bad Gateway',
    })
    const err = await parseError(res)
    expect(err.code).toBe('error')
    expect(err.message).toContain('<!DOCTYPE html>')
  })

  it('handles empty body', async () => {
    const res = new Response('', { status: 500, statusText: 'Server Error' })
    const err = await parseError(res)
    expect(err.message).toBe('Server Error')
  })
})
