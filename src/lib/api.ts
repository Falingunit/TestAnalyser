type ApiErrorPayload = {
  error?: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:4000'

const buildUrl = (path: string) =>
  path.startsWith('http') ? path : `${apiBaseUrl}${path}`

export const requestJson = async <T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> => {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const payload = (isJson ? await response.json() : null) as ApiErrorPayload | null

  if (!response.ok) {
    const message = payload?.error ?? response.statusText
    throw new ApiError(response.status, message)
  }

  return payload as T
}
