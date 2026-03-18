import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import {
  LayoutDashboard,
  Package,
  Boxes,
  Users,
  FileText,
  BarChart3,
} from 'lucide-react'
import './Sidebar.css'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/purchase', icon: Package, label: 'Purchase' },
  { to: '/inventory', icon: Boxes, label: 'Inventory' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
]

export default function Sidebar({ isOpen, onClose, isMobile }) {
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
        <span className="footer-text">GST Billing & Accounting</span>
      </div>
    </aside>
  )
}
