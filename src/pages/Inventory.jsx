import { useState } from 'react'
import { Plus, Search, Filter, Boxes, AlertTriangle, X } from 'lucide-react'
import { useGetItemsQuery, useCreateItemMutation, useUpdateItemMutation } from '../store/api'
import './Inventory.css'

const fallbackItems = [
  { id: 'ITM-001', name: 'Product A', sku: 'SKU-A001', qty: 120, unit: 'pcs', lowStock: 20, status: 'In Stock' },
  { id: 'ITM-002', name: 'Product B', sku: 'SKU-B002', qty: 8, unit: 'pcs', lowStock: 15, status: 'Low Stock' },
  { id: 'ITM-003', name: 'Product C', sku: 'SKU-C003', qty: 45, unit: 'pcs', lowStock: 10, status: 'In Stock' },
]

const initialForm = {
  item_name: '',
  hsncode: '',
  description: '',
  rate: '',
  with_without: 1,
  gst: '',
  gst_amt: '',
}

function computeSummary(items) {
  if (!items?.length) return { totalItems: 0, lowStockCount: 0, outOfStockCount: 0 }
  let low = 0
  let out = 0
  items.forEach((i) => {
    if (i.status === 'Out of Stock') out++
    else if (i.status === 'Low Stock') low++
  })
  return {
    totalItems: items.length,
    lowStockCount: low,
    outOfStockCount: out,
  }
}

export default function Inventory() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState(initialForm)

  const { data, isLoading, isError } = useGetItemsQuery(
    { search: search || undefined, status: statusFilter || undefined },
    { refetchOnMountOrArgChange: 120 }
  )
  const [createItem, { isLoading: isCreating }] = useCreateItemMutation()
  const [updateItem, { isLoading: isUpdating }] = useUpdateItemMutation()

  const list = isError || !data?.data ? fallbackItems : data.data
  const summary = data?.summary ?? computeSummary(list)
  const isApiFormat = list.length > 0 && (list[0].item_id != null || list[0].item_name != null)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? 1 : 0) : value,
    }))
  }

  const openAddForm = () => {
    setEditingItem(null)
    setForm(initialForm)
    setModalOpen(true)
  }

  const openEditForm = (item) => {
    const id = item.item_id ?? item.id
    setEditingItem({ ...item, id })
    setForm({
      item_name: item.item_name ?? item.name ?? '',
      hsncode: item.hsncode ?? item.sku ?? '',
      description: item.description ?? '',
      rate: item.rate ?? '',
      with_without: item.with_without != null ? (item.with_without === 1 || item.with_without === true ? 1 : 0) : 1,
      gst: item.gst ?? '',
      gst_amt: item.gst_amt ?? '',
    })
    setModalOpen(true)
  }

  const handleClose = () => {
    setModalOpen(false)
    setEditingItem(null)
    setForm(initialForm)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      item_name: form.item_name.trim(),
      hsncode: form.hsncode.trim(),
      description: form.description.trim() || undefined,
      rate: Number(form.rate) || 0,
      with_without: Number(form.with_without) || 0,
      gst: Number(form.gst) || 0,
      gst_amt: Number(form.gst_amt) || 0,
    }
    try {
      if (editingItem) {
        await updateItem({ id: editingItem.id, ...payload }).unwrap()
      } else {
        await createItem(payload).unwrap()
      }
      handleClose()
    } catch (err) {
      console.error('Item save failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not save item. Please try again.')
    }
  }

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h1 className="page-title">Inventory</h1>
        <button type="button" className="btn btn-primary" onClick={openAddForm}>
          <Plus size={18} />
          Add Item
        </button>
      </div>

      <div className="card">
        <div className="filters-row">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="search"
              placeholder="Search by name, HSN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          {!isApiFormat && (
            <select
              className="select-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All status</option>
              <option value="In Stock">In Stock</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          )}
          <button type="button" className="btn btn-secondary btn-sm">
            <Filter size={16} />
            Filter
          </button>
        </div>
        {isLoading && !data && <div className="page-loading">Loading...</div>}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item Name</th>
                <th>HSN Code</th>
                <th>Description</th>
                <th>Rate (₹)</th>
                <th>GST %</th>
                <th>GST Amt (₹)</th>
                {!isApiFormat && <th>Status</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((item, index) => (
                <tr key={item.id ?? item.item_id ?? index}>
                  <td>{item.item_id ?? item.id ?? index + 1}</td>
                  <td className="font-medium">{item.item_name ?? item.name ?? '—'}</td>
                  <td>{item.hsncode ?? item.sku ?? '—'}</td>
                  <td>{item.description ?? '—'}</td>
                  <td>{item.rate ?? '—'}</td>
                  <td>{item.gst ?? '—'}</td>
                  <td>{item.gst_amt ?? '—'}</td>
                  {!isApiFormat && (
                    <td>
                      <span className={`badge badge--${item.status === 'In Stock' ? 'paid' : item.status === 'Low Stock' ? 'pending' : 'overdue'}`}>
                        {item.status ?? '—'}
                      </span>
                    </td>
                  )}
                  <td>
                    <button type="button" className="btn-icon" onClick={() => openEditForm(item)}>
                      Edit
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
              <h2 className="modal-title">{editingItem ? 'Edit Item' : 'Add Item'}</h2>
              <button type="button" className="modal-close" onClick={handleClose} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="item-form">
              <div className="form-group">
                <label htmlFor="item_name">Item Name <span className="required">*</span></label>
                <input
                  id="item_name"
                  type="text"
                  name="item_name"
                  value={form.item_name}
                  onChange={handleChange}
                  placeholder="e.g. Widget A"
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="hsncode">HSN Code <span className="required">*</span></label>
                <input
                  id="hsncode"
                  type="text"
                  name="hsncode"
                  value={form.hsncode}
                  onChange={handleChange}
                  placeholder="e.g. 8471"
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Sample item"
                  rows={2}
                  className="form-input form-textarea"
                />
              </div>
              <div className="form-group">
                <label htmlFor="rate">Rate (₹) <span className="required">*</span></label>
                <input
                  id="rate"
                  type="number"
                  name="rate"
                  value={form.rate}
                  onChange={handleChange}
                  placeholder="100"
                  min="0"
                  step="0.01"
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group form-row-check">
                <label className="form-check">
                  <input
                    type="checkbox"
                    name="with_without"
                    checked={form.with_without === 1}
                    onChange={handleChange}
                  />
                  <span>With / Without (GST)</span>
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="gst">GST %</label>
                <input
                  id="gst"
                  type="number"
                  name="gst"
                  value={form.gst}
                  onChange={handleChange}
                  placeholder="18"
                  min="0"
                  max="100"
                  step="0.01"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="gst_amt">GST Amt (₹)</label>
                <input
                  id="gst_amt"
                  type="number"
                  name="gst_amt"
                  value={form.gst_amt}
                  onChange={handleChange}
                  placeholder="18"
                  min="0"
                  step="0.01"
                  className="form-input"
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreating || isUpdating}>
                  {isCreating || isUpdating ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
