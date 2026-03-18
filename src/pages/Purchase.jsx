import { useState } from 'react'
import { Plus, Search, Filter, Package, Users, X } from 'lucide-react'
import { useGetPurchaseOrdersQuery, useGetCustomersQuery, useCreatePurchaseOrderMutation } from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'
import './Purchase.css'

const fallbackPOs = [
  { id: 'PO-101', date: '2025-03-15', vendor: 'Supplier A', items: 8, total: 32000, status: 'Received' },
  { id: 'PO-102', date: '2025-03-14', vendor: 'Supplier B', items: 5, total: 15400, status: 'Pending' },
  { id: 'PO-103', date: '2025-03-13', vendor: 'Supplier C', items: 12, total: 28600, status: 'Received' },
  { id: 'PO-104', date: '2025-03-12', vendor: 'Supplier D', items: 3, total: 9200, status: 'Partial' },
]

const fallbackVendors = [
  { id: 'v1', name: 'Supplier A', contact: '9876543210', balance: 0, lastOrder: '2025-03-15' },
  { id: 'v2', name: 'Supplier B', contact: '9876543211', balance: 5400, lastOrder: '2025-03-14' },
  { id: 'v3', name: 'Supplier C', contact: '9876543212', balance: 0, lastOrder: '2025-03-13' },
]

const initialForm = {
  p_inv_no: '',
  dt: new Date().toISOString().slice(0, 10),
  state: '',
  payment: '',
  prhid: '',
  gst: '',
  cgst: '',
  sgst: '',
  igst: '',
  payby: 1,
  refno: '',
}

export default function Purchase() {
  const [activeTab, setActiveTab] = useState('orders')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(initialForm)

  const { data: poData, isLoading: poLoading, isError: poError } = useGetPurchaseOrdersQuery(
    search || undefined,
    { refetchOnMountOrArgChange: 120 }
  )
  const { data: customersData, isLoading: customersLoading, isError: customersError } = useGetCustomersQuery(
    search || undefined,
    { refetchOnMountOrArgChange: 120 }
  )
  const [createPurchaseOrder, { isLoading: isCreating }] = useCreatePurchaseOrderMutation()

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmitPurchase = async (e) => {
    e.preventDefault()
    const payload = {
      p_inv_no: form.p_inv_no.trim(),
      dt: form.dt,
      state: form.state.trim(),
      payment: Number(form.payment) || 0,
      prhid: Number(form.prhid) || 0,
      gst: Number(form.gst) || 0,
      cgst: Number(form.cgst) || 0,
      sgst: Number(form.sgst) || 0,
      igst: Number(form.igst) || 0,
      payby: Number(form.payby) || 1,
      refno: form.refno.trim() || undefined,
    }
    try {
      await createPurchaseOrder(payload).unwrap()
      setForm(initialForm)
      setModalOpen(false)
    } catch (err) {
      console.error('Create purchase failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not add purchase. Please try again.')
    }
  }

  const purchaseOrders = (poError || !poData?.data ? fallbackPOs : poData.data).map((po) => {
    const amountOrTotal = po.amount ?? po.total
    return {
      ...po,
      totalFormatted: typeof amountOrTotal === 'number' ? formatCurrency(amountOrTotal) : (amountOrTotal != null ? String(amountOrTotal) : '—'),
      dateFormatted: formatDate(po.date),
      statusDisplay: (po.status || '').charAt(0).toUpperCase() + (po.status || '').slice(1).toLowerCase(),
      statusClass: (po.status || '').toLowerCase() === 'completed' || (po.status || '').toLowerCase() === 'received' ? 'paid' : (po.status || '').toLowerCase() === 'pending' ? 'pending' : 'overdue',
    }
  })

  const vendors = (customersError || !customersData?.data ? fallbackVendors : customersData.data).map((c) => ({
    id: c.pid ?? c.id,
    name: c.partyname ?? c.name ?? `Party ${c.pid ?? c.id}`,
    contact: c.mobno ?? c.contact ?? '—',
    balance: c.balance ?? 0,
    lastOrder: c.last_order ?? c.lastOrder ?? '',
    balanceFormatted: typeof (c.balance ?? 0) === 'number' ? formatCurrency(c.balance) : (c.balance ?? '—'),
    lastOrderFormatted: formatDate(c.last_order ?? c.lastOrder),
  }))

  return (
    <div className="purchase-page">
      <div className="page-header">
        <h1 className="page-title">Purchase</h1>
        <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={18} />
          New Purchase Order
        </button>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'orders' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <Package size={18} />
          Purchase Orders
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'vendors' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('vendors')}
        >
          <Users size={18} />
          Vendors
        </button>
      </div>

      {activeTab === 'orders' && (
        <div className="card">
          <div className="filters-row">
            <div className="search-box">
              <Search size={18} className="search-icon" />
              <input
                type="search"
                placeholder="Search by PO #, vendor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
            </div>
            <button type="button" className="btn btn-secondary btn-sm">
              <Filter size={16} />
              Filter
            </button>
          </div>
          {poLoading && !poData && <div className="page-loading">Loading...</div>}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po) => (
                  <tr key={po.id}>
                    <td className="font-medium">{po.id}</td>
                    <td>{po.dateFormatted}</td>
                    <td>{po.vendor}</td>
                    <td>{po.items ?? '—'}</td>
                    <td>{po.totalFormatted}</td>
                    <td>
                      <span className={`badge badge--${po.statusClass ?? (po.status === 'Received' ? 'paid' : po.status === 'Pending' ? 'pending' : 'overdue')}`}>
                        {po.statusDisplay ?? po.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn-icon">→</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'vendors' && (
        <div className="card">
          <div className="filters-row">
            <div className="search-box">
              <Search size={18} className="search-icon" />
            <input
              type="search"
              placeholder="Search by name, contact..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
            </div>
            <button type="button" className="btn btn-primary btn-sm">
              <Plus size={16} />
              Add Vendor
            </button>
          </div>
          {customersLoading && !customersData && <div className="page-loading">Loading...</div>}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendor Name</th>
                  <th>Contact</th>
                  <th>Outstanding</th>
                  <th>Last Order</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id || v.name}>
                    <td className="font-medium">{v.name}</td>
                    <td>{v.contact}</td>
                    <td>{v.balanceFormatted ?? formatCurrency(v.balance)}</td>
                    <td>{v.lastOrderFormatted ?? v.lastOrder}</td>
                    <td>
                      <button type="button" className="btn-icon">→</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)} role="presentation">
          <div className="modal-box modal-box--purchase" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Purchase</h2>
              <button type="button" className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitPurchase} className="purchase-form">
              <div className="form-group">
                <label htmlFor="p_inv_no">Purchase Invoice No <span className="required">*</span></label>
                <input id="p_inv_no" type="text" name="p_inv_no" value={form.p_inv_no} onChange={handleFormChange} placeholder="PINV-001" required className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="dt">Date <span className="required">*</span></label>
                <input id="dt" type="date" name="dt" value={form.dt} onChange={handleFormChange} required className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="state">State</label>
                <input id="state" type="text" name="state" value={form.state} onChange={handleFormChange} placeholder="e.g. Maharashtra" className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="prhid">Party (prhid) <span className="required">*</span></label>
                <input id="prhid" type="number" name="prhid" value={form.prhid} onChange={handleFormChange} placeholder="1" min="1" required className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="payment">Payment (₹)</label>
                <input id="payment" type="number" name="payment" value={form.payment} onChange={handleFormChange} placeholder="100" min="0" step="0.01" className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="gst">GST %</label>
                <input id="gst" type="number" name="gst" value={form.gst} onChange={handleFormChange} placeholder="18" min="0" max="100" step="0.01" className="form-input" />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="cgst">CGST %</label>
                  <input id="cgst" type="number" name="cgst" value={form.cgst} onChange={handleFormChange} placeholder="9" min="0" step="0.01" className="form-input" />
                </div>
                <div className="form-group">
                  <label htmlFor="sgst">SGST %</label>
                  <input id="sgst" type="number" name="sgst" value={form.sgst} onChange={handleFormChange} placeholder="9" min="0" step="0.01" className="form-input" />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="igst">IGST %</label>
                <input id="igst" type="number" name="igst" value={form.igst} onChange={handleFormChange} placeholder="0" min="0" step="0.01" className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="payby">Pay By</label>
                <select id="payby" name="payby" value={form.payby} onChange={handleFormChange} className="form-input">
                  <option value={1}>1 - Cash/Other</option>
                  <option value={2}>2 - Card</option>
                  <option value={3}>3 - UPI</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="refno">Reference No</label>
                <input id="refno" type="text" name="refno" value={form.refno} onChange={handleFormChange} placeholder="REF-001" className="form-input" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>{isCreating ? 'Saving...' : 'Add Purchase'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
