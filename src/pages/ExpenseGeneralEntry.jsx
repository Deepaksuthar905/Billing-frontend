import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  useCreateGeneralEntryMutation,
  useGetGeneralEntryListQuery,
  useGetPayByListQuery,
} from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'
import './ExpenseGeneralEntry.css'

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

function payByLabel(p) {
  const name = p?.name ?? '—'
  const detail = p?.detail ? ` (${p.detail})` : ''
  return `${name}${detail}`
}

/** Pay-by id sent to API as from_acc / to_acc (string). */
function payByIdValue(p) {
  const id = p?.pbid ?? p?.id
  return id != null && id !== '' ? String(id) : ''
}

function buildPayByLabelMap(list) {
  const map = new Map()
  for (const p of list) {
    const id = payByIdValue(p)
    if (id) map.set(id, payByLabel(p))
  }
  return map
}

function displayAccount(value, labelMap) {
  if (value == null || value === '') return '—'
  const key = String(value)
  return labelMap.get(key) ?? key
}

export default function ExpenseGeneralEntry() {
  const { data, isLoading, isError, refetch } = useGetGeneralEntryListQuery(undefined, {
    refetchOnMountOrArgChange: 120,
  })
  const { data: payByData, isLoading: payByLoading } = useGetPayByListQuery()
  const [createEntry, { isLoading: isSaving }] = useCreateGeneralEntryMutation()

  const rows = data?.data ?? []
  const payByList = payByData?.data ?? []
  const payByLabelMap = useMemo(() => buildPayByLabelMap(payByList), [payByList])

  const [date, setDate] = useState(todayYmd())
  const [fromAcc, setFromAcc] = useState('')
  const [toAcc, setToAcc] = useState('')
  const [amt, setAmt] = useState('')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    if (!payByList.length) return
    const first = payByIdValue(payByList[0])
    if (!fromAcc) setFromAcc(first)
    if (!toAcc && payByList.length > 1) setToAcc(payByIdValue(payByList[1]))
    else if (!toAcc) setToAcc(first)
  }, [payByList, fromAcc, toAcc])

  const amtNum = Number(amt) || 0
  const accountsSame = fromAcc && toAcc && fromAcc === toAcc

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fromAcc || !toAcc) {
      alert('Select From and To account.')
      return
    }
    if (accountsSame) {
      alert('From and To account must be different.')
      return
    }
    if (amtNum <= 0) {
      alert('Enter amount greater than 0.')
      return
    }
    try {
      await createEntry({
        date,
        from_acc: fromAcc,
        to_acc: toAcc,
        amt: amtNum,
        detail: detail.trim() || undefined,
      }).unwrap()
      setAmt('')
      setDetail('')
      refetch()
    } catch (err) {
      console.error('General entry failed:', err)
      const msg =
        err?.data?.message ||
        (typeof err?.data === 'object' && err?.data?.errors
          ? Object.values(err.data.errors).flat().join(' ')
          : null) ||
        'Could not save entry.'
      alert(msg)
    }
  }

  const listTotal = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amt ?? r.amount) || 0), 0),
    [rows]
  )

  return (
    <div className="page general-entry-page">
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>General Entry</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted, #6b7280)' }}>
            Journal transfers between pay-by accounts
          </p>
        </div>
      </div>

      <div className="card ge-form-card">
        <h2 className="ge-form-title">New entry</h2>
        <form className="ge-form" onSubmit={handleSubmit}>
          <label className="ge-field">
            <span>Date</span>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="ge-field">
            <span>From account</span>
            <select
              className="form-input"
              value={fromAcc}
              onChange={(e) => setFromAcc(e.target.value)}
              required
              disabled={payByLoading || !payByList.length}
            >
              {!payByList.length && <option value="">No pay-by accounts</option>}
              {payByList.map((p) => {
                const val = payByIdValue(p)
                if (!val) return null
                return (
                  <option key={`from-${val}`} value={val}>
                    {payByLabel(p)}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="ge-field">
            <span>To account</span>
            <select
              className="form-input"
              value={toAcc}
              onChange={(e) => setToAcc(e.target.value)}
              required
              disabled={payByLoading || !payByList.length}
            >
              {!payByList.length && <option value="">No pay-by accounts</option>}
              {payByList.map((p) => {
                const val = payByIdValue(p)
                if (!val) return null
                return (
                  <option key={`to-${val}`} value={val}>
                    {payByLabel(p)}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="ge-field">
            <span>Amount (₹)</span>
            <input
              type="number"
              className="form-input"
              min="0.01"
              step="0.01"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              required
            />
          </label>
          <label className="ge-field ge-field--full">
            <span>Detail (optional)</span>
            <input
              type="text"
              className="form-input"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Narration / note"
            />
          </label>
          {accountsSame && (
            <p className="ge-field-error ge-field--full">From and To must be different accounts.</p>
          )}
          <div className="ge-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving || payByLoading || !payByList.length || accountsSame}
            >
              <Plus size={16} />
              {isSaving ? 'Saving...' : 'Add entry'}
            </button>
          </div>
        </form>
      </div>

      <div className="ge-list-header">
        <span className="ge-list-title">Journal entries</span>
        <span className="ge-list-total">Total: {formatCurrency(listTotal)}</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>DATE</th>
              <th>FROM</th>
              <th>TO</th>
              <th>DETAIL</th>
              <th style={{ textAlign: 'right' }}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="ge-empty">
                  Loading...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={5} className="ge-empty">
                  Could not load journal entries.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="ge-empty">
                  No journal entries yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id ?? r.geid ?? `${r.date}-${r.from_acc}-${r.to_acc}-${r.amt}`}>
                  <td>{formatDate(r.date ?? r.dt)}</td>
                  <td>{displayAccount(r.from_acc, payByLabelMap)}</td>
                  <td>{displayAccount(r.to_acc, payByLabelMap)}</td>
                  <td>{r.detail ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {formatCurrency(Number(r.amt ?? r.amount) || 0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
