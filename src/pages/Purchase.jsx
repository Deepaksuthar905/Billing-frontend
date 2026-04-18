import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Filter, Package, Users, Trash2, Edit } from 'lucide-react'
import { useGetPurchaseOrdersQuery, useGetCustomersQuery, useCreatePurchaseOrderMutation, useDeletePurchaseOrderMutation } from '../store/api'
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

export default function Purchase() {
  const [activeTab, setActiveTab] = useState('orders')
  const [search, setSearch] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState(null)

  const [deletePurchaseOrder, { isLoading: isDeleting }] = useDeletePurchaseOrderMutation()

  const { data: poData, isLoading: poLoading, isError: poError } = useGetPurchaseOrdersQuery(
    search || undefined,
    { refetchOnMountOrArgChange: 120 }
  )
  const { data: customersData, isLoading: customersLoading, isError: customersError } = useGetCustomersQuery(
    { search: search || undefined, prtytyp: 1 },
    { refetchOnMountOrArgChange: 120 }
  )
  const purchaseOrders = (poError || !poData?.data ? fallbackPOs : poData.data).map((po) => {
    const amountOrTotal = po.amount ?? po.total
    return {
      ...po,
      totalFormatted: typeof amountOrTotal === 'number' ? formatCurrency(amountOrTotal) : (amountOrTotal != null ? String(amountOrTotal) : '—'),
      dateFormatted: formatDate(po.date),
      p_inv_no: po.p_inv_no ?? '—',
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
        <Link to="/purchase/new" className="btn btn-primary">
          <Plus size={18} />
          New Purchase Order
        </Link>
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
                  {/* <th>PO</th> */}
                  <th>S No.</th>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po, index) => (
                  <tr key={po.prid ?? po.id ?? index}>
                    {/* <td className="font-medium">{po.id}</td> */}
                    <td className="font-medium">{index + 1}</td>
                    <td>{po.p_inv_no ?? '—'}</td>
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
                      <div className="action-btns">
                        <Link
                          to={`/purchase/new?prid=${po.prid ?? po.id}`}
                          state={{ purchase: po }}
                          className="btn-icon"
                          aria-label="Edit purchase"
                        >
                          <Edit size={15} />
                        </Link>
                        <button
                          type="button"
                          className="btn-icon btn-icon--danger"
                          aria-label="Delete"
                          onClick={() => setDeleteTargetId(po.prid ?? po.id)}
                        >
                          <Trash2 size={15} color='red' />
                        </button>
                      </div>
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

      {deleteTargetId && (
        <div className="modal-overlay" onClick={() => setDeleteTargetId(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Delete Purchase Order</span>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text, #1f2937)' }}>
                Are you sure you want to delete purchase order ?
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteTargetId(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    await deletePurchaseOrder(deleteTargetId).unwrap()
                    setDeleteTargetId(null)
                  } catch (err) {
                    console.error('Delete failed:', err)
                    alert(err?.data?.message || 'Could not delete purchase order.')
                  }
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
