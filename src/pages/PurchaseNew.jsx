import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { X, Plus, Calculator, Settings, FileText, Upload } from 'lucide-react'
import {
  useGetCustomersQuery,
  useCreateCustomerMutation,
  useGetItemsQuery,
  useCreateItemMutation,
  useCreatePurchaseOrderMutation,
} from '../store/api'
import { formatCurrency } from '../utils/format'
import './PurchaseNew.css'

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

export default function PurchaseNew() {
  const navigate = useNavigate()
  const [prhid, setPrhid] = useState('')
  const [pInvNo, setPInvNo] = useState('')
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10))
  const [stateOfSupply, setStateOfSupply] = useState('')
  const [lineItems, setLineItems] = useState([emptyLineItem()])
  const [priceType, setPriceType] = useState(PRICE_TYPE_WITH_TAX)
  const [roundOff, setRoundOff] = useState(true)
  const [roundOffValue, setRoundOffValue] = useState(0)
  const [refno, setRefno] = useState('')
  const [payby, setPayby] = useState('')
  const [showItemModal, setShowItemModal] = useState(false)
  const [itemModalForIndex, setItemModalForIndex] = useState(null)
  const [newItemForm, setNewItemForm] = useState({
    item_name: '',
    hsncode: '',
    description: '',
    rate: '',
    gst: '',
  })
  const [showPartyModal, setShowPartyModal] = useState(false)
  const [newPartyForm, setNewPartyForm] = useState({
    partyname: '',
    mobno: '',
    city: '',
    state: '',
    gst_reg: true,
    same_state: true,
  })

  const { data: customersData, refetch: refetchCustomers } = useGetCustomersQuery({ prtytyp: 1 }, { skip: false })
  const parties = customersData?.data ?? []
  const paybyAccounts = customersData?.payby ?? []
  const { data: itemsData, refetch: refetchItems } = useGetItemsQuery(undefined, { skip: false })
  const items = itemsData?.data ?? []
  const [createPurchaseOrder, { isLoading: isSaving }] = useCreatePurchaseOrderMutation()
  const [createItem, { isLoading: isCreatingItem }] = useCreateItemMutation()
  const [createCustomer, { isLoading: isCreatingParty }] = useCreateCustomerMutation()

  const selectedParty = parties.find((c) => String(c.pid ?? c.id) === String(prhid))

  const recalcLineAmount = (line, type) => {
    const qty = Number(line.qty) || 0
    const price = Number(line.price) || 0
    const taxPct = Number(line.taxPct) || 18
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
    const qty = Number(lineItems[index]?.qty) || 1
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

  const addRow = () => setLineItems((prev) => [...prev, emptyLineItem()])
  const removeRow = (index) => {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== index))
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
    setPrhid(value)
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
      if (createdId != null) setPrhid(String(createdId))
      closePartyModal()
    } catch (err) {
      console.error('Create party failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not add party. Please try again.')
    }
  }

  const closeItemModal = () => {
    setShowItemModal(false)
    setItemModalForIndex(null)
    setNewItemForm({ item_name: '', hsncode: '', description: '', rate: '', gst: '' })
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

  const totalQty = lineItems.reduce((sum, line) => sum + (Number(line.qty) || 0), 0)
  const totalDiscount = lineItems.reduce((sum, line) => sum + (Number(line.discountAmt) || 0), 0)
  const totalTax = lineItems.reduce((sum, line) => sum + (Number(line.taxAmt) || 0), 0)
  const totalBeforeRound = lineItems.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
  const total = totalBeforeRound + (roundOff ? (Number(roundOffValue) || 0) : 0)

  const handleSave = async () => {
    if (!prhid) {
      alert('Please select Party.')
      return
    }
    const sameState = stateOfSupply && stateOfSupply.trim() === BUSINESS_STATE
    const cgstAmt = sameState ? Math.round(totalTax / 2) : 0
    const sgstAmt = sameState ? Math.round(totalTax / 2) : 0
    const igstAmt = sameState ? 0 : Math.round(totalTax)
    const taxableAmt = Math.max(0, Math.round(totalBeforeRound - totalTax))
    const payload = {
      p_inv_no: pInvNo.trim(),
      dt: billDate,
      state: stateOfSupply.trim(),
      payment: Math.round(Number(total) || 0),
      prhid: Number(prhid) || 0,
      gst: cgstAmt + sgstAmt + igstAmt,
      taxable_amt: taxableAmt,
      cgst: cgstAmt,
      sgst: sgstAmt,
      igst: igstAmt,
      payby: payby !== '' ? Number(payby) : undefined,
      refno: refno.trim() || undefined,
      item_id: (() => {
        const ids = lineItems
          .map((line) => (line.itemId ? parseInt(line.itemId, 10) : 0))
          .filter((id) => id > 0)
        return ids.length > 0 ? ids[0] : 0
      })(),
    }
    try {
      await createPurchaseOrder(payload).unwrap()
      navigate('/purchase')
    } catch (err) {
      console.error('Create purchase failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not save purchase.')
    }
  }

  return (
    <div className="purchase-new-page">
      <header className="purchase-new-header">
        <div className="purchase-new-header-left">
          {/* <span className="purchase-new-title">Purchase {pInvNo}</span> */}
          {/* <Link to="/purchase" className="icon-btn" aria-label="Close">
            <X size={20} />
          </Link>
          <Link to="/purchase/new" className="icon-btn" aria-label="New purchase">
            <Plus size={20} />
          </Link> */}
        </div>
        <h1 className="purchase-new-heading">Purchase</h1>
        <div className="purchase-new-header-right">
          {/* <button type="button" className="icon-btn" aria-label="Calculator">
            <Calculator size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="Settings">
            <Settings size={18} />
          </button> */}
          <Link to="/purchase" className="icon-btn" aria-label="Close">
            <X size={20} />
          </Link>
        </div>
      </header>

      <div className="purchase-form-card card">
        <div className="purchase-form-row">
          <div className="form-group form-group--party">
            <label>Party <span className="required">*</span></label>
            <select
              value={prhid}
              onChange={(e) => handlePartyChange(e.target.value)}
              className="form-input"
              required
            >
              <option value="">Select party</option>
              {parties.map((c) => (
                <option key={c.pid ?? c.id} value={c.pid ?? c.id}>
                  {c.partyname ?? c.name ?? `Party ${c.pid ?? c.id}`}
                </option>
              ))}
              <option value="__add__">+ Add new party</option>
            </select>
          </div>
          <div className="form-group">
            <label>Bill Number</label>
            <input
              type="text"
              value={pInvNo}
              onChange={(e) => setPInvNo(e.target.value)}
              className="form-input"
              placeholder="e.g. PINV-001"
            />
          </div>
          <div className="form-group">
            <label>Bill Date</label>
            <input
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
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
              <option value="Rajasthan">Rajasthan</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Karnataka">Karnataka</option>
              <option value="Delhi">Delhi</option>
              <option value="Tamil Nadu">Tamil Nadu</option>
            </select>
          </div>
        </div>

        <div className="purchase-items-section">
          <table className="purchase-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ITEM</th>
                <th>HSN CODE</th>
                <th>DESCRIPTION</th>
                <th>QTY</th>
                <th>UNIT</th>
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
                {/* <th>DISCOUNT %</th> */}
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
                      value={line.qty}
                      onChange={(e) => updateLineItem(index, 'qty', e.target.value)}
                      className="form-input input-sm"
                    />
                  </td>
                  <td>
                    <select
                      value={line.unit}
                      onChange={(e) => updateLineItem(index, 'unit', e.target.value)}
                      className="form-input input-sm"
                    >
                      <option value="NONE">NONE</option>
                      <option value="PCS">PCS</option>
                      <option value="KG">KG</option>
                      <option value="LTR">LTR</option>
                      <option value="MTR">MTR</option>
                    </select>
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
                  {/* <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.discountPct || ''}
                      onChange={(e) => updateLineItem(index, 'discountPct', e.target.value)}
                      className="form-input input-sm"
                    />
                  </td> */}
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
                  <td className="amount-cell">{formatCurrency(line.taxAmt)}</td>
                  <td className="amount-cell">{formatCurrency(line.amount)}</td>
                  <td>
                    <button type="button" className="btn-remove-row" onClick={() => removeRow(index)} aria-label="Remove row">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td></td>
                <td colSpan="3">Total</td>
                <td>{totalQty}</td>
                <td colSpan="2"></td>
                {/* <td>{formatCurrency(totalDiscount)}</td> */}
                <td></td>
                <td>{formatCurrency(totalTax)}</td>
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

        <div className="purchase-form-footer">
          <div className="footer-left">
            <div className="form-group">
              <label>Payment Type</label>
              <select value={payby} onChange={(e) => setPayby(e.target.value)} className="form-input">
                <option value="">Select Pay By</option>
                {paybyAccounts.map((p) => (
                  <option key={p.pbid ?? p.id} value={p.pbid ?? p.id}>
                    {p.name ?? `PayBy ${p.pbid ?? p.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Reference No.</label>
              <input
                type="text"
                value={refno}
                onChange={(e) => setRefno(e.target.value)}
                className="form-input"
                placeholder="Ref no"
              />
            </div>
            {/* <button type="button" className="btn-link">+ Add Payment type</button>
            <button type="button" className="btn-outline">
              <FileText size={14} />
              ADD DESCRIPTION
            </button>
            <button type="button" className="btn-outline">
              <Upload size={14} />
              Upload Bill
            </button> */}
          </div>
          <div className="footer-right">
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
            <div className="footer-actions">
              <button type="button" className="btn btn-secondary">
                Share
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

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
                <label>Item Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={newItemForm.item_name}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, item_name: e.target.value }))}
                  className="form-input"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>HSN Code <span className="required">*</span></label>
                <input
                  type="text"
                  value={newItemForm.hsncode}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, hsncode: e.target.value }))}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Rate (₹)</label>
                <input
                  type="number"
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
                  step="0.01"
                  value={newItemForm.gst}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, gst: e.target.value }))}
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
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeItemModal} disabled={isCreatingItem}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCreateItem} disabled={isCreatingItem}>
                {isCreatingItem ? 'Saving...' : 'Submit'}
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
                <label>Party Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={newPartyForm.partyname}
                  onChange={(e) => setNewPartyForm((p) => ({ ...p, partyname: e.target.value }))}
                  className="form-input"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Mobile No <span className="required">*</span></label>
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
                <input
                  type="text"
                  value={newPartyForm.state}
                  onChange={(e) => setNewPartyForm((p) => ({ ...p, state: e.target.value }))}
                  className="form-input"
                />
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
