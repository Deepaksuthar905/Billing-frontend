import { useState } from 'react'
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
  gst_no: '',
  gst_reg: 1,
  same_state: 1,
}

function rowToForm(c) {
  return {
    partyname: (c.partyname ?? c.name ?? '').trim(),
    mobno: (c.mobno ?? c.phone ?? '').trim(),
    city: (c.city ?? '').trim(),
    state: (c.state ?? '').trim(),
    gst_no: (c.gst_no ?? c.gstin ?? '').trim(),
    gst_reg: c.gst_reg === true || c.gst_reg === 1 ? 1 : 0,
    same_state: c.same_state === true || c.same_state === 1 ? 1 : 0,
  }
}

export default function Customers() {
  const [partyKind, setPartyKind] = useState('customer')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPid, setEditingPid] = useState(null)
  const [form, setForm] = useState(initialForm)

  const customerQueryArg =
    partyKind === 'vendor'
      ? { search: search || undefined, prtytyp: 1 }
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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
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
      gst_reg: Number(form.gst_reg) || 0,
      same_state: Number(form.same_state) || 0,
      ...(partyKind === 'vendor' ? { prtytyp: 1 } : {}),
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
        <h1 className="page-title">{partyKind === 'vendor' ? 'Vendors' : 'Customers'}</h1>
        <button type="button" className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} />
          {partyKind === 'vendor' ? 'Add Vendor' : 'Add Customer'}
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
              aria-selected={partyKind === 'vendor'}
              className={`party-kind-tab ${partyKind === 'vendor' ? 'party-kind-tab--active' : ''}`}
              onClick={() => setPartyKind('vendor')}
            >
              Vendor
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
                <th>{partyKind === 'vendor' ? 'Vendor' : 'Customer'}</th>
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
                  ? partyKind === 'vendor'
                    ? 'Edit Vendor'
                    : 'Edit Customer'
                  : partyKind === 'vendor'
                    ? 'Add Vendor'
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
                <label htmlFor="gst_no">GST No</label>
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
                      ? partyKind === 'vendor'
                        ? 'Update Vendor'
                        : 'Update Customer'
                      : partyKind === 'vendor'
                        ? 'Save Vendor'
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
