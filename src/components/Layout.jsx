import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import './Layout.css'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const m = window.matchMedia('(max-width: 768px)')
    setIsMobile(m.matches)
    const fn = () => setIsMobile(m.matches)
    m.addEventListener('change', fn)
    return () => m.removeEventListener('change', fn)
  }, [])

  return (
    <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div
        className="sidebar-overlay"
        role="button"
        tabIndex={0}
        aria-label="Close menu"
        onClick={() => setSidebarOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setSidebarOpen(false)}
      />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobile={isMobile} />
      <div className="main-wrapper">
        <Header onMenuToggle={() => setSidebarOpen((o) => !o)} showMenuBtn={isMobile} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
