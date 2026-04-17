import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { X, Plus, Calculator, Settings } from 'lucide-react'
import {
  useGetCustomersQuery,
  useGetItemsQuery,
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
  useCreateCustomerMutation,
  useGetInvoiceByIdQuery,
} from '../store/api'
import { formatCurrency } from '../utils/format'
import { INDIA_STATES } from '../utils/indiaStates'
import './InvoiceNew.css'

const BUSINESS_STATE = 'Rajasthan'
const IGST_RATE = 18
const CGST_RATE = 9
const SGST_RATE = 9

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
  taxPct: 0,
  taxAmt: 0,
  amount: 0,
})

function mapApiItemToLine(line) {
  return {
    itemId: line.item_id != null && line.item_id !== '' ? String(line.item_id) : '',
    item: line.item ?? line.item_name ?? '',
    hsnCode: String(line.hsn_code ?? line.hsncode ?? ''),
    description: line.description ?? '',
    qty: Number(line.qty) || 1,
    unit: line.unit ?? 'NONE',
    price: Number(line.price) || 0,
    discountPct: Number(line.discount_pct) || 0,
    discountAmt: Number(line.discount_amt) || 0,
    taxPct: Number(line.tax_pct ?? line.gst) || IGST_RATE,
    taxAmt: Number(line.tax_amt) || 0,
    amount: Number(line.amount) || 0,
  }
}

/** When API returns `items: []` but header has amount/taxes — build one editable line. */
function buildSyntheticLineFromInvoice(inv) {
  const amt = Number(inv.amount ?? inv.payment ?? inv.paynow ?? 0)
  const cgst = Number(inv.cgst) || 0
  const sgst = Number(inv.sgst) || 0
  const igst = Number(inv.igst) || 0
  const taxAmt = round2(cgst + sgst + igst)
  let taxable = Number(inv.taxable_amt)
  if (!Number.isFinite(taxable) || taxable < 0) taxable = 0
  if (taxable === 0 && amt > 0) {
    if (taxAmt === 0) taxable = amt
    else taxable = Math.max(0, round2(amt - taxAmt))
  }
  const qty = 1
  const taxPctGuess =
    taxable > 0 && taxAmt > 0 ? round2((taxAmt / taxable) * 100) : Number(inv.gst) || 0
  return {
    itemId: '',
    item: inv.item_name ?? inv.description ?? 'Sales',
    hsnCode: '998319',
    description: '',
    qty,
    unit: 'NONE',
    price: taxable > 0 ? round2(taxable / qty) : amt,
    discountPct: 0,
    discountAmt: 0,
    taxPct: taxPctGuess,
    taxAmt,
    amount: amt,
  }
}

function resolveCustomerName(inv, customersList) {
  const direct = String(inv.customer ?? inv.customer_name ?? inv.partyname ?? '').trim()
  if (direct) return direct
  const pid = inv.pid ?? inv.customer_id ?? inv.party_id
  if (pid == null || !customersList?.length) return ''
  const c = customersList.find((x) => String(x.pid ?? x.id) === String(pid))
  return String(c?.partyname ?? c?.name ?? '').trim()
}

export default function InvoiceNew() {
  const navigate = useNavigate()
  const { id: editId } = useParams()
  const isEdit = Boolean(editId)
  const hydratedRef = useRef(false)
  const skipCustomerSyncRef = useRef(false)
  /** Skip one run of state→GST line recalc right after hydrate (otherwise lines reset to 0). */
  const skipStateSupplyTaxEffectRef = useRef(false)
  const [invoiceType, setInvoiceType] = useState('sale') // sale | purchase
  const [credit, setCredit] = useState(false)
  /** Full payment received now vs due later (paylater / balance). */
  const [isPaid, setIsPaid] = useState(true)
  const [customerInput, setCustomerInput] = useState('')
  const [billingName, setBillingName] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [stateOfSupply, setStateOfSupply] = useState('')
  const [lineItems, setLineItems] = useState([emptyLineItem()])
  const [priceType, setPriceType] = useState(PRICE_TYPE_WITH_TAX)
  const [roundOff, setRoundOff] = useState(true)
  const [roundOffValue, setRoundOffValue] = useState(0)
  const [refno, setRefno] = useState('')

  const { data: customersData } = useGetCustomersQuery(undefined, { skip: false })
  const customers = customersData?.data ?? []
  const { data: itemsData } = useGetItemsQuery(undefined, { skip: false })
  const items = itemsData?.data ?? []
  const [createInvoice, { isLoading: isCreating }] = useCreateInvoiceMutation()
  const [updateInvoice, { isLoading: isUpdating }] = useUpdateInvoiceMutation()
  const [createCustomer, { isLoading: isCreatingCustomer }] = useCreateCustomerMutation()
  const { data: invoiceRaw, isLoading: invoiceLoading, isError: invoiceError } = useGetInvoiceByIdQuery(
    editId,
    { skip: !isEdit }
  )

  const isSaving = isCreating || isUpdating

  const selectedCustomer = customers.find(
    (c) => (c.partyname || c.name || '').trim().toLowerCase() === customerInput.trim().toLowerCase()
  )
  const isSameState = stateOfSupply && stateOfSupply.trim() === BUSINESS_STATE

  useEffect(() => {
    if (!selectedCustomer) return
    if (skipCustomerSyncRef.current) {
      skipCustomerSyncRef.current = false
      return
    }
    if (selectedCustomer.state) setStateOfSupply(selectedCustomer.state)
    setBillingName(
      (selectedCustomer.billing_name && String(selectedCustomer.billing_name).trim()) ||
      selectedCustomer.partyname ||
      ''
    )
    setBillingAddress(
      (selectedCustomer.addr && String(selectedCustomer.addr).trim()) ||
      selectedCustomer.address ||
      ''
    )
  }, [selectedCustomer?.pid, selectedCustomer?.partyname])

  useEffect(() => {
    hydratedRef.current = false
  }, [editId])

  useEffect(() => {
    if (!isEdit || !editId) return
    const inv = invoiceRaw?.data ?? invoiceRaw
    if (!inv || typeof inv !== 'object' || Object.keys(inv).length === 0) return
    if (hydratedRef.current) return

    hydratedRef.current = true
    skipCustomerSyncRef.current = true
    skipStateSupplyTaxEffectRef.current = true

    setCustomerInput(resolveCustomerName(inv, customers))
    setBillingName(
      String(inv.billing_name ?? '').trim() ||
        resolveCustomerName(inv, customers) ||
        String(inv.customer ?? '').trim()
    )
    setBillingAddress(String(inv.addr ?? inv.billing_address ?? inv.address ?? '').trim())
    setInvoiceNumber(String(inv.inv_no ?? inv.invoice_no ?? ''))
    const dt = inv.dt ?? inv.date
    if (dt) setInvoiceDate(String(dt).slice(0, 10))
    setStateOfSupply(String(inv.state ?? inv.place_of_supply ?? inv.state_of_supply ?? '').trim())
    setRefno(String(inv.refno ?? '').trim())
    setCredit(inv.paytype === 1 || inv.paytype === '1' || inv.credit === true || inv.credit === 1)

    const invTotal = Number(inv.payment ?? inv.amount) || 0
    const pNow = Number(inv.paynow)
    const pLater = Number(inv.paylater)
    const bal = Number(inv.balance)
    const st = String(inv.status || '').toLowerCase()
    let paid = true
    if (st === 'pending' || st === 'unpaid' || st === 'overdue') paid = false
    else if (!Number.isNaN(pLater) && pLater > 0.005) paid = false
    else if (!Number.isNaN(bal) && bal > 0.005) paid = false
    else if (invTotal > 0 && !Number.isNaN(pNow) && pNow < invTotal - 0.005) paid = false
    setIsPaid(paid)

    const rawItems = Array.isArray(inv.items) ? inv.items : Array.isArray(inv.line_items) ? inv.line_items : []
    if (rawItems.length > 0) {
      const mapped = rawItems.map(mapApiItemToLine)
      const sumLines = mapped.reduce((s, l) => s + (Number(l.amount) || 0), 0)
      const pay = Number(inv.payment ?? inv.amount ?? inv.paynow) || 0
      const diff = round2(pay - sumLines)
      setLineItems(mapped)
      if (Math.abs(diff) > 0.001) {
        setRoundOff(true)
        setRoundOffValue(diff)
      } else {
        setRoundOff(false)
        setRoundOffValue(0)
      }
    } else if (Number(inv.amount ?? inv.payment ?? 0) > 0) {
      const mapped = [buildSyntheticLineFromInvoice(inv)]
      const sumLines = mapped.reduce((s, l) => s + (Number(l.amount) || 0), 0)
      const pay = Number(inv.payment ?? inv.amount ?? inv.paynow) || 0
      const diff = round2(pay - sumLines)
      setLineItems(mapped)
      if (Math.abs(diff) > 0.001) {
        setRoundOff(true)
        setRoundOffValue(diff)
      } else {
        setRoundOff(false)
        setRoundOffValue(0)
      }
    } else {
      setLineItems([emptyLineItem()])
    }
  }, [isEdit, editId, invoiceRaw])

  /** API often sends `customer: ""` and `pid` only — fill name when customers list loads. */
  useEffect(() => {
    if (!isEdit || !invoiceRaw || !customers.length) return
    const inv = invoiceRaw?.data ?? invoiceRaw
    if (!inv) return
    const name = resolveCustomerName(inv, customers)
    if (!name) return
    setCustomerInput((prev) => (prev.trim() ? prev : name))
    setBillingName((prev) => (prev.trim() ? prev : name))
  }, [isEdit, invoiceRaw, customers])

  const recalcLineAmount = (line, type) => {
    const qty = Number(line.qty) || 0
    const price = Number(line.price) || 0
    const taxPct = Number(line.taxPct) || 0
    const isWithTax = type === PRICE_TYPE_WITH_TAX
    if (isWithTax) {
      const amount = qty * price
      const taxAmt = taxPct > 0 ? round2((amount * taxPct) / (100 + taxPct)) : 0
      return { ...line, taxAmt, amount }
    }
    const discountPct = Number(line.discountPct) || 0
    const subtotal = qty * price
    const discountAmt = (subtotal * discountPct) / 100
    const afterDiscount = Math.max(0, subtotal - discountAmt)
    const taxAmt = round2((afterDiscount * taxPct) / 100)
    return { ...line, discountAmt, taxAmt, amount: Math.max(0, afterDiscount + taxAmt) }
  }

  useEffect(() => {
    if (!stateOfSupply || !stateOfSupply.trim()) return
    if (skipStateSupplyTaxEffectRef.current) {
      skipStateSupplyTaxEffectRef.current = false
      return
    }
    const rate = IGST_RATE
    setLineItems((prev) =>
      prev.map((line) => {
        const updated = { ...line, taxPct: rate }
        return recalcLineAmount(updated, priceType)
      })
    )
  }, [stateOfSupply])

  const updateLineItem = (index, field, value) => {
    setLineItems((prev) => {
      const next = prev.map((line, i) => (i === index ? { ...line, [field]: value } : line))
      const line = next[index]
      if (['qty', 'price', 'discountPct', 'discountAmt', 'taxPct', 'taxAmt'].includes(field)) {
        next[index] = recalcLineAmount(next[index], priceType)
      }
      return next
    })
  }

  const handleHeaderPriceTypeChange = (value) => {
    setPriceType(value)
    setLineItems((prev) => prev.map((line) => recalcLineAmount({ ...line }, value)))
  }

  const handleItemSelect = (index, itemId) => {
    if (!itemId) return
    const invItem = items.find((i) => String(i.id ?? i.item_id) === String(itemId))
    if (!invItem) return
    const qty = Number(lineItems[index]?.qty) || 1
    const price = Number(invItem.rate) || 0
    const taxPct = Number(invItem.gst) || IGST_RATE
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

  const addRow = () => setLineItems((prev) => [...prev, emptyLineItem()])
  const removeRow = (index) => {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = lineItems.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.price) || 0), 0)
  const totalDiscount = lineItems.reduce((sum, line) => sum + (Number(line.discountAmt) || 0), 0)
  const totalTax = lineItems.reduce((sum, line) => sum + (Number(line.taxAmt) || 0), 0)
  const totalBeforeRound = lineItems.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
  const total = totalBeforeRound + (roundOff ? (Number(roundOffValue) || 0) : 0)

  const handleSave = async () => {
    const nameTrim = customerInput.trim()
    if (!nameTrim) {
      alert('Please select or enter customer name.')
      return
    }
    let pid = selectedCustomer ? (selectedCustomer.pid ?? selectedCustomer.id) : null
    if (pid == null) {
      try {
        const res = await createCustomer({
          partyname: nameTrim,
          mobno: '',
          city: '',
          state: stateOfSupply || '',
          gst_reg: 0,
          same_state: 1,
        }).unwrap()
        const created = res?.data ?? res
        pid = created?.pid ?? created?.id ?? 0
      } catch (err) {
        console.error('Create customer failed:', err)
        alert(err?.data?.message || err?.data?.detail || 'Could not create customer. Try again.')
        return
      }
    }
    const sameState = stateOfSupply && stateOfSupply.trim() === BUSINESS_STATE
    const cgstAmt = sameState ? Math.round(totalTax / 2) : 0
    const sgstAmt = sameState ? Math.round(totalTax / 2) : 0
    const igstAmt = sameState ? 0 : Math.round(totalTax)
    const paymentTotal = Math.round(Number(total) || 0)
    const paynowVal = isPaid ? paymentTotal : 0
    const paylaterVal = isPaid ? 0 : paymentTotal
    const balanceVal = isPaid ? 0 : paymentTotal
    const payload = {
      inv_no: invoiceNumber || '',
      dt: invoiceDate,
      state: stateOfSupply || '',
      pid: Number(pid) || 0,
      addr: billingAddress.trim() || '',
      gst: 18,
      payment: paymentTotal,
      cgst: cgstAmt,
      sgst: sgstAmt,
      igst: igstAmt,
      paytype: credit ? 1 : 0,
      paynow: paynowVal,
      payby: 1,
      refno: refno.trim() || '',
      paylater: paylaterVal,
      balance: balanceVal,
      status: isPaid ? 'paid' : 'pending',
      items: lineItems.map((line) => ({
        item_id: line.itemId || undefined,
        item: line.item,
        hsn_code: line.hsnCode,
        description: line.description,
        qty: Number(line.qty) || 0,
        unit: line.unit,
        price: Number(line.price) || 0,
        discount_pct: Number(line.discountPct) || 0,
        discount_amt: Number(line.discountAmt) || 0,
        tax_pct: Number(line.taxPct) || 0,
        tax_amt: Number(line.taxAmt) || 0,
        amount: Number(line.amount) || 0,
      })),
    }
    try {
      if (isEdit && editId) {
        await updateInvoice({ id: editId, ...payload }).unwrap()
      } else {
        await createInvoice(payload).unwrap()
      }
      navigate('/invoices')
    } catch (err) {
      console.error(isEdit ? 'Update invoice failed:' : 'Create invoice failed:', err)
      alert(err?.data?.message || err?.data?.detail || (isEdit ? 'Could not update invoice.' : 'Could not save invoice.'))
    }
  }

  if (isEdit && invoiceLoading && !invoiceRaw) {
    return (
      <div className="invoice-new-page">
        <div className="page-loading" style={{ padding: '3rem', textAlign: 'center' }}>
          Loading invoice…
        </div>
      </div>
    )
  }

  if (isEdit && invoiceError) {
    return (
      <div className="invoice-new-page">
        <div className="page-loading" style={{ padding: '3rem', textAlign: 'center' }}>
          <p>Could not load this invoice.</p>
          <Link to="/invoices" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Back to invoices
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="invoice-new-page">
      <header className="invoice-new-header">
        <div className="invoice-new-header-left">
          <span className="invoice-new-title">{isEdit ? `Edit invoice #${invoiceNumber || editId}` : 'New sale'}</span>
          <Link to="/invoices" className="icon-btn" aria-label="Close">
            <X size={20} />
          </Link>
          <Link to="/invoices/new" className="icon-btn" aria-label="New invoice">
            <Plus size={20} />
          </Link>
        </div>
        <div className="invoice-new-header-right">
          <button type="button" className="icon-btn" aria-label="Calculator">
            <Calculator size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="Settings">
            <Settings size={18} />
          </button>
          <Link to="/invoices" className="icon-btn" aria-label="Close">
            <X size={20} />
          </Link>
        </div>
      </header>

      <div className="invoice-type-bar"><span className="invoice-type-label">Cash</span>
        <label className="toggle-wrap">
          <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
          <span className="toggle-slider" />
        </label>
        <span className="invoice-type-label invoice-type-cash">Bank</span>
      </div>

      <div className="invoice-paid-bar" role="group" aria-label="Payment status">
        <span className="invoice-paid-label">Payment</span>
        <div className="invoice-paid-segment">
          <button
            type="button"
            className={`invoice-paid-btn${isPaid ? ' invoice-paid-btn--active' : ''}`}
            onClick={() => setIsPaid(true)}
          >
            Paid
          </button>
          <button
            type="button"
            className={`invoice-paid-btn${!isPaid ? ' invoice-paid-btn--active' : ''}`}
            onClick={() => setIsPaid(false)}
          >
            Unpaid
          </button>
        </div>
        <span className="invoice-paid-hint">
          {isPaid ? 'Full amount in paynow; paylater & balance 0.' : `Total will go to paylater & balance until received.`}
        </span>
      </div>

      <div className="invoice-form-card card">
        <div className="invoice-form-row">
          <div className="form-group">
            <label>Customer <span className="required">*</span></label>
            <input
              type="text"
              value={customerInput}
              onChange={(e) => setCustomerInput(e.target.value)}
              list="customer-list"
              className="form-input"
              placeholder="Select or type customer name"
              required
            />
            <datalist id="customer-list">
              {customers.map((c) => (
                <option key={c.pid ?? c.id} value={c.partyname ?? c.name ?? `Party ${c.pid ?? c.id}`} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label>Billing Name (Optional)</label>
            <input
              type="text"
              value={billingName}
              onChange={(e) => setBillingName(e.target.value)}
              className="form-input"
              placeholder="Billing name"
            />
          </div>
          <div className="form-group">
            <label>Billing Address (Optional)</label>
            <input
              type="text"
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              className="form-input"
              placeholder="Billing address"
            />
          </div>
          <div className="form-group">
            <label>Invoice Number</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="form-input"
              placeholder="e.g. 1474"
            />
          </div>
          <div className="form-group">
            <label>Invoice Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>State of supply</label>
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
          </div>
          <div className="form-group">
            <label>Ref No</label>
            <input
              type="text"
              value={refno}
              onChange={(e) => setRefno(e.target.value)}
              className="form-input"
              placeholder="e.g. REF123"
            />
          </div>
        </div>

        <div className="invoice-items-section">
          <table className="invoice-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ITEM</th>
                <th>HSN CODE</th>
                <th>DESCRIPTION</th>
                <th>QTY</th>
                <th className="th-price-unit">
                  <span className="th-main">PRICE/UNIT</span>
                  <select
                    value={priceType}
                    onChange={(e) => handleHeaderPriceTypeChange(e.target.value)}
                    className="form-input input-sm price-type-select th-price-type-dropdown"
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
                  <td>{index + 1}</td>
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
                      value={line.qty}
                      onChange={(e) => updateLineItem(index, 'qty', e.target.value)}
                      className="form-input input-sm"
                    />
                  </td>
                  <td className="td-price-unit">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.price || ''}
                      onChange={(e) => updateLineItem(index, 'price', e.target.value)}
                      className="form-input input-sm"
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
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.taxAmt != null && line.taxAmt !== '' ? Number(line.taxAmt).toFixed(2) : ''}
                      onChange={(e) => updateLineItem(index, 'taxAmt', e.target.value)}
                      className="form-input input-sm"
                    />
                  </td>
                  <td className="amount-cell">{formatCurrency(line.amount)}</td>
                  <td>
                    <button type="button" className="btn-remove-row" onClick={() => removeRow(index)} aria-label="Remove row">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn-add-row" onClick={addRow}>
            <Plus size={16} />
            ADD ROW
          </button>
        </div>

        <div className="invoice-form-footer">
          <div className="footer-actions-left">
            <button type="button" className="btn-outline">ADD DESCRIPTION</button>
            <button type="button" className="btn-outline">ADD IMAGE</button>
            <button type="button" className="btn-outline">ADD DOCUMENT</button>
            {stateOfSupply && (
              <span className="tax-summary">
                {isSameState
                  ? `Intra-state: CGST ${CGST_RATE}% + SGST ${SGST_RATE}%`
                  : `Inter-state: IGST ${IGST_RATE}%`}
              </span>
            )}
          </div>
          <div className="footer-totals">
            <div className="total-row">
              <label>
                <input type="checkbox" checked={roundOff} onChange={(e) => setRoundOff(e.target.checked)} />
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
              <strong>{formatCurrency(total)}</strong>
            </div>
          </div>
        </div>

        <div className="invoice-form-submit">
          <button type="button" className="btn btn-secondary">
            Share
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isSaving || isCreatingCustomer}>
            {isSaving
              ? isEdit
                ? 'Updating...'
                : 'Saving...'
              : isCreatingCustomer
                ? 'Creating customer...'
                : isEdit
                  ? 'Update'
                  : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
