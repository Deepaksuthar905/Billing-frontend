import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Eye, Edit, RefreshCw, Trash2, Hash, Calendar, ArrowUpDown, FileJson, Banknote } from 'lucide-react'
import { API_BASE_URL, useGetInvoicesQuery, useDeleteInvoiceMutation } from '../store/api'
import { getAuthToken } from '../lib/authToken'
import { formatCurrency, formatDate } from '../utils/format'
import { buildGstr1JsonPayload, downloadJson } from '../utils/gstr1JsonExport'
import { getPendingAmount } from '../utils/invoicePayment'
import PayInModal from '../components/PayInModal'
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

function compareInvoices(a, b, sortBy) {
  if (sortBy === 'inv-asc' || sortBy === 'inv-desc') {
    const cmp = a.invNoStr.localeCompare(b.invNoStr, undefined, { numeric: true, sensitivity: 'base' })
    return sortBy === 'inv-asc' ? cmp : -cmp
  }
  const diff = a.rawDate - b.rawDate
  if (sortBy === 'date-asc') return diff
  return -diff
}

export default function Invoices() {
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  /** Draft dates (user editing) — API pe apply nahi hote jab tak Submit na dabaye */
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  /** Applied dates — list/API filter */
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [invNoFilter, setInvNoFilter] = useState('')
  const [sortBy, setSortBy] = useState('date-desc')
  const [isSyncing, setIsSyncing] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [previewInvId, setPreviewInvId] = useState(null)
  const [payInTarget, setPayInTarget] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isExportingJson, setIsExportingJson] = useState(false)
  const selectAllRef = useRef(null)

  const [deleteInvoice, { isLoading: isDeleting }] = useDeleteInvoiceMutation()

  const rangeOkForApi =
    !filterFrom || !filterTo || !exceedsOneMonthRange(filterFrom, filterTo)

  const applyDateFilter = () => {
    if (draftFrom && draftTo) {
      if (draftFrom > draftTo) {
        alert('From date cannot be after To date.')
        return
      }
      if (exceedsOneMonthRange(draftFrom, draftTo)) {
        alert('Max 1 month range to fetch invoices.')
        return
      }
    } else if ((draftFrom && !draftTo) || (!draftFrom && draftTo)) {
      alert('Please select both From and To dates.')
      return
    }
    setFilterFrom(draftFrom)
    setFilterTo(draftTo)
  }

  const clearDateFilter = () => {
    setDraftFrom('')
    setDraftTo('')
    setFilterFrom('')
    setFilterTo('')
  }

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
    .sort((a, b) => compareInvoices(a, b, sortBy))

  const allVisibleSelected =
    invoices.length > 0 && invoices.every((inv) => selectedIds.has(inv.id))
  const someVisibleSelected = invoices.some((inv) => selectedIds.has(inv.id))

  useEffect(() => {
    const el = selectAllRef.current
    if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected
  }, [someVisibleSelected, allVisibleSelected])

  const selectedCount = selectedIds.size

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        invoices.forEach((inv) => next.delete(inv.id))
      } else {
        invoices.forEach((inv) => next.add(inv.id))
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const { sumTotal, sumPending } = invoices.reduce(
    (acc, inv) => {
      const amt = Number(inv.payment ?? inv.amount) || 0
      acc.sumTotal += amt
      acc.sumPending += getPendingAmount(inv)
      return acc
    },
    { sumTotal: 0, sumPending: 0 }
  )

  const handleExportGstr1Json = async () => {
    if (!invoices.length) {
      alert('No invoices in the current filter to export.')
      return
    }
    setIsExportingJson(true)
    try {
      const token = getAuthToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const rows = await Promise.all(
        invoices.map(async (inv) => {
          const res = await fetch(`${API_BASE_URL}/invoices/${inv.id}`, { headers })
          if (!res.ok) throw new Error(`Could not load invoice ${inv.invNoStr || inv.id} (${res.status})`)
          const raw = await res.json()
          return raw?.data ?? raw
        })
      )

      /** Many APIs store buyer GSTIN only on customer master — merge for B2B export. */
      let enrichedRows = rows
      try {
        const cr = await fetch(`${API_BASE_URL}/customers`, { headers })
        if (cr.ok) {
          const rawCustomers = await cr.json()
          const list =
            rawCustomers?.data ??
            rawCustomers?.results ??
            (Array.isArray(rawCustomers) ? rawCustomers : [])
          const byPid = new Map()
          for (const c of list) {
            const id = c.pid ?? c.id
            if (id != null) byPid.set(String(id), c)
          }
          enrichedRows = rows.map((inv) => {
            const pid = inv.pid ?? inv.customer_id ?? inv.party_id
            if (pid == null) return inv
            const c = byPid.get(String(pid))
            if (!c) return inv
            const partyGst = String(c.gst_no ?? c.gstin ?? '')
              .trim()
            if (!partyGst) return inv
            if (String(inv.gst_no ?? inv.customer_gstin ?? inv.buyer_gstin ?? '').replace(/\s/g, '').length >= 15) {
              return inv
            }
            return { ...inv, gst_no: inv.gst_no || partyGst }
          })
        }
      } catch (e) {
        console.warn('Customer GST merge for export skipped:', e)
      }

      const anchor = filterFrom || filterTo || (enrichedRows[0] && (enrichedRows[0].dt ?? enrichedRows[0].date))
      const { payload, skippedNoGstin } = buildGstr1JsonPayload(enrichedRows, {
        anchorDateForFp: anchor,
      })
      if (!payload.b2b.length && skippedNoGstin.length) {
        alert(
          'No B2B rows: customer GSTIN missing or invalid on all invoices in this range. HSN / doc_issue still reflect all invoices.'
        )
      } else if (skippedNoGstin.length) {
        alert(
          `${skippedNoGstin.length} invoice(s) skipped in B2B (no valid buyer GSTIN): ${skippedNoGstin.slice(0, 8).join(', ')}${skippedNoGstin.length > 8 ? '…' : ''}`
        )
      }
      const fn = `GSTR1_${payload.fp}_${payload.gstin}.json`.replace(/[/\\:*?"<>|]/g, '-')
      downloadJson(fn, payload)
    } catch (err) {
      console.error('Export JSON failed:', err)
      alert(err?.message || 'Export failed. Check console.')
    } finally {
      setIsExportingJson(false)
    }
  }

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
            onClick={handleExportGstr1Json}
            disabled={isExportingJson || isLoading}
            title="Download GSTR-1 style JSON for the filtered date range (same rows as the table)"
          >
            <FileJson size={18} />
            {isExportingJson ? 'Exporting…' : 'Export JSON'}
          </button>
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
          <label className="inv-sort-field">
            {/* <ArrowUpDown size={15} className="inv-sort-field-icon" aria-hidden /> */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="select-input inv-sort-select"
              aria-label="Sort invoices"
            >
              <option value="date-asc">ASC by date</option>
              <option value="date-desc">DESC by date</option>
              <option value="inv-asc">ASC by invoice</option>
              <option value="inv-desc">DESC by invoice</option>
            </select>
          </label>

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
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="input-sm"
              title="From date"
            />
            <span className="inv-date-sep">—</span>
            <input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="input-sm"
              title="To date"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm inv-date-apply-btn"
              onClick={applyDateFilter}
              title="Apply date filter (max 1 month)"
            >
              Submit
            </button>
            {(draftFrom || draftTo || filterFrom || filterTo) && (
              <button
                type="button"
                className="btn-clear-filter"
                onClick={clearDateFilter}
                title="Clear dates"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {selectedCount > 0 && (
          <div className="inv-bulk-bar">
            <span className="inv-bulk-bar-text">
              {selectedCount} selected
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearSelection}>
              Clear
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 size={16} />
              Delete selected
            </button>
          </div>
        )}

        {isLoading && !data && <div className="page-loading">Loading...</div>}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="inv-col-check">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="inv-row-check"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    disabled={invoices.length === 0}
                    aria-label="Select all visible invoices"
                  />
                </th>
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
                  <td colSpan={7} className="text-center text-muted">
                    No invoices found. <Link to="/invoices/new">Create one</Link>.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="inv-col-check">
                    <input
                      type="checkbox"
                      className="inv-row-check"
                      checked={selectedIds.has(inv.id)}
                      onChange={() => toggleSelectId(inv.id)}
                      aria-label={`Select invoice ${inv.invNoStr}`}
                    />
                  </td>
                  <td className="font-medium">{inv.inv_no ?? inv.invoice_no ?? inv.id}</td>
                  <td>{inv.dateFormatted}</td>
                  <td>{inv.customerName}</td>
                  <td>{inv.amountFormatted}</td>
                  <td className="inv-status-cell">
                    <span className={`badge badge--${inv.statusClass}`}>
                      {inv.statusDisplay}
                    </span>
                    {String(inv.status || '').toLowerCase() === 'pending' &&
                      !Number.isNaN(Number(inv.balance)) &&
                      Number(inv.balance) > 0 && (
                        <div className="inv-status-balance">
                          Balance {formatCurrency(Number(inv.balance))}
                        </div>
                      )}
                  </td>
                  <td>
                    <div className="action-btns">
                      {getPendingAmount(inv) > 0.005 && (
                        <button
                          type="button"
                          className="btn-icon btn-icon--pay"
                          aria-label="Record payment"
                          title="Pay In – record received payment"
                          onClick={() => setPayInTarget({ id: inv.id, listInvoice: inv })}
                        >
                          <Banknote size={16} />
                        </button>
                      )}
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
      {bulkDeleteOpen && (
        <div className="modal-overlay" onClick={() => !isBulkDeleting && setBulkDeleteOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Delete invoices</span>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text, #1f2937)' }}>
                Delete {selectedCount} invoice{selectedCount === 1 ? '' : 's'}? This cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setBulkDeleteOpen(false)}
                disabled={isBulkDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isBulkDeleting}
                onClick={async () => {
                  const ids = [...selectedIds]
                  setIsBulkDeleting(true)
                  let failed = 0
                  try {
                    for (const id of ids) {
                      try {
                        await deleteInvoice(id).unwrap()
                      } catch {
                        failed += 1
                      }
                    }
                    setBulkDeleteOpen(false)
                    clearSelection()
                    refetch()
                    if (failed > 0) {
                      alert(`${failed} invoice(s) could not be deleted. Others were removed.`)
                    }
                  } finally {
                    setIsBulkDeleting(false)
                  }
                }}
              >
                {isBulkDeleting ? 'Deleting...' : 'Delete all'}
              </button>
            </div>
          </div>
        </div>
      )}
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
          onRecordPayment={(invRow) => {
            setPreviewInvId(null)
            setPayInTarget({ id: invRow.id ?? previewInvId, listInvoice: invRow })
          }}
        />
      )}
      {payInTarget && (
        <PayInModal
          invId={payInTarget.id}
          listInvoice={payInTarget.listInvoice}
          onClose={() => setPayInTarget(null)}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  )
}
