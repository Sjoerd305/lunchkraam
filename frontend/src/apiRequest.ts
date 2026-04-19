import type { ZodType } from 'zod'

export class ApiError extends Error {
  code: string
  status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function parseError(res: Response): Promise<ApiError> {
  try {
    const j = (await res.json()) as { error?: string; message?: string }
    return new ApiError(res.status, j.error ?? 'error', j.message ?? res.statusText)
  } catch {
    return new ApiError(res.status, 'error', res.statusText)
  }
}

function parseApiResponse<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiError(502, 'invalid_response', 'Server gaf een ongeldig antwoord.')
  }
  return parsed.data
}

export type ApiJsonInit = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  csrf?: string
}

/** JSON request/response: fetch, throw [ApiError] on HTTP error, validate body with Zod. */
export async function apiJson<T>(path: string, schema: ZodType<T>, init?: ApiJsonInit): Promise<T> {
  const headers: Record<string, string> = {}
  if (init?.csrf) {
    headers['X-CSRF-Token'] = init.csrf
  }
  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    throw await parseError(res)
  }
  return parseApiResponse(schema, await res.json())
}

export type ApiVoidInit = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  csrf?: string
}

/** Same as [apiJson] but ignores response body (no Zod parse). */
export async function apiVoid(path: string, init?: ApiVoidInit): Promise<void> {
  const headers: Record<string, string> = {}
  if (init?.csrf) {
    headers['X-CSRF-Token'] = init.csrf
  }
  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    throw await parseError(res)
  }
}

/** POST multipart (e.g. CSV import); response JSON validated with Zod. */
export async function apiFormJson<T>(
  path: string,
  schema: ZodType<T>,
  csrf: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
    body: formData,
  })
  if (!res.ok) {
    throw await parseError(res)
  }
  return parseApiResponse(schema, await res.json())
}
