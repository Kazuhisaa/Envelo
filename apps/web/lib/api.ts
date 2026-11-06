export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:8787'

const KEY = 'envelo.demoPasscode'

export function getPasscode(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setPasscode(value: string) {
  try {
    localStorage.setItem(KEY, value)
  } catch {}
}

// fetch against the server; writes carry the demo passcode.
export function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (init.method && init.method !== 'GET') headers.set('x-demo-passcode', getPasscode())
  return fetch(SERVER_URL + path, { ...init, headers })
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
    const message = response.status === 401 ? 'Wrong or missing demo passcode' : body.error || `Server returned ${response.status}`
    throw new ApiError(response.status, message)
  }
  return response.json() as Promise<T>
}
