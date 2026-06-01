import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { X, Plus, Calculator, Settings, FileText } from 'lucide-react'
import {
  useGetExpenseHeadsQuery,
  useCreateExpenseHeadMutation,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useGetExpenseByIdQuery,
  useGetCustomersQuery,
  useCreateCustomerMutation,
} from '../store/api'
import { formatCurrency } from '../utils/format'
import { INDIA_STATES } from '../utils/indiaStates'
import './ExpenseNew.css'

const round2 = (n) => Math.round(Number(n) * 100) / 100

const emptyLineItem = () => ({
  item: '',
  description: '',
  qty: 1,
  price: 0,
  amount: 0,
})

function dtToYmd(dt) {
  if (!dt) return new Date().toISOString().slice(0, 10)
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

/** Parse API `description` "Item - detail" into line fields; amount from payment */
function lineFromExpense(exp) {
  const cat = exp.expenses_head?.name ?? ''
  const desc = String(exp.description ?? '').trim()
  const payment = Math.round(Number(exp.payment) || 0)
  if (!desc) {
    return { item: cat, description: '', qty: 1, price: payment, amount: payment }
  }
  const parts = desc
    .split(' - ')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length <= 1) {
    return { item: parts[0] || cat, description: '', qty: 1, price: payment, amount: payment }
  }
  return {
    item: parts[0],
    description: parts.slice(1).join(' - '),
    qty: 1,
    price: payment,
    amount: payment,
  }
}

export default function ExpenseNew() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const exidFromUrl = searchParams.get('exid')
  const expenseFromNav = location.state?.expense
  const hydratedExidRef = useRef(null)

  const [editingExid, setEditingExid] = useState(null)

  // Form state
  const [expHeadId, setExpHeadId] = useState('')
  const [expNo, setExpNo] = useState('')
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10))
  const [pid, setPid] = useState('')
  const [payby, setPayby] = useState('')
  const [refno, setRefno] = useState('')
  const [lineItems, setLineItems] = useState([emptyLineItem()])
  const [roundOff, setRoundOff] = useState(true)
  const [roundOffValue, setRoundOffValue] = useState(0)

  // Add Category modal state
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatType, setNewCatType] = useState('Indirect Expense')

  // Add Party modal state
  const [showPartyModal, setShowPartyModal] = useState(false)
  const [newPartyForm, setNewPartyForm] = useState({
    partyname: '',
    mobno: '',
    city: '',
    state: '',
    gst_reg: true,
    same_state: true,
  })

  // API hooks
  const { data: headsData } = useGetExpenseHeadsQuery(undefined, { refetchOnMountOrArgChange: 120 })
  const expenseHeads = headsData?.data ?? []

  const { data: customersData, refetch: refetchCustomers } = useGetCustomersQuery({ prtytyp: 1 }, { skip: false })
  const parties = customersData?.data ?? []
  const paybyAccounts = customersData?.payby ?? []

  const [createExpenseHead, { isLoading: isSavingHead }] = useCreateExpenseHeadMutation()
  const [createExpense, { isLoading: isSaving }] = useCreateExpenseMutation()
  const [updateExpense, { isLoading: isUpdating }] = useUpdateExpenseMutation()
  const { data: expenseFetched, isLoading: expenseDetailLoading } = useGetExpenseByIdQuery(exidFromUrl, {
    skip: !exidFromUrl || Boolean(expenseFromNav),
  })
  const [createCustomer, { isLoading: isCreatingParty }] = useCreateCustomerMutation()

  // Line item helpers
  const recalcLine = (line) => {
    const qty = Number(line.qty) || 0
    const price = Number(line.price) || 0
    return { ...line, amount: round2(qty * price) }
  }

  useEffect(() => {
    const exp = expenseFromNav ?? expenseFetched
    if (!exp?.exid) return
    if (hydratedExidRef.current === exp.exid) return
    hydratedExidRef.current = exp.exid
    setEditingExid(exp.exid)
    setExpHeadId(exp.exhid != null ? String(exp.exhid) : '')
    setExpNo(exp.receipt_no != null ? String(exp.receipt_no) : '')
    setExpDate(dtToYmd(exp.dt))
    setPid(exp.party != null && exp.party !== '' ? String(exp.party) : '')
    setPayby(exp.payby !== undefined && exp.payby !== null ? String(exp.payby) : '')
    setRefno(exp.refno != null ? String(exp.refno) : '')
    const line = lineFromExpense(exp)
    setLineItems([recalcLine(line)])
    setRoundOff(false)
    setRoundOffValue(0)
  }, [expenseFromNav, expenseFetched])

  /** Same route `/expenses/new`: clear edit state when opening a brand-new expense (no exid / no nav state). */
  useEffect(() => {
    const hasEditTarget = Boolean(exidFromUrl || expenseFromNav)
    if (hasEditTarget) return
    if (hydratedExidRef.current === null) return
    hydratedExidRef.current = null
    setEditingExid(null)
    setExpHeadId('')
    setExpNo('')
    setExpDate(new Date().toISOString().slice(0, 10))
    setPid('')
    setPayby('')
    setRefno('')
    setLineItems([emptyLineItem()])
    setRoundOff(true)
    setRoundOffValue(0)
  }, [exidFromUrl, expenseFromNav])

  const updateLineItem = (index, field, value) => {
    setLineItems((prev) => {
      const next = prev.map((line, i) => (i === index ? { ...line, [field]: value } : line))
      if (['qty', 'price'].includes(field)) {
        next[index] = recalcLine(next[index])
      }
      return next
    })
  }

  const addRow = () => setLineItems((prev) => [...prev, emptyLineItem()])
  const removeRow = (index) => {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const totalQty = lineItems.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  const totalBeforeRound = lineItems.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const total = round2(totalBeforeRound + (roundOff ? (Number(roundOffValue) || 0) : 0))

  // Add new category
  const handleAddCategory = async () => {
    if (!newCatName.trim()) {
      alert('Please enter category name.')
      return
    }
    try {
      const result = await createExpenseHead({
        name: newCatName.trim(),
        type: newCatType === 'Indirect Expense' ? 1 : 0,
      }).unwrap()
      const newId = result?.exhid ?? result?.id ?? result?.data?.exhid ?? result?.data?.id
      if (newId) setExpHeadId(String(newId))
      setShowCatModal(false)
      setNewCatName('')
      setNewCatType('Indirect Expense')
    } catch (err) {
      console.error('Add category failed:', err)
      alert(err?.data?.message || 'Could not add category.')
    }
  }

  const openPartyModal = () => {
    setNewPartyForm({
      partyname: '',
      mobno: '',
      city: '',
      state: '',
      gst_reg: true,
      same_state: true,
    })
    setShowPartyModal(true)
  }

  const closePartyModal = () => {
    setShowPartyModal(false)
    setNewPartyForm({
      partyname: '',
      mobno: '',
      city: '',
      state: '',
      gst_reg: true,
      same_state: true,
    })
  }

  const handlePartyChange = (value) => {
    if (value === '__add__') {
      openPartyModal()
      return
    }
    setPid(value)
  }

  const handleCreateParty = async () => {
    if (!newPartyForm.partyname.trim()) {
      alert('Please enter party name.')
      return
    }
    if (!newPartyForm.mobno.trim()) {
      alert('Please enter mobile number.')
      return
    }
    try {
      const res = await createCustomer({
        partyname: newPartyForm.partyname.trim(),
        mobno: newPartyForm.mobno.trim(),
        city: newPartyForm.city.trim(),
        state: newPartyForm.state.trim(),
        gst_reg: newPartyForm.gst_reg ? 1 : 0,
        same_state: newPartyForm.same_state ? 1 : 0,
        prtytyp: 1,
      }).unwrap()
      await refetchCustomers()
      const createdId = res?.pid ?? res?.id ?? res?.data?.pid ?? res?.data?.id
      if (createdId != null) setPid(String(createdId))
      closePartyModal()
    } catch (err) {
      console.error('Create party failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not add party. Please try again.')
    }
  }

  // Save expense
  const handleSave = async () => {
    if (!expHeadId) {
      alert('Please select an Expense Category.')
      return
    }
    const validItems = lineItems.filter((l) => l.item.trim() || l.amount > 0)
    if (validItems.length === 0) {
      alert('Please add at least one item.')
      return
    }
    const description = validItems
      .map((l) => [l.item.trim(), l.description.trim()].filter(Boolean).join(' - '))
      .filter(Boolean)
      .join(', ')

    const payload = {
      exhid: Number(expHeadId),
      receipt_no: expNo.trim() || undefined,
      description: description || undefined,
      payment: Math.round(total),
      dt: expDate,
      party: pid ? Number(pid) : undefined,
      payby: payby !== '' ? Number(payby) : undefined,
      refno: refno.trim() || undefined,
    }
    try {
      if (editingExid != null) {
        await updateExpense({ exid: editingExid, ...payload }).unwrap()
      } else {
        await createExpense(payload).unwrap()
      }
      navigate('/expenses')
    } catch (err) {
      console.error(editingExid != null ? 'Update expense failed:' : 'Create expense failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not save expense.')
    }
  }

  return (
    <div className="exp-new-page">
      {/* ── Header ── */}
      <header className="exp-new-header">
        <div className="exp-new-header-left">
          {/* <span className="exp-new-title">Expense {expNo}</span> */}
          {/* <Link to="/expenses" className="icon-btn" aria-label="Close">
            <X size={20} />
          </Link> */}
          {/* <Link to="/expenses/new" className="icon-btn" aria-label="New expense">
            <Plus size={20} />
          </Link> */}
        </div>
        <h1 className="exp-new-heading">{editingExid != null ? 'Edit expense' : 'Expense'}</h1>
        <div className="exp-new-header-right">
          {/* <button type="button" className="icon-btn" aria-label="Calculator">
            <Calculator size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="Settings">
            <Settings size={18} />
          </button> */}
          <Link to="/expenses" className="icon-btn" aria-label="Close">
            <X size={20} />
          </Link>
        </div>
      </header>

      {/* ── Form card ── */}
      <div className="exp-form-card card">
        {/* Top row */}
        <div className="exp-form-top-row">
          <div className="exp-form-top-left">
            <div className="form-group">
              <label>
                Expense Category <span className="required">*</span>
              </label>
              <div className="exp-cat-select-wrap">
                <select
                  value={expHeadId}
                  onChange={(e) => {
                    if (e.target.value === '__add__') {
                      setShowCatModal(true)
                    } else {
                      setExpHeadId(e.target.value)
                    }
                  }}
                  className="form-input"
                  required
                >
                  <option value="">Select Category</option>
                  {expenseHeads.map((h) => (
                    <option key={h.exhid ?? h.id} value={h.exhid ?? h.id}>
                      {h.name}
                    </option>
                  ))}
                  <option value="__add__">+ Add New Category</option>
                </select>
              </div>
            </div>
          </div>
          <div className="exp-form-top-right">
            <div className="form-group exp-no-group">
              <label>Receipt No</label>
              <input
                type="text"
                value={expNo}
                onChange={(e) => setExpNo(e.target.value)}
                className="form-input"
                placeholder="Auto"
              />
            </div>
            <div className="form-group exp-date-group">
              <label>Date</label>
              <input
                type="date"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="exp-items-section">
          <table className="exp-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ITEM</th>
                <th>DESCRIPTION</th>
                <th>QTY</th>
                <th>PRICE/UNIT</th>
                <th>AMOUNT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, index) => (
                <tr key={index}>
                  <td className="td-num">{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      value={line.item}
                      onChange={(e) => updateLineItem(index, 'item', e.target.value)}
                      className="form-input input-sm"
                      placeholder="Item name"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      className="form-input input-sm"
                      placeholder="Description"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={line.qty}
                      onChange={(e) => updateLineItem(index, 'qty', e.target.value)}
                      className="form-input input-sm td-qty"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.price || ''}
                      onChange={(e) => updateLineItem(index, 'price', e.target.value)}
                      className="form-input input-sm td-price"
                    />
                  </td>
                  <td className="amount-cell">{formatCurrency(line.amount)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-remove-row"
                      onClick={() => removeRow(index)}
                      aria-label="Remove row"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td></td>
                <td colSpan={2}>Total</td>
                <td>{totalQty}</td>
                <td></td>
                <td>{formatCurrency(totalBeforeRound)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <button type="button" className="btn-add-row" onClick={addRow}>
            <Plus size={16} />
            ADD ROW
          </button>
        </div>

        {/* Footer */}
        <div className="exp-form-footer">
          <div className="footer-left">
            <div className="form-group">
              <label>Party</label>
              <select
                value={pid}
                onChange={(e) => handlePartyChange(e.target.value)}
                className="form-input"
              >
                <option value="">Select Party / Account</option>
                {parties.map((c) => (
                  <option key={c.pid ?? c.id} value={c.pid ?? c.id}>
                    {c.partyname ?? c.name ?? `Party ${c.pid ?? c.id}`}
                  </option>
                ))}
                <option value="__add__">+ Add new party</option>
              </select>
            </div>
            <div className="form-group">
              <label>Pay By</label>
              <select
                value={payby}
                onChange={(e) => setPayby(e.target.value)}
                className="form-input"
              >
                <option value="">Select Pay By</option>
                {paybyAccounts.map((p) => (
                  <option key={p.pbid ?? p.id} value={p.pbid ?? p.id}>
                    {p.name ?? `PayBy ${p.pbid ?? p.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <input
                type="text"
                value={refno}
                onChange={(e) => setRefno(e.target.value)}
                className="form-input"
                placeholder="Reference No."
              />
            </div>
            {/* <button type="button" className="btn-outline">
              <FileText size={14} />
              ADD DESCRIPTION
            </button> */}
          </div>

          <div className="footer-right">
            <div className="total-row">
              <label className="round-off-label">
                <input
                  type="checkbox"
                  checked={roundOff}
                  onChange={(e) => setRoundOff(e.target.checked)}
                />
                Round Off
              </label>
              <input
                type="number"
                step="0.01"
                value={roundOffValue}
                onChange={(e) => setRoundOffValue(e.target.value)}
                className="form-input input-sm total-input"
              />
            </div>
            <div className="total-row total-final">
              <span>Total</span>
              <input
                type="text"
                readOnly
                value={Math.round(total)}
                className="form-input input-sm total-input total-display"
              />
            </div>
            <div className="footer-actions">
              <button type="button" className="btn btn-secondary">
                Share
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={
                  isSaving ||
                  isUpdating ||
                  (Boolean(exidFromUrl) && !expenseFromNav && expenseDetailLoading)
                }
              >
                {isSaving || isUpdating
                  ? 'Saving...'
                  : expenseDetailLoading && exidFromUrl && !expenseFromNav
                    ? 'Loading...'
                    : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Add Category Modal ── */}
      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Expense Category</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowCatModal(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Expense Category</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="form-input"
                  placeholder="e.g. Tea, Rent, Salary"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                />
              </div>
              <div className="form-group">
                <label>Expense Type</label>
                <select
                  value={newCatType}
                  onChange={(e) => setNewCatType(e.target.value)}
                  className="form-input"
                >
                  <option value="Indirect Expense">Indirect Expense</option>
                  <option value="Direct Expense">Direct Expense</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCatModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddCategory}
                disabled={isSavingHead}
              >
                {isSavingHead ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPartyModal && (
        <div className="modal-overlay" onClick={closePartyModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Party</span>
              <button type="button" className="icon-btn" onClick={closePartyModal} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>
                  Party Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={newPartyForm.partyname}
                  onChange={(e) => setNewPartyForm((p) => ({ ...p, partyname: e.target.value }))}
                  className="form-input"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>
                  Mobile No <span className="required">*</span>
                </label>
                <input
                  type="tel"
                  value={newPartyForm.mobno}
                  onChange={(e) => setNewPartyForm((p) => ({ ...p, mobno: e.target.value }))}
                  className="form-input"
                  placeholder="10-digit mobile number"
                />
              </div>
              <div className="form-group">
                <label>City</label>
                <input
                  type="text"
                  value={newPartyForm.city}
                  onChange={(e) => setNewPartyForm((p) => ({ ...p, city: e.target.value }))}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>State</label>
                <select
                  value={newPartyForm.state}
                  onChange={(e) => setNewPartyForm((p) => ({ ...p, state: e.target.value }))}
                  className="form-input"
                >
                  <option value="">Select</option>
                  {INDIA_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group form-row-check">
                <label className="form-check">
                  <input
                    type="checkbox"
                    checked={newPartyForm.gst_reg}
                    onChange={(e) => setNewPartyForm((p) => ({ ...p, gst_reg: e.target.checked }))}
                  />
                  <span>GST Registered</span>
                </label>
              </div>
              <div className="form-group form-row-check">
                <label className="form-check">
                  <input
                    type="checkbox"
                    checked={newPartyForm.same_state}
                    onChange={(e) => setNewPartyForm((p) => ({ ...p, same_state: e.target.checked }))}
                  />
                  <span>Same State</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closePartyModal} disabled={isCreatingParty}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCreateParty} disabled={isCreatingParty}>
                {isCreatingParty ? 'Saving...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
