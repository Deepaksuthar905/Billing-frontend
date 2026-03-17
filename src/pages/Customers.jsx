import { useState } from 'react'
import { Plus, Search, Phone, X } from 'lucide-react'
import { useGetCustomersQuery, useCreateCustomerMutation } from '../store/api'
import { formatCurrency } from '../utils/format'
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
  gst_reg: 1,
  same_state: 1,
}

export default function Customers() {
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [viewCustomer, setViewCustomer] = useState(null)
  const [form, setForm] = useState(initialForm)

  const { data, isLoading, isError } = useGetCustomersQuery(search || undefined, {
    refetchOnMountOrArgChange: 120,
  })
  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation()

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
    try {
      await createCustomer({
        partyname: form.partyname.trim(),
        mobno: form.mobno.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        gst_reg: Number(form.gst_reg) || 0,
        same_state: Number(form.same_state) || 0,
      }).unwrap()
      setForm(initialForm)
      setModalOpen(false)
    } catch (err) {
      console.error('Create customer failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not add customer. Please try again.')
    }
  }

  const handleClose = () => {
    setForm(initialForm)
    setModalOpen(false)
  }

  return (
    <div className="customers-page">
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setModalOpen(true)}
        >
          <Plus size={18} />
          Add Customer
        </button>
      </div>

      <div className="card">
        <div className="filters-row">
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
                <th>Customer</th>
                <th>Contact</th>
                <th>City</th>
                <th>State</th>
                <th>GST No</th>
                <th>Outstanding</th>
                <th>Total Orders</th>
                <th></th>
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
                      onClick={() => setViewCustomer(c)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewCustomer && (
        <div className="modal-overlay" onClick={() => setViewCustomer(null)} role="presentation">
          <div className="modal-box modal-box--detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Customer Details</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setViewCustomer(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="customer-detail">
              <div className="detail-row">
                <span className="detail-label">Party / Name</span>
                <span className="detail-value">{viewCustomer.partyname ?? viewCustomer.name ?? '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Mobile No</span>
                <span className="detail-value">{viewCustomer.mobno ?? viewCustomer.phone ?? '—'}</span>
              </div>
              {(viewCustomer.billing_name != null && viewCustomer.billing_name !== '') && (
                <div className="detail-row">
                  <span className="detail-label">Billing Name</span>
                  <span className="detail-value">{viewCustomer.billing_name}</span>
                </div>
              )}
              {(viewCustomer.city != null && viewCustomer.city !== '') && (
                <div className="detail-row">
                  <span className="detail-label">City</span>
                  <span className="detail-value">{viewCustomer.city}</span>
                </div>
              )}
              {(viewCustomer.state != null && viewCustomer.state !== '') && (
                <div className="detail-row">
                  <span className="detail-label">State</span>
                  <span className="detail-value">{viewCustomer.state}</span>
                </div>
              )}
              {(viewCustomer.gst_no != null && viewCustomer.gst_no !== '') && (
                <div className="detail-row">
                  <span className="detail-label">GST No</span>
                  <span className="detail-value">{viewCustomer.gst_no ?? viewCustomer.gstin}</span>
                </div>
              )}
              {viewCustomer.cid != null && viewCustomer.cid !== '' && (
                <div className="detail-row">
                  <span className="detail-label">CID</span>
                  <span className="detail-value">{viewCustomer.cid}</span>
                </div>
              )}
              {viewCustomer.gst_reg != null && (
                <div className="detail-row">
                  <span className="detail-label">GST Registered</span>
                  <span className="detail-value">{viewCustomer.gst_reg === true || viewCustomer.gst_reg === 1 ? 'Yes' : 'No'}</span>
                </div>
              )}
              {viewCustomer.same_state != null && (
                <div className="detail-row">
                  <span className="detail-label">Same State</span>
                  <span className="detail-value">{viewCustomer.same_state === true || viewCustomer.same_state === 1 ? 'Yes' : 'No'}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Outstanding</span>
                <span className={`detail-value ${viewCustomer.balanceFormatted && viewCustomer.balanceFormatted !== '₹0' ? 'text-warning' : ''}`}>
                  {viewCustomer.balanceFormatted ?? (viewCustomer.balance != null ? formatCurrency(viewCustomer.balance) : '—')}
                </span>
              </div>
              {(viewCustomer.totalOrders != null && viewCustomer.totalOrders !== '') && (
                <div className="detail-row">
                  <span className="detail-label">Total Orders</span>
                  <span className="detail-value">{viewCustomer.totalOrders}</span>
                </div>
              )}
              <div className="detail-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setViewCustomer(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={handleClose} role="presentation">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Customer</h2>
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
                <input
                  id="state"
                  type="text"
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  placeholder="e.g. Maharashtra"
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
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
