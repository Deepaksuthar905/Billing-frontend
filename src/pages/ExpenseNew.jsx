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
  useGetItemsQuery,
  useCreateItemMutation,
} from '../store/api'
import { formatCurrency } from '../utils/format'
import { INDIA_STATES } from '../utils/indiaStates'
import './ExpenseNew.css'

const BUSINESS_STATE = 'Rajasthan'
const PRICE_TYPE_WITH_TAX = 'with_tax'
const PRICE_TYPE_WITHOUT_TAX = 'without_tax'
const round2 = (n) => Math.round(Number(n) * 100) / 100

const emptyLineItem = () => ({
  itemId: '',
  item: '',
  hsnCode: '',
  description: '',
  qty: 1,
  unit: 'NONE',
  price: 0,
  discountPct: 0,
  discountAmt: 0,
  taxPct: 18,
  taxAmt: 0,
  amount: 0,
})

const recalcLineAmount = (line, type) => {
  const qty = Number(line.qty) || 0
  const price = Number(line.price) || 0
  const taxPct = Number(line.taxPct) || 18
  const isWithTax = type === PRICE_TYPE_WITH_TAX
  if (isWithTax) {
    const amount = round2(qty * price)
    const taxAmt = taxPct > 0 ? round2((amount * taxPct) / (100 + taxPct)) : 0
    return { ...line, taxAmt, amount }
  }
  const discountPct = Number(line.discountPct) || 0
  const subtotal = round2(qty * price)
  const discountAmt = round2((subtotal * discountPct) / 100)
  const afterDiscount = Math.max(0, round2(subtotal - discountAmt))
  const taxAmt = round2((afterDiscount * taxPct) / 100)
  return { ...line, discountAmt, taxAmt, amount: round2(Math.max(0, afterDiscount + taxAmt)) }
}

function dtToYmd(dt) {
  if (!dt) return new Date().toISOString().slice(0, 10)
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

/** Parse API `description` "Item - detail" into line fields; amount from payment */
function lineFromExpense(exp, priceType = PRICE_TYPE_WITH_TAX) {
  const cat = exp.expenses_head?.name ?? ''
  const desc = String(exp.description ?? '').trim()
  const payment = round2(Number(exp.payment) || 0)
  const rootGst = Number(exp.gst)
  const taxPct = rootGst > 0 && rootGst <= 100 ? rootGst : 18

  let item = cat
  let description = ''
  if (desc) {
    const parts = desc
      .split(' - ')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length <= 1) {
      item = parts[0] || cat
    } else {
      item = parts[0]
      description = parts.slice(1).join(' - ')
    }
  }

  return recalcLineAmount(
    {
      ...emptyLineItem(),
      item,
      description,
      qty: 1,
      price: payment,
      taxPct,
    },
    priceType
  )
}

export default function ExpenseNew() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const exidFromUrl = searchParams.get('exid')
  const expenseFromNav = location.state?.expense
  const hydratedExidRef = useRef(null)
  const prevPidForPartyStateRef = useRef(undefined)

  const [editingExid, setEditingExid] = useState(null)

  // Form state
  const [expHeadId, setExpHeadId] = useState('')
  const [expNo, setExpNo] = useState('')
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10))
  const [stateOfSupply, setStateOfSupply] = useState('')
  const [pid, setPid] = useState('')
  const [payby, setPayby] = useState('')
  const [refno, setRefno] = useState('')
  const [lineItems, setLineItems] = useState([emptyLineItem()])
  const [priceType, setPriceType] = useState(PRICE_TYPE_WITH_TAX)
  const [roundOff, setRoundOff] = useState(true)
  const [roundOffValue, setRoundOffValue] = useState(0)
  const [showItemModal, setShowItemModal] = useState(false)
  const [itemModalForIndex, setItemModalForIndex] = useState(null)
  const [newItemForm, setNewItemForm] = useState({
    item_name: '',
    hsncode: '',
    description: '',
    rate: '',
    gst: '',
  })

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
  const { data: itemsData, refetch: refetchItems } = useGetItemsQuery(undefined, { skip: false })
  const items = itemsData?.data ?? []

  const [createExpenseHead, { isLoading: isSavingHead }] = useCreateExpenseHeadMutation()
  const [createExpense, { isLoading: isSaving }] = useCreateExpenseMutation()
  const [updateExpense, { isLoading: isUpdating }] = useUpdateExpenseMutation()
  const { data: expenseFetched, isLoading: expenseDetailLoading } = useGetExpenseByIdQuery(exidFromUrl, {
    skip: !exidFromUrl || Boolean(expenseFromNav),
  })
  const [createCustomer, { isLoading: isCreatingParty }] = useCreateCustomerMutation()
  const [createItem, { isLoading: isCreatingItem }] = useCreateItemMutation()

  useEffect(() => {
    const partyId = pid ? String(pid) : ''
    if (!parties.length) return
    if (!partyId) {
      prevPidForPartyStateRef.current = partyId
      return
    }
    const selectionChanged = prevPidForPartyStateRef.current !== partyId
    prevPidForPartyStateRef.current = partyId
    if (!selectionChanged) return
    const party = parties.find((c) => String(c.pid ?? c.id) === partyId)
    const raw = party?.state != null ? String(party.state).trim() : ''
    if (!raw) return
    const normalized = INDIA_STATES.find((s) => s.toLowerCase() === raw.toLowerCase()) ?? raw
    setStateOfSupply(normalized)
  }, [pid, parties])

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
    setStateOfSupply(exp.state != null && exp.state !== '' ? String(exp.state) : '')
    setPriceType(PRICE_TYPE_WITH_TAX)
    const line = lineFromExpense(exp, PRICE_TYPE_WITH_TAX)
    setLineItems([line])
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
    setStateOfSupply('')
    setPriceType(PRICE_TYPE_WITH_TAX)
    setLineItems([emptyLineItem()])
    setRoundOff(true)
    setRoundOffValue(0)
  }, [exidFromUrl, expenseFromNav])

  const updateLineItem = (index, field, value) => {
    setLineItems((prev) => {
      const next = prev.map((line, i) => (i === index ? { ...line, [field]: value } : line))
      if (['qty', 'price', 'discountPct', 'discountAmt', 'taxPct', 'taxAmt'].includes(field)) {
        next[index] = recalcLineAmount(next[index], priceType)
      }
      return next
    })
  }

  const handlePriceTypeChange = (value) => {
    setPriceType(value)
    setLineItems((prev) => prev.map((line) => recalcLineAmount({ ...line }, value)))
  }

  const handleItemSelect = (index, itemId) => {
    if (!itemId) return
    if (itemId === '__add__') {
      setItemModalForIndex(index)
      setNewItemForm({ item_name: '', hsncode: '', description: '', rate: '', gst: '' })
      setShowItemModal(true)
      return
    }
    const invItem = items.find((i) => String(i.id ?? i.item_id) === String(itemId))
    if (!invItem) return
    const price = Number(invItem.rate) || 0
    const taxPct = Number(invItem.gst) || 18
    setLineItems((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line
        const newLine = {
          ...line,
          itemId: String(itemId),
          item: invItem.item_name ?? invItem.item ?? '',
          hsnCode: invItem.hsncode ?? invItem.hsnCode ?? '',
          description: invItem.description ?? '',
          price,
          taxPct,
        }
        return recalcLineAmount(newLine, priceType)
      })
    )
  }

  const closeItemModal = () => {
    setShowItemModal(false)
    setItemModalForIndex(null)
  }

  const handleCreateItem = async () => {
    if (!newItemForm.item_name.trim()) {
      alert('Please enter item name.')
      return
    }
    if (!newItemForm.hsncode.trim()) {
      alert('Please enter HSN code.')
      return
    }
    const payload = {
      item_name: newItemForm.item_name.trim(),
      hsncode: newItemForm.hsncode.trim(),
      description: newItemForm.description.trim() || undefined,
      rate: Number(newItemForm.rate) || 0,
      with_without: 1,
      gst: Number(newItemForm.gst) || 0,
      gst_amt: 0,
    }
    try {
      const res = await createItem(payload).unwrap()
      await refetchItems()
      const createdId = res?.id ?? res?.item_id ?? res?.data?.id ?? res?.data?.item_id
      if (createdId != null && itemModalForIndex != null) {
        const idx = itemModalForIndex
        setLineItems((prev) =>
          prev.map((line, i) => {
            if (i !== idx) return line
            const newLine = {
              ...line,
              itemId: String(createdId),
              item: payload.item_name,
              hsnCode: payload.hsncode,
              description: payload.description ?? '',
              price: payload.rate,
              taxPct: payload.gst || 18,
            }
            return recalcLineAmount(newLine, priceType)
          })
        )
      }
      closeItemModal()
    } catch (err) {
      console.error('Item create failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not create item.')
    }
  }

  const addRow = () => setLineItems((prev) => [...prev, emptyLineItem()])
  const removeRow = (index) => {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const totalQty = round2(lineItems.reduce((s, l) => s + (Number(l.qty) || 0), 0))
  const totalTax = round2(lineItems.reduce((s, l) => s + (Number(l.taxAmt) || 0), 0))
  const totalBeforeRound = round2(lineItems.reduce((s, l) => s + (Number(l.amount) || 0), 0))
  const total = round2(totalBeforeRound + (roundOff ? Number(roundOffValue) || 0 : 0))

  const sameState = stateOfSupply && stateOfSupply.trim() === BUSINESS_STATE
  const halfTax = sameState ? round2(totalTax / 2) : 0
  const cgstAmt = sameState ? halfTax : 0
  const sgstAmt = sameState ? round2(totalTax - halfTax) : 0
  const igstAmt = sameState ? 0 : round2(totalTax)
  const taxableAmt = round2(Math.max(0, totalBeforeRound - totalTax))

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

    const gstTotal = round2(cgstAmt + sgstAmt + igstAmt)
    const payload = {
      exhid: Number(expHeadId),
      receipt_no: expNo.trim() || undefined,
      description: description || undefined,
      payment: round2(Number(total) || 0),
      dt: expDate,
      state: stateOfSupply.trim() || undefined,
      party: pid ? Number(pid) : undefined,
      payby: payby !== '' ? Number(payby) : undefined,
      refno: refno.trim() || undefined,
      gst: gstTotal,
      taxable_amt: taxableAmt,
      cgst: cgstAmt,
      sgst: sgstAmt,
      igst: igstAmt,
      item_id: (() => {
        const ids = lineItems
          .map((line) => (line.itemId ? parseInt(line.itemId, 10) : 0))
          .filter((id) => id > 0)
        return ids.length > 0 ? ids[0] : undefined
      })(),
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
            <div className="form-group exp-state-group">
              <label>State of Party</label>
              <select
                value={stateOfSupply}
                onChange={(e) => setStateOfSupply(e.target.value)}
                className="form-input"
              >
                <option value="">Select</option>
                {INDIA_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span className="exp-gst-hint text-muted">
                {stateOfSupply
                  ? stateOfSupply.trim() === BUSINESS_STATE
                    ? `Same state (${BUSINESS_STATE}) → CGST + SGST`
                    : 'Different state → IGST'
                  : `Business state: ${BUSINESS_STATE}`}
              </span>
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
                <th>HSN</th>
                <th>DESCRIPTION</th>
                <th>QTY</th>
                <th className="th-price-unit">
                  <span className="th-main">PRICE/UNIT</span>
                  <select
                    value={priceType}
                    onChange={(e) => handlePriceTypeChange(e.target.value)}
                    className="form-input input-sm price-type-select"
                  >
                    <option value={PRICE_TYPE_WITH_TAX}>With Tax</option>
                    <option value={PRICE_TYPE_WITHOUT_TAX}>Without Tax</option>
                  </select>
                </th>
                <th>TAX %</th>
                <th>TAX AMT</th>
                <th>AMOUNT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, index) => (
                <tr key={index}>
                  <td className="td-num">{index + 1}</td>
                  <td>
                    <select
                      value={line.itemId || ''}
                      onChange={(e) => handleItemSelect(index, e.target.value)}
                      className="form-input input-sm"
                    >
                      <option value="">Select item</option>
                      {items.map((it) => (
                        <option key={it.id ?? it.item_id} value={it.id ?? it.item_id}>
                          {it.item_name ?? it.item ?? `Item ${it.item_id ?? it.id}`}
                        </option>
                      ))}
                      <option value="__add__">+ Add new item</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={line.hsnCode}
                      onChange={(e) => updateLineItem(index, 'hsnCode', e.target.value)}
                      className="form-input input-sm"
                      placeholder="HSN"
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
                      step="0.001"
                      value={line.qty}
                      onChange={(e) => updateLineItem(index, 'qty', e.target.value)}
                      className="form-input input-sm td-qty"
                    />
                  </td>
                  <td className="td-price-unit">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.price || ''}
                      onChange={(e) => updateLineItem(index, 'price', e.target.value)}
                      className="form-input input-sm td-price"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.taxPct || ''}
                      onChange={(e) => updateLineItem(index, 'taxPct', e.target.value)}
                      className="form-input input-sm"
                    />
                  </td>
                  <td className="amount-cell">{formatCurrency(line.taxAmt, 2)}</td>
                  <td className="amount-cell">{formatCurrency(line.amount, 2)}</td>
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
                <td colSpan={3}>Total</td>
                <td>{totalQty}</td>
                <td></td>
                <td></td>
                <td>{formatCurrency(totalTax, 2)}</td>
                <td>{formatCurrency(totalBeforeRound, 2)}</td>
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
            <div className="exp-gst-summary">
              <div className="exp-gst-summary-row">
                <span>Taxable</span>
                <strong>{formatCurrency(taxableAmt, 2)}</strong>
              </div>
              {sameState ? (
                <>
                  <div className="exp-gst-summary-row">
                    <span>CGST</span>
                    <strong>{formatCurrency(cgstAmt, 2)}</strong>
                  </div>
                  <div className="exp-gst-summary-row">
                    <span>SGST</span>
                    <strong>{formatCurrency(sgstAmt, 2)}</strong>
                  </div>
                </>
              ) : (
                <div className="exp-gst-summary-row">
                  <span>IGST</span>
                  <strong>{formatCurrency(igstAmt, 2)}</strong>
                </div>
              )}
            </div>
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
              <strong>{formatCurrency(total, 2)}</strong>
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

      {showItemModal && (
        <div className="modal-overlay" onClick={closeItemModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Item</span>
              <button type="button" className="icon-btn" onClick={closeItemModal} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>
                  Item Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={newItemForm.item_name}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, item_name: e.target.value }))}
                  className="form-input"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>
                  HSN Code <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={newItemForm.hsncode}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, hsncode: e.target.value }))}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={newItemForm.description}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, description: e.target.value }))}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Rate</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItemForm.rate}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, rate: e.target.value }))}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>GST %</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItemForm.gst}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, gst: e.target.value }))}
                  className="form-input"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeItemModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateItem}
                disabled={isCreatingItem}
              >
                {isCreatingItem ? 'Saving...' : 'Save'}
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
