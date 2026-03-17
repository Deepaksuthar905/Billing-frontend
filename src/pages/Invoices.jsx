import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Filter, Eye, Edit } from 'lucide-react'
import { useGetInvoicesQuery } from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'
import './Invoices.css'

export default function Invoices() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading, isError } = useGetInvoicesQuery(
    { search: search || undefined, status: status || undefined },
    { refetchOnMountOrArgChange: 120 }
  )

  const invoices = (isError || !data?.data ? [] : data.data).map((inv) => ({
    ...inv,
    amountFormatted: typeof inv.payment === 'number' ? formatCurrency(inv.payment) : (inv.amount != null ? formatCurrency(inv.amount) : '—'),
    dateFormatted: formatDate(inv.dt ?? inv.date),
    customerName: inv.customer ?? inv.customer_name ?? inv.partyname ?? '—',
    statusDisplay: (inv.status || '').charAt(0).toUpperCase() + (inv.status || '').slice(1).toLowerCase() || '—',
    statusClass: (inv.status || '').toLowerCase() === 'paid' ? 'paid' : (inv.status || '').toLowerCase() === 'pending' ? 'pending' : 'overdue',
  }))

  return (
    <div className="invoices-page">
      <div className="page-header">
        <h1 className="page-title">Invoices</h1>
        <div className="page-header-actions">
          <Link to="/invoices/new" className="btn btn-primary">
            <Plus size={18} />
            New Invoice
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="filters-row">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="search"
              placeholder="Search by invoice #, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="filter-group">
            <label className="sync-date-range">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input-sm"
              />
              <span className="sync-date-sep">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input-sm"
              />
            </label>
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="select-input"
          >
            <option value="">All status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
          </select>
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
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    No invoices found. <Link to="/invoices/new">Create one</Link>.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-medium">{inv.inv_no ?? inv.invoice_no ?? inv.id}</td>
                  <td>{inv.dateFormatted}</td>
                  <td>{inv.customerName}</td>
                  <td>{inv.amountFormatted}</td>
                  <td>
                    <span className={`badge badge--${inv.statusClass}`}>
                      {inv.statusDisplay}
                    </span>
                  </td>
                  <td>
                    <div className="action-btns">
                      <Link to={`/invoices/${inv.id}`} className="btn-icon" aria-label="View">
                        <Eye size={16} />
                      </Link>
                      <button type="button" className="btn-icon" aria-label="Edit">
                        <Edit size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
