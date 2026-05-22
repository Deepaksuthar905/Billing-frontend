import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useGetExpenseHeadsQuery, useGetExpensesQuery, useDeleteExpenseMutation } from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'
import './Expenses.css'

const PAYBY_LABELS = { 0: 'Cash', 1: 'Bank', 2: 'UPI', 3: 'Cheque' }

export default function Expenses() {
  const [selectedHeadId, setSelectedHeadId] = useState(null)
  const [search, setSearch] = useState('')
  const [rightSearch, setRightSearch] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState(null)

  const [deleteExpense, { isLoading: isDeleting }] = useDeleteExpenseMutation()

  const { data: headsData, isLoading: headsLoading } = useGetExpenseHeadsQuery(undefined, {
    refetchOnMountOrArgChange: 120,
  })
  const { data: expensesData, isLoading: expensesLoading } = useGetExpensesQuery(undefined, {
    refetchOnMountOrArgChange: 120,
  })

  const allHeads = headsData?.data ?? []
  const allExpenses = expensesData?.data ?? []

  const filteredHeads = allHeads.filter((h) =>
    (h.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const selectedHead = selectedHeadId
    ? allHeads.find((h) => String(h.exhid ?? h.id) === String(selectedHeadId))
    : null

  // null = show all, otherwise filter by selected exhid
  const visibleExpenses = selectedHeadId
    ? allExpenses.filter((e) => String(e.exhid) === String(selectedHeadId))
    : allExpenses

  const filteredExpenses = visibleExpenses.filter((e) => {
    const q = rightSearch.toLowerCase()
    return (
      !q ||
      String(e.receipt_no ?? e.exid ?? '').toLowerCase().includes(q) ||
      (e.party_relation?.partyname ?? '').toLowerCase().includes(q) ||
      (e.description ?? '').toLowerCase().includes(q)
    )
  })

  const panelTotal = selectedHead
    ? Number(selectedHead.payment) || 0
    : allExpenses.reduce((s, e) => s + (Number(e.payment) || 0), 0)

  return (
    <div className="expenses-page">
      <div className="expenses-layout">
        {/* ── Left panel: categories ── */}
        <aside className="expenses-left">
          <div className="expenses-left-toolbar">
            <div className="exp-search-box">
              <Search size={16} className="exp-search-icon" />
              <input
                type="search"
                placeholder="Search category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="exp-search-input"
              />
            </div>
            <Link to="/expenses/new" className="btn btn-primary btn-sm exp-add-btn">
              <Plus size={16} />
              Add Expense
            </Link>
          </div>

          {headsLoading && <div className="exp-loading">Loading...</div>}

          <div className="exp-category-list">
            <div className="exp-category-header-row">
              <span>CATEGORY</span>
              <span>AMOUNT</span>
            </div>
            {filteredHeads.map((head) => (
              <button
                key={head.exhid ?? head.id}
                type="button"
                className={`exp-category-item ${String(selectedHeadId) === String(head.exhid ?? head.id) ? 'exp-category-item--active' : ''}`}
                onClick={() => setSelectedHeadId(head.exhid ?? head.id)}
              >
                <span className="exp-cat-name">{head.name}</span>
                <span className="exp-cat-amount">
                  {Math.round(Number(head.payment) || 0).toLocaleString('en-IN')}
                </span>
              </button>
            ))}
            {!headsLoading && filteredHeads.length === 0 && (
              <div className="exp-empty">No categories found.</div>
            )}
          </div>
        </aside>

        {/* ── Right panel: transactions ── */}
        <section className="expenses-right">
          <div className="exp-right-header">
            <div className="exp-right-head-info">
              <span className="exp-right-head-name">
                {selectedHead ? selectedHead.name : 'All Expenses'}
              </span>
              {selectedHead && (
                <span className="exp-right-head-type">
                  {selectedHead.type === 0 ? 'Direct Expense' : 'Indirect Expense'}
                </span>
              )}
            </div>
            <div className="exp-right-head-totals">
              <span>Total : ₹{panelTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span>Balance : ₹0.00</span>
            </div>
          </div>

          <div className="exp-right-toolbar">
            <div className="exp-search-box">
              <Search size={16} className="exp-search-icon" />
              <input
                type="search"
                placeholder="Search..."
                value={rightSearch}
                onChange={(e) => setRightSearch(e.target.value)}
                className="exp-search-input"
              />
            </div>
          </div>

          {expensesLoading && <div className="exp-loading">Loading...</div>}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>RECEIPT NO.</th>
                  <th>CATEGORY</th>
                  <th>PARTY</th>
                  <th>PAY BY</th>
                  <th>AMOUNT</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="exp-no-data">
                      {expensesLoading ? 'Loading...' : 'No expenses found.'}
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => (
                    <tr key={exp.exid}>
                      <td>{formatDate(exp.dt)}</td>
                      <td className="font-medium">{exp.receipt_no ?? exp.exid}</td>
                      <td>{exp.expenses_head?.name ?? '—'}</td>
                      <td>{exp.party_relation?.partyname ?? '—'}</td>
                      <td>{PAYBY_LABELS[exp.payby] ?? '—'}</td>
                      <td>{formatCurrency(Number(exp.payment) || 0)}</td>
                      <td>
                        <div className="action-btns">
                          <button type="button" className="btn-icon">→</button>
                          <button
                            type="button"
                            className="btn-icon btn-icon--danger"
                            aria-label="Delete"
                            onClick={() => setDeleteTargetId(exp.exid)}
                          >
                            <Trash2 size={15} color='red' />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {deleteTargetId && (
        <div className="modal-overlay" onClick={() => setDeleteTargetId(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Delete Expense</span>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text, #1f2937)' }}>
                Are you sure you want to delete this expense? This action cannot be undone.
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
                    await deleteExpense(deleteTargetId).unwrap()
                    setDeleteTargetId(null)
                  } catch (err) {
                    console.error('Delete failed:', err)
                    alert(err?.data?.message || 'Could not delete expense.')
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
