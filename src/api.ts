import type { ExternalAccount, TestAttempt, User } from './types'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

type RequestOptions = {
  token?: string
  method?: 'GET' | 'POST' | 'PATCH'
  body?: Record<string, unknown>
}

const request = async <T,>(path: string, options: RequestOptions = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const payload = (await response
    .json()
    .catch(() => ({}))) as Record<string, unknown>

  if (!response.ok) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status})`
    throw new Error(message)
  }

  return payload as T
}

export const api = {
  login: (payload: { email: string; password: string }) =>
    request<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: payload,
    }),
  register: (payload: { name: string; email: string; password: string }) =>
    request<{ user: User; token: string }>('/api/auth/register', {
      method: 'POST',
      body: payload,
    }),
  me: (token: string) =>
    request<{ user: User }>('/api/auth/me', { token }),
  tests: (token: string) =>
    request<{ tests: TestAttempt[] }>('/api/tests', { token }),
  test: (token: string, id: string) =>
    request<{ test: TestAttempt }>(`/api/tests/${id}`, { token }),
  externalAccounts: (token: string) =>
    request<{ accounts: ExternalAccount[] }>('/api/external', { token }),
}
