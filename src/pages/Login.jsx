import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useLoginMutation, billingApi } from '../store/api'
import { getAuthToken, setAuthToken } from '../lib/authToken'
import { store } from '../store'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')

  const [login, { isLoading }] = useLoginMutation()

  if (getAuthToken()) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError('')
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setLocalError('Please enter email and password.')
      return
    }
    try {
      const res = await login({ email: trimmedEmail, password }).unwrap()
      const token =
        (typeof res?.token === 'string' && res.token) ||
        (typeof res?.plainTextToken === 'string' && res.plainTextToken) ||
        (typeof res?.access_token === 'string' && res.access_token) ||
        (res?.data && typeof res.data.token === 'string' && res.data.token) ||
        (res?.data && typeof res.data.plainTextToken === 'string' && res.data.plainTextToken) ||
        (res?.data && typeof res.data.access_token === 'string' && res.data.access_token) ||
        ''
      if (!token) {
        setLocalError('Login succeeded but no token was returned. Check API response shape.')
        return
      }
      setAuthToken(token)
      store.dispatch(billingApi.util.resetApiState())
      navigate(from.startsWith('/') ? from : `/${from}`, { replace: true })
    } catch (err) {
      const d = err?.data
      let msg =
        (typeof d?.message === 'string' && d.message) ||
        (typeof d?.error === 'string' && d.error) ||
        (typeof d === 'string' ? d : null) ||
        err?.error ||
        'Login failed. Check email and password.'
      if (d?.errors && typeof d.errors === 'object') {
        const first = Object.values(d.errors)[0]
        if (Array.isArray(first) && first[0]) msg = String(first[0])
        else if (typeof first === 'string') msg = first
      }
      setLocalError(String(msg))
    }
  }

  return (
    <div className="login-page">
      <div className="login-card card">
        <h1 className="login-title">Billing</h1>
        <p className="login-subtitle">Sign in with your account</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              placeholder="you@example.com"
              disabled={isLoading}
            />
          </div>
          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              placeholder="••••••••"
              disabled={isLoading}
            />
          </div>
          {(localError || '') && <p className="login-error" role="alert">{localError}</p>}
          <button type="submit" className="btn btn-primary login-submit" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
