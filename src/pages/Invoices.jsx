import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Eye, Edit, RefreshCw, Trash2, ArrowUp, ArrowDown, Hash, Calendar } from 'lucide-react'
import { API_BASE_URL, useGetInvoicesQuery, useDeleteInvoiceMutation } from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'
import InvoicePreviewModal from './InvoicePreviewModal'
import './Invoices.css'

/** From–to ke beech max 31 din (inclusive); isse zyada range allow nahi. */
function exceedsOneMonthRange(fromStr, toStr) {
  if (!fromStr || !toStr) return false
  const a = new Date(`${fromStr}T12:00:00`)
  const b = new Date(`${toStr}T12:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return true
  if (a > b) return true
  const diffDays = Math.floor((b - a) / (24 * 60 * 60 * 1000))
  return diffDays > 30
}

/** Pending / outstanding for one row: balance → paylater → else unpaid status = full amount. */
function getPendingAmount(inv) {
  const bal = Number(inv.balance)
  if (!Number.isNaN(bal) && bal > 0.005) return bal
  const pl = Number(inv.paylater)
  if (!Number.isNaN(pl) && pl > 0.005) return pl
  const st = String(inv.status || '').toLowerCase()
  if (st === 'pending' || st === 'unpaid' || st === 'overdue') {
    return Number(inv.payment ?? inv.amount) || 0
  }
  return 0
}

export default function Invoices() {
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [invNoFilter, setInvNoFilter] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  const [isSyncing, setIsSyncing] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [previewInvId, setPreviewInvId] = useState(null)

  const [deleteInvoice, { isLoading: isDeleting }] = useDeleteInvoiceMutation()

  const rangeOkForApi =
    !filterFrom || !filterTo || !exceedsOneMonthRange(filterFrom, filterTo)

  const { data, isLoading, isError, refetch } = useGetInvoicesQuery(
    {
      status: status || undefined,
      from: rangeOkForApi && filterFrom ? filterFrom : undefined,
      to: rangeOkForApi && filterTo ? filterTo : undefined,
    },
    { refetchOnMountOrArgChange: 120 }
  )

  const invoices = (isError || !data?.data ? [] : data.data)
    .map((inv) => ({
      ...inv,
      rawDate: new Date(inv.dt ?? inv.date ?? 0),
      invNoStr: String(inv.inv_no ?? inv.invoice_no ?? inv.id ?? ''),
      amountFormatted: typeof inv.payment === 'number' ? formatCurrency(inv.payment) : (inv.amount != null ? formatCurrency(inv.amount) : '—'),
      dateFormatted: formatDate(inv.dt ?? inv.date),
      customerName: inv.customer ?? inv.customer_name ?? inv.partyname ?? '—',
      statusDisplay: (inv.status || '').charAt(0).toUpperCase() + (inv.status || '').slice(1).toLowerCase() || '—',
      statusClass: (inv.status || '').toLowerCase() === 'paid' ? 'paid' : (inv.status || '').toLowerCase() === 'pending' ? 'pending' : 'overdue',
    }))
    .filter((inv) => {
      if (invNoFilter && !inv.invNoStr.toLowerCase().includes(invNoFilter.toLowerCase())) return false
      if (rangeOkForApi && filterFrom && inv.rawDate < new Date(filterFrom)) return false
      if (rangeOkForApi && filterTo && inv.rawDate > new Date(filterTo + 'T23:59:59')) return false
      return true
    })
    .sort((a, b) =>
      sortOrder === 'asc'
        ? a.rawDate - b.rawDate
        : b.rawDate - a.rawDate
    )

  const { sumTotal, sumPending } = invoices.reduce(
    (acc, inv) => {
      const amt = Number(inv.payment ?? inv.amount) || 0
      acc.sumTotal += amt
      acc.sumPending += getPendingAmount(inv)
      return acc
    },
    { sumTotal: 0, sumPending: 0 }
  )

  const handleSync = async () => {
    const from = dateFrom || new Date().toISOString().slice(0, 10)
    const to = dateTo || new Date().toISOString().slice(0, 10)
    const url = `${API_BASE_URL}/sync-invoices?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    setIsSyncing(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`)
      refetch()
    } catch (err) {
      console.error('Sync error:', err)
      alert(err?.message || 'Sync failed. Check console.')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="invoices-page">
      <div className="page-header">
        <div className="page-header-titles">
          <h1 className="page-title">Invoices</h1>
          <div className="inv-summary-strip" aria-live="polite">
            <div className="inv-stat">
              <span className="inv-stat-label">Total</span>
              <span className="inv-stat-value">{formatCurrency(sumTotal)}</span>
            </div>
            <div className="inv-stat inv-stat--pending">
              <span className="inv-stat-label">Pending</span>
              <span className="inv-stat-value">{formatCurrency(sumPending)}</span>
            </div>
            <span className="inv-summary-note">
              {invoices.length} invoice{invoices.length === 1 ? '' : 's'} (filtered)
            </span>
          </div>
        </div>
        <div className="page-header-actions">
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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw size={18} className={isSyncing ? 'spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>
          <Link to="/invoices/new" className="btn btn-primary">
            <Plus size={18} />
            New Invoice
          </Link>
        </div>
      </div>

      <div className="card">
        {/* Row 1: Sort + Status */}
        <div className="filters-row">
          <button
            type="button"
            className={`sort-btn${sortOrder === 'asc' ? ' sort-btn--active' : ''}`}
            onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            title={sortOrder === 'asc' ? 'Date: Oldest first' : 'Date: Newest first'}
          >
            {sortOrder === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
            <span>{sortOrder === 'asc' ? 'ASC' : 'DESC'}</span>
          </button>

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
        </div>

        {/* Row 2: Invoice # filter + Date range filter */}
        <div className="filters-row filters-row--secondary">
          <div className="filter-field">
            <Hash size={15} className="filter-field-icon" />
            <input
              type="search"
              placeholder="Filter by Invoice #"
              value={invNoFilter}
              onChange={(e) => setInvNoFilter(e.target.value)}
              className="search-input search-input--sm"
            />
            {invNoFilter && (
              <button type="button" className="btn-clear-filter" onClick={() => setInvNoFilter('')} title="Clear">✕</button>
            )}
          </div>

          <div className="filter-field filter-field--date">
            <Calendar size={15} className="filter-field-icon" />
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => {
                const v = e.target.value
                setFilterFrom(v)
                if (v && filterTo && exceedsOneMonthRange(v, filterTo)) {
                  alert('Max 1 month range to fetch invoices.')
                  setFilterTo('')
                }
              }}
              className="input-sm"
              title="From date (max 1 month with To)"
            />
            <span className="inv-date-sep">—</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => {
                const v = e.target.value
                if (filterFrom && v && exceedsOneMonthRange(filterFrom, v)) {
                  alert('Max 1 month range to fetch invoices.')
                  return
                }
                setFilterTo(v)
              }}
              className="input-sm"
              title="To date (max 1 month from From)"
            />
            {(filterFrom || filterTo) && (
              <button
                type="button"
                className="btn-clear-filter"
                onClick={() => { setFilterFrom(''); setFilterTo('') }}
                title="Clear dates"
              >
                ✕
              </button>
            )}
          </div>
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
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label="View"
                        onClick={() => setPreviewInvId(inv.id)}
                      >
                        <Eye size={16} />
                      </button>
                      <Link to={`/invoices/${inv.id}/edit`} className="btn-icon" aria-label="Edit">
                        <Edit size={16} />
                      </Link>
                      <button
                        type="button"
                        className="btn-icon btn-icon--danger"
                        aria-label="Delete"
                        onClick={() => setDeleteTargetId(inv.id)}
                      >
                        <Trash2 size={16} color='red' />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {deleteTargetId && (
        <div className="modal-overlay" onClick={() => setDeleteTargetId(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Delete Invoice</span>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text, #1f2937)' }}>
                Are you sure you want to delete invoice?
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteTargetId(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    await deleteInvoice(deleteTargetId).unwrap()
                    setDeleteTargetId(null)
                    refetch()
                  } catch (err) {
                    console.error('Delete failed:', err)
                    alert(err?.data?.message || 'Could not delete invoice.')
                  }
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {previewInvId && (
        <InvoicePreviewModal
          invId={previewInvId}
          onClose={() => setPreviewInvId(null)}
        />
      )}
    </div>
  )
}
