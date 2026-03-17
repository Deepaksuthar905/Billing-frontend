import {
  TrendingUp,
  ShoppingCart,
  Package,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useGetDashboardQuery } from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'
import './Dashboard.css'

const statsConfig = [
  { key: 'totalSales', title: 'Total Sales', trendKey: 'salesChangePercent', icon: TrendingUp, color: 'primary', link: '/sales' },
  { key: 'totalPurchase', title: 'Purchase', trendKey: 'purchaseChangePercent', icon: Package, color: 'warning', link: '/purchase' },
  { key: 'outstanding', title: 'Outstanding', trendKey: 'outstandingChangePercent', icon: DollarSign, color: 'danger', link: '/invoices' },
  { key: 'invoiceCount', title: 'Invoices This Month', trendKey: null, icon: FileText, color: 'success', link: '/invoices' },
]

const fallbackStats = [
  { title: 'Total Sales', value: '₹2,45,680', change: '+12.5%', trend: 'up', icon: TrendingUp, color: 'primary', link: '/sales' },
  { title: 'Purchase', value: '₹1,82,400', change: '+8.2%', trend: 'up', icon: Package, color: 'warning', link: '/purchase' },
  { title: 'Outstanding', value: '₹45,200', change: '-3.1%', trend: 'down', icon: DollarSign, color: 'danger', link: '/invoices' },
  { title: 'Invoices This Month', value: '48', change: '+15', trend: 'up', icon: FileText, color: 'success', link: '/invoices' },
]

const fallbackInvoices = [
  { id: 'INV-001', customer: 'ABC Traders', amount: 12500, date: '2025-03-16', status: 'Paid' },
  { id: 'INV-002', customer: 'XYZ Store', amount: 8200, date: '2025-03-15', status: 'Pending' },
  { id: 'INV-003', customer: 'Global Mart', amount: 24800, date: '2025-03-14', status: 'Paid' },
  { id: 'INV-004', customer: 'Retail Plus', amount: 5600, date: '2025-03-13', status: 'Overdue' },
  { id: 'INV-005', customer: 'Metro Wholesale', amount: 18900, date: '2025-03-12', status: 'Paid' },
]

const fallbackPurchases = [
  { id: 'PO-101', vendor: 'Supplier A', amount: 32000, date: '2025-03-15' },
  { id: 'PO-102', vendor: 'Supplier B', amount: 15400, date: '2025-03-14' },
  { id: 'PO-103', vendor: 'Supplier C', amount: 28600, date: '2025-03-13' },
]

function renderStatValue(d, config) {
  const val = d?.[config.key]
  if (config.key === 'invoiceCount') return val != null ? String(val) : '0'
  return formatCurrency(val)
}

function renderStatChange(d, config) {
  if (!config.trendKey) return null
  const p = d?.[config.trendKey]
  if (p == null) return null
  const trend = p >= 0 ? 'up' : 'down'
  const text = p >= 0 ? `+${p}%` : `${p}%`
  return { trend, text }
}

export default function Dashboard() {
  const { data, isLoading, isError } = useGetDashboardQuery(undefined, {
    refetchOnMountOrArgChange: 60, // 60 sec ke baad refetch
  })

  const useFallback = isError || !data
  const recentInvoices = (useFallback ? fallbackInvoices : (data?.recentInvoices || [])).map((inv) => ({
    ...inv,
    amountFormatted: typeof inv.amount === 'number' ? formatCurrency(inv.amount) : inv.amount,
    dateFormatted: formatDate(inv.date),
  }))
  const recentPurchases = (useFallback ? fallbackPurchases : (data?.recentPurchases || [])).map((po) => ({
    ...po,
    amountFormatted: typeof po.amount === 'number' ? formatCurrency(po.amount) : po.amount,
    dateFormatted: formatDate(po.date),
  }))

  const stats = useFallback
    ? fallbackStats
    : statsConfig.map((config) => {
        const Icon = config.icon
        const change = renderStatChange(data, config)
        return {
          title: config.title,
          value: renderStatValue(data, config),
          change: change?.text ?? '—',
          trend: change?.trend ?? 'up',
          icon: Icon,
          color: config.color,
          link: config.link,
        }
      })

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <div className="dashboard-actions">
          <Link to="/sales" className="btn btn-primary">
            <ShoppingCart size={18} />
            New Sale
          </Link>
          <Link to="/invoices" className="btn btn-secondary">
            <FileText size={18} />
            Create Invoice
          </Link>
        </div>
      </div>

      {isLoading && !data && (
        <div className="dashboard-loading">Loading...</div>
      )}

      <div className="stats-grid">
        {stats.map(({ title, value, change, trend, icon: Icon, color, link }) => (
          <Link to={link} key={title} className="stat-card-link">
            <div className={`stat-card stat-card--${color}`}>
              <div className="stat-icon">
                <Icon size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-title">{title}</span>
                <span className="stat-value">{value}</span>
                {change && (
                  <span className={`stat-change stat-change--${trend}`}>
                    {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {change}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="card dashboard-card">
          <div className="card-header-row">
            <h2 className="card-title">Recent Invoices</h2>
            <Link to="/invoices" className="link-muted">
              View all
            </Link>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link to="/invoices">{inv.id}</Link>
                    </td>
                    <td>{inv.customer}</td>
                    <td>{inv.amountFormatted ?? formatCurrency(inv.amount)}</td>
                    <td>{inv.dateFormatted}</td>
                    <td>
                      <span className={`badge badge--${String(inv.status).toLowerCase().replace(' ', '-')}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card dashboard-card">
          <div className="card-header-row">
            <h2 className="card-title">Recent Purchases</h2>
            <Link to="/purchase" className="link-muted">
              View all
            </Link>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Vendor</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentPurchases.map((po) => (
                  <tr key={po.id}>
                    <td>
                      <Link to="/purchase">{po.id}</Link>
                    </td>
                    <td>{po.vendor}</td>
                    <td>{po.amountFormatted ?? formatCurrency(po.amount)}</td>
                    <td>{po.dateFormatted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
