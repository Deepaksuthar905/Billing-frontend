import { Bell, Search, Menu } from 'lucide-react'
import './Header.css'

export default function Header({ onMenuToggle, showMenuBtn }) {
  return (
    <header className="header">
      {showMenuBtn && (
      <button
        type="button"
        className="header-menu-btn"
        onClick={onMenuToggle}
        aria-label="Open menu"
      >
        <Menu size={24} />
      </button>
      )}
      <div className="header-search">
        <Search size={18} className="search-icon" />
        <input
          type="search"
          placeholder="Search invoices, customers, items..."
          className="search-input"
        />
      </div>
      <div className="header-actions">
        <button type="button" className="icon-btn" aria-label="Notifications">
          <Bell size={20} />
        </button>
        <div className="user-avatar">
          <span>BS</span>
        </div>
      </div>
    </header>
  )
}
