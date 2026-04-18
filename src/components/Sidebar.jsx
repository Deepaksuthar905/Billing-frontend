import { NavLink, useNavigate } from 'react-router-dom'
import { X, LogOut } from 'lucide-react'
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
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/purchase', icon: Package, label: 'Purchase' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/inventory', icon: Boxes, label: 'Inventory' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
]

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const navigate = useNavigate()

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
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item-active' : ''}`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
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
