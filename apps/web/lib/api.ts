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
