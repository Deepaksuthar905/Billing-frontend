import { useMemo, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import { useDeletePayInMutation, useGetPayInListQuery } from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'

const PAYBY_LABELS = { 0: 'Cash', 1: 'Bank', 2: 'UPI', 3: 'Cheque' }

export default function InvoicePayInList() {
  const [search, setSearch] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState(null)

  const { data, isLoading, isError } = useGetPayInListQuery()
  const [deletePayIn, { isLoading: isDeleting }] = useDeletePayInMutation()
  const rows = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const partyName = r.party?.partyname ?? ''
      const invNo = r.invoice?.inv_no ?? r.inv_id ?? ''
      const payByName = r.pay_by?.name ?? ''
      const ref = r.referal ?? r.invoice?.refno ?? ''
      return (
        String(partyName).toLowerCase().includes(q) ||
        String(invNo).toLowerCase().includes(q) ||
        String(payByName).toLowerCase().includes(q) ||
        String(ref).toLowerCase().includes(q) ||
        String(r.amount ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const totalAmount = useMemo(
    () => filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [filtered]
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Pay-in List</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted, #6b7280)' }}>
            Total: {formatCurrency(totalAmount)}
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: '0.75rem 1rem' }}>
        <div className="exp-search-box" style={{ maxWidth: 320 }}>
          <Search size={16} className="exp-search-icon" />
          <input
            type="search"
            placeholder="Search party / invoice / bank..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="exp-search-input"
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>DATE</th>
              <th>INVOICE</th>
              <th>PARTY</th>
              <th>PAY BY</th>
              <th>DETAIL</th>
              <th>REF</th>
              <th style={{ textAlign: 'right' }}>AMOUNT</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted, #6b7280)' }}>
                  Loading...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={8} style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted, #6b7280)' }}>
                  Could not load pay-in list.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted, #6b7280)' }}>
                  No pay-in entries found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.pinid ?? `${r.inv_id}-${r.dt}-${r.amount}`}>
                  <td>{formatDate(r.dt)}</td>
                  <td>{r.invoice?.inv_no ?? r.inv_id ?? '—'}</td>
                  <td>{r.party?.partyname ?? '—'}</td>
                  <td>{r.pay_by?.name ?? PAYBY_LABELS[r.payby] ?? '—'}</td>
                  <td>{r.pay_by?.detail ?? r.invoice?.refno ?? '—'}</td>
                  <td>{r.referal ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(Number(r.amount) || 0)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-icon btn-icon--danger"
                      aria-label="Delete pay-in"
                      onClick={() => setDeleteTargetId(r.pinid)}
                      disabled={!r.pinid}
                    >
                      <Trash2 size={15} color="red" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteTargetId && (
        <div className="modal-overlay" onClick={() => setDeleteTargetId(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Delete Pay-in Entry</span>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text, #1f2937)' }}>
                Are you sure you want to delete this entry?
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
                    await deletePayIn(deleteTargetId).unwrap()
                    setDeleteTargetId(null)
                  } catch (err) {
                    console.error('Delete failed:', err)
                    alert(err?.data?.message || 'Could not delete pay-in entry.')
                  }
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

