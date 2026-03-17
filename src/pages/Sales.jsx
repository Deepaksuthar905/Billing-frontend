import { useState, useMemo } from 'react'
import { Plus, Search, Filter, FileText, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useGetSalesQuery } from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'
import './Sales.css'

// Sales API: GET http://127.0.0.1:8000/api/sales
// Response: { data: [ { id, date, customer, items: [{ item_id, description, rate, qty, amount }], total, status } ] }

const fallbackSales = [
  { id: 'SAL-001', date: '2025-03-16', customer: 'ABC Traders', items: 5, total: 12500, status: 'Completed' },
  { id: 'SAL-002', date: '2025-03-15', customer: 'XYZ Store', items: 3, total: 8200, status: 'Pending' },
  { id: 'SAL-003', date: '2025-03-14', customer: 'Global Mart', items: 12, total: 24800, status: 'Completed' },
]

const skipSalesApi = false

export default function Sales() {
  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useGetSalesQuery(search || undefined, {
    refetchOnMountOrArgChange: 120,
    skip: skipSalesApi,
  })

  const list = useMemo(() => {
    try {
      const rawList =
        skipSalesApi || isError || !data?.data
          ? fallbackSales
          : Array.isArray(data.data)
            ? data.data
            : fallbackSales
      return rawList.map((s) => {
        if (!s || typeof s !== 'object') return fallbackSales[0]
        const itemCount = Array.isArray(s.items) ? s.items.length : (typeof s.items === 'number' ? s.items : 0)
        const statusLower = (s.status || 'pending').toLowerCase()
        const statusDisplay = (s.status || 'Pending').charAt(0).toUpperCase() + (s.status || '').slice(1).toLowerCase()
        return {
          id: s.id ?? '—',
          customer: s.customer ?? s.customer_name ?? '—',
          items: itemCount,
          total: s.total ?? 0,
          status: statusDisplay,
          statusClass: statusLower === 'paid' || statusLower === 'completed' ? 'paid' : 'pending',
          totalFormatted: typeof s.total === 'number' ? formatCurrency(s.total) : String(s.total ?? '—'),
          dateFormatted: formatDate(s.date),
        }
      })
    } catch {
      return fallbackSales.map((s) => ({
        id: s.id,
        customer: s.customer,
        items: s.items,
        total: s.total,
        status: s.status,
        statusClass: s.status === 'Completed' ? 'paid' : 'pending',
        totalFormatted: formatCurrency(s.total),
        dateFormatted: formatDate(s.date),
      }))
    }
  }, [data, isError, skipSalesApi])

  return (
    <div className="sales-page">
      <div className="page-header">
        <h1 className="page-title">Sales</h1>
        <div className="page-actions">
          <Link to="/invoices" className="btn btn-secondary">
            <FileText size={18} />
            View Invoices
          </Link>
          <button type="button" className="btn btn-primary">
            <Plus size={18} />
            New Sale
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filters-row">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="search"
              placeholder="Search by customer, invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          <button type="button" className="btn btn-secondary btn-sm">
            <Filter size={16} />
            Filter
          </button>
        </div>

        {isLoading && !data && <div className="page-loading">Loading...</div>}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sale ID</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((sale, index) => (
                <tr key={sale.id || `sale-${index}`}>
                  <td>
                    <Link to="/invoices" className="link-primary">{sale.id}</Link>
                  </td>
                  <td>{sale.dateFormatted}</td>
                  <td>{sale.customer}</td>
                  <td>{sale.items}</td>
                  <td className="font-medium">{sale.totalFormatted}</td>
                  <td>
                    <span className={`badge badge--${sale.statusClass ?? (sale.status === 'Completed' ? 'paid' : 'pending')}`}>
                      {sale.status}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn-icon" title="View">→</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="quick-actions card">
        <h3 className="card-title">Quick Actions</h3>
        <div className="quick-actions-grid">
          <Link to="/invoices" className="quick-action-item">
            <FileText size={24} />
            <span>Create GST Invoice</span>
          </Link>
          <button type="button" className="quick-action-item">
            <ShoppingCart size={24} />
            <span>POS / Quick Sale</span>
          </button>
        </div>
      </div>
    </div>
  )
}
