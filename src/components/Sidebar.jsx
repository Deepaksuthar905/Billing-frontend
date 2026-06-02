import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { X, LogOut, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { store } from '../store'
import { billingApi } from '../store/api'
import { clearAuthToken } from '../lib/authToken'
import {
  LayoutDashboard,
  Package,
  Boxes,
  Users,
  FileText,
  BarChart3,
  Receipt,
} from 'lucide-react'
import './Sidebar.css'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  {
    to: '/invoices',
    icon: FileText,
    label: 'Invoices',
    children: [
      { to: '/invoices/due', label: 'Due List' },
      { to: '/invoices/pay-in', label: 'Pay-in List' },
    ],
  },
  { to: '/purchase', icon: Package, label: 'Purchase' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/inventory', icon: Boxes, label: 'Inventory' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
]

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isInvoicesRoute = useMemo(() => location.pathname.startsWith('/invoices'), [location.pathname])
  const [invoicesOpen, setInvoicesOpen] = useState(false)

  useEffect(() => {
    if (isInvoicesRoute) setInvoicesOpen(true)
  }, [isInvoicesRoute])

  function handleLogout() {
    clearAuthToken()
    store.dispatch(billingApi.util.resetApiState())
    navigate('/login', { replace: true })
    onClose?.()
  }

  return (
    <aside
      className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}
      aria-hidden={isMobile && !isOpen}
    >
      <div className="sidebar-brand">
        <span className="brand-icon">📊</span>
        <span className="brand-name">Billing</span>
        <button
          type="button"
          className="sidebar-close"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={22} />
        </button>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label, children }) => {
          if (!children) {
            return (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <Icon size={20} />
                <span>{label}</span>
              </NavLink>
            )
          }

          return (
            <div key={to} className="nav-group">
              <div className={`nav-group-row ${isInvoicesRoute ? 'nav-item-active' : ''}`}>
                <NavLink
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `nav-item nav-item-group-link ${isActive ? 'nav-item-active' : ''}`
                  }
                >
                  <Icon size={20} />
                  <span className="nav-item-label">{label}</span>
                </NavLink>
                <button
                  type="button"
                  className="nav-item-caret-btn"
                  aria-label="Toggle invoice submenu"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setInvoicesOpen((o) => !o)
                  }}
                >
                  <ChevronDown size={16} className={`nav-item-caret ${invoicesOpen ? 'open' : ''}`} />
                </button>
              </div>

              {invoicesOpen && (
                <div className="nav-sub">
                  {children.map((c) => (
                    <NavLink
                      key={c.to}
                      to={c.to}
                      onClick={onClose}
                      className={({ isActive }) => `nav-sub-item ${isActive ? 'nav-sub-item-active' : ''}`}
                    >
                      {c.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="sidebar-logout" onClick={handleLogout}>
          <LogOut size={18} />
          <span>Log out</span>
        </button>
        <span className="footer-text">GST Billing & Accounting</span>
      </div>
    </aside>
  )
}
