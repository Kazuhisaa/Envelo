export const API_URL = '/api'

export async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(API_URL + path, { ...init, credentials: 'include' })
  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/session' && typeof window !== 'undefined') {
    const next = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/login?next=${encodeURIComponent(next)}`)
  }
  return response
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function readApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await api(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const message = body.error || `Server returned ${response.status}`
    throw new ApiError(response.status, message)
  }
  return response.json() as Promise<T>
}
