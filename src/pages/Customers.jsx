import { useEffect, useState } from 'react'
import { Plus, Search, Phone, X, Edit } from 'lucide-react'
import { useGetCustomersQuery, useCreateCustomerMutation, useUpdateCustomerMutation } from '../store/api'
import { formatCurrency } from '../utils/format'
import { INDIA_STATES } from '../utils/indiaStates'
import './Customers.css'

const fallbackCustomers = [
  { pid: 1, partyname: 'ABC Traders', mobno: '9876543210', city: 'Mumbai', state: 'Maharashtra', gst_no: '29AABCU9603R1ZM', gst_reg: true, same_state: true },
  { pid: 2, partyname: 'XYZ Store', mobno: '9876543211', city: 'Pune', state: 'Maharashtra', gst_no: null, gst_reg: false, same_state: true },
]

const initialForm = {
  partyname: '',
  mobno: '',
  city: '',
  state: '',
  addr: '',
  gst_no: '',
  gst_reg: 1,
  same_state: 1,
}

function rowToForm(c) {
  const state = (c.state ?? '').trim()
  return {
    partyname: (c.partyname ?? c.name ?? '').trim(),
    mobno: (c.mobno ?? c.phone ?? '').trim(),
    city: (c.city ?? '').trim(),
    state,
    addr: (c.addr ?? c.address ?? '').trim(),
    gst_no: (c.gst_no ?? c.gstin ?? '').trim(),
    gst_reg: c.gst_reg === true || c.gst_reg === 1 ? 1 : 0,
    same_state: state === 'Rajasthan' ? 1 : (c.same_state === true || c.same_state === 1 ? 1 : 0),
  }
}

export default function Customers() {
  const [partyKind, setPartyKind] = useState('customer')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPid, setEditingPid] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [gstLookupStatus, setGstLookupStatus] = useState('idle') // idle | loading | done | error

  const GST_LOOKUP_URL = import.meta.env.VITE_GST_LOOKUP_URL

  const vendorTypeMap = {
    purchaseVendor: 1,
    expenseVendor: 2,
  }
  const isVendor = partyKind in vendorTypeMap
  const currentVendorType = vendorTypeMap[partyKind]
  const partyLabel =
    partyKind === 'purchaseVendor'
      ? 'Purchase Vendor'
      : partyKind === 'expenseVendor'
        ? 'Expense Vendor'
        : 'Customer'

  const customerQueryArg =
    isVendor
      ? { search: search || undefined, prtytyp: currentVendorType }
      : { search: search || undefined }

  const { data, isLoading, isError } = useGetCustomersQuery(customerQueryArg, {
    refetchOnMountOrArgChange: 120,
  })
  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation()
  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation()

  const list = (isError || !data?.data ? fallbackCustomers : data.data).map((c) => ({
    ...c,
    id: c.pid ?? c.id,
    balanceFormatted: typeof c.balance === 'number' ? formatCurrency(c.balance) : (c.balance ?? '—'),
  }))

  useEffect(() => {
    if (!modalOpen) return
    if (!GST_LOOKUP_URL) return
    const gstin = (form.gst_no || '').trim().toUpperCase()
    if (gstin.length !== 15) return
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) return

    const handle = setTimeout(async () => {
      try {
        setGstLookupStatus('loading')
        const res = await fetch(`${GST_LOOKUP_URL}?gstin=${encodeURIComponent(gstin)}`)
        if (!res.ok) throw new Error(`GST lookup failed (${res.status})`)
        const payload = await res.json()
        const dataObj = payload?.data ?? payload?.result ?? payload

        const nextPartyName =
          (dataObj?.tradeName ?? dataObj?.trade_name ?? dataObj?.tradeNam ?? dataObj?.tnm ?? '').toString().trim() ||
          (dataObj?.legalName ?? dataObj?.legal_name ?? dataObj?.lgnm ?? '').toString().trim()
        const nextAddr =
          (dataObj?.addr ?? dataObj?.address ?? dataObj?.principalPlaceOfBusiness ?? dataObj?.pradr?.addr ?? '').toString().trim()
        const nextState = (dataObj?.state ?? dataObj?.stcd ?? '').toString().trim()

        setForm((prev) => ({
          ...prev,
          partyname: prev.partyname.trim() ? prev.partyname : (nextPartyName || prev.partyname),
          addr: prev.addr.trim() ? prev.addr : (nextAddr || prev.addr),
          state: prev.state.trim() ? prev.state : (nextState || prev.state),
          gst_reg: 1,
          same_state: (prev.state.trim() ? prev.state : nextState) === 'Rajasthan' ? 1 : 0,
        }))
        setGstLookupStatus('done')
      } catch (e) {
        console.warn('GST lookup failed:', e)
        setGstLookupStatus('error')
      }
    }, 500)

    return () => clearTimeout(handle)
  }, [GST_LOOKUP_URL, form.gst_no, modalOpen])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    if (name === 'state') {
      setForm((prev) => ({
        ...prev,
        state: value,
        same_state: value === 'Rajasthan' ? 1 : 0,
      }))
      return
    }
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? 1 : 0) : value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      partyname: form.partyname.trim(),
      mobno: form.mobno.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      addr: form.addr.trim(),
      gst_reg: Number(form.gst_reg) || 0,
      same_state: Number(form.same_state) || 0,
      ...(isVendor ? { prtytyp: currentVendorType } : {}),
    }
    if (editingPid != null) {
      payload.gst_no = form.gst_no.trim() || null
    } else if (form.gst_no.trim()) {
      payload.gst_no = form.gst_no.trim()
    }
    try {
      if (editingPid != null) {
        await updateCustomer({ pid: editingPid, ...payload }).unwrap()
      } else {
        await createCustomer(payload).unwrap()
      }
      setForm(initialForm)
      setEditingPid(null)
      setModalOpen(false)
    } catch (err) {
      console.error(editingPid != null ? 'Update failed:' : 'Create failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not save. Please try again.')
    }
  }

  const handleClose = () => {
    setForm(initialForm)
    setEditingPid(null)
    setModalOpen(false)
  }

  const openAddModal = () => {
    setEditingPid(null)
    setForm(initialForm)
    setModalOpen(true)
  }

  const openEditModal = (c) => {
    const pid = c.pid ?? c.id
    if (pid == null) return
    setEditingPid(Number(pid))
    setForm(rowToForm(c))
    setModalOpen(true)
  }

  return (
    <div className="customers-page">
      <div className="page-header">
        <h1 className="page-title">{isVendor ? partyLabel : 'Customers'}</h1>
        <button type="button" className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} />
          {isVendor ? `Add ${partyLabel}` : 'Add Customer'}
        </button>
      </div>

      <div className="card">
        <div className="filters-row customers-filters-row">
          <div className="party-kind-tabs" role="tablist" aria-label="Party type">
            <button
              type="button"
              role="tab"
              aria-selected={partyKind === 'customer'}
              className={`party-kind-tab ${partyKind === 'customer' ? 'party-kind-tab--active' : ''}`}
              onClick={() => setPartyKind('customer')}
            >
              Customer
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={partyKind === 'purchaseVendor'}
              className={`party-kind-tab ${partyKind === 'purchaseVendor' ? 'party-kind-tab--active' : ''}`}
              onClick={() => setPartyKind('purchaseVendor')}
            >
              Purchase Vendor
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={partyKind === 'expenseVendor'}
              className={`party-kind-tab ${partyKind === 'expenseVendor' ? 'party-kind-tab--active' : ''}`}
              onClick={() => setPartyKind('expenseVendor')}
            >
              Expense Vendor
            </button>
          </div>
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="search"
              placeholder="Search by name, phone, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        {isLoading && !data && <div className="page-loading">Loading...</div>}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{isVendor ? partyLabel : 'Customer'}</th>
                <th>Contact</th>
                <th>City</th>
                <th>State</th>
                <th>GST No</th>
                <th>Outstanding</th>
                <th>Total Orders</th>
                <th className="th-actions">Edit</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.pid ?? c.id ?? c.partyname}>
                  <td>
                    <div className="customer-name">
                      <span className="font-medium">{c.partyname ?? c.name ?? '—'}</span>
                      {(c.billing_name != null && c.billing_name !== '') && (
                        <span className="text-muted">{c.billing_name}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="contact-cell">
                      <span><Phone size={14} /> {c.mobno ?? c.phone ?? '—'}</span>
                    </div>
                  </td>
                  <td>{c.city ?? '—'}</td>
                  <td>{c.state ?? '—'}</td>
                  <td>{c.gst_no ?? c.gstin ?? '—'}</td>
                  <td className={c.balanceFormatted && c.balanceFormatted !== '₹0' && typeof c.balanceFormatted === 'string' ? 'text-warning' : ''}>
                    {c.balanceFormatted ?? '—'}
                  </td>
                  <td>{c.totalOrders ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label="Edit"
                      onClick={() => openEditModal(c)}
                    >
                      <Edit size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={handleClose} role="presentation">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingPid != null
                  ? isVendor
                    ? `Edit ${partyLabel}`
                    : 'Edit Customer'
                  : isVendor
                    ? `Add ${partyLabel}`
                    : 'Add Customer'}
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={handleClose}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="customer-form">
              <div className="form-group">
                <label htmlFor="partyname">Party Name <span className="required">*</span></label>
                <input
                  id="partyname"
                  type="text"
                  name="partyname"
                  value={form.partyname}
                  onChange={handleChange}
                  placeholder="Customer / Party name"
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="mobno">Mobile No <span className="required">*</span></label>
                <input
                  id="mobno"
                  type="tel"
                  name="mobno"
                  value={form.mobno}
                  onChange={handleChange}
                  placeholder="10-digit mobile number"
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="e.g. Mumbai"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="addr">Address</label>
                <input
                  id="addr"
                  type="text"
                  name="addr"
                  value={form.addr}
                  onChange={handleChange}
                  placeholder="Enter address"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="state">State</label>
                <select id="state" name="state" value={form.state} onChange={handleChange} className="form-input">
                  <option value="">Select</option>
                  {INDIA_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="gst_no">
                  GST No
                  {GST_LOOKUP_URL && modalOpen && gstLookupStatus === 'loading' ? <span className="text-muted"> (fetching...)</span> : null}
                </label>
                <input
                  id="gst_no"
                  type="text"
                  name="gst_no"
                  value={form.gst_no}
                  onChange={handleChange}
                  placeholder="e.g. 29AABCU9603R1ZM"
                  className="form-input"
                />
              </div>
              <div className="form-group form-row-check">
                <label className="form-check">
                  <input
                    type="checkbox"
                    name="gst_reg"
                    checked={form.gst_reg === 1}
                    onChange={handleChange}
                  />
                  <span>GST Registered</span>
                </label>
              </div>
              <div className="form-group form-row-check">
                <label className="form-check">
                  <input
                    type="checkbox"
                    name="same_state"
                    checked={form.same_state === 1}
                    onChange={handleChange}
                  />
                  <span>Same State</span>
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreating || isUpdating}>
                  {isCreating || isUpdating
                    ? 'Saving...'
                    : editingPid != null
                      ? isVendor
                        ? `Update ${partyLabel}`
                        : 'Update Customer'
                      : isVendor
                        ? `Save ${partyLabel}`
                        : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
