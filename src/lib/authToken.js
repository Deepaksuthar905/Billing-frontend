const STORAGE_KEY = 'billing_auth_token'

export function getAuthToken() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setAuthToken(token) {
  if (!token) {
    clearAuthToken()
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // ignore
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
