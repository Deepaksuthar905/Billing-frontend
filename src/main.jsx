import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { HashRouter } from 'react-router-dom'
import { store } from './store'
import App from './App.jsx'
import './index.css'

/**
 * HashRouter sirf `#/...` dekhta hai. Agar server ne `/htsuperbilling/invoices` par bhi
 * index.html de diya (rewrite), path ko hash-URL mein badal do taaki sahi route khule.
 */
function redirectPathToHashIfNeeded() {
  const base = '/htsuperbilling'
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/'
  if (window.location.hash && window.location.hash.replace('#', '').length > 0) return
  if (!path.startsWith(base)) return
  const tail = path.slice(base.length).replace(/^\//, '')
  if (!tail || tail === 'index.html') return
  if (tail.includes('.')) return
  if (tail.startsWith('assets/')) return
  window.location.replace(`${window.location.origin}${base}/#/${tail}`)
}
redirectPathToHashIfNeeded()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <HashRouter>
        <App />
      </HashRouter>
    </Provider>
  </StrictMode>,
)
