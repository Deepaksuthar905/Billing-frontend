import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Eye } from 'lucide-react'
import { useGetInvoicesQuery } from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'
import { getPendingAmount, invoiceDisplayNo, resolveInvoiceApiId } from '../utils/invoicePayment'

export default function InvoiceDueList() {
  const [search, setSearch] = useState('')

  // Reuse existing invoices list; filter in frontend for dues.
  const { data, isLoading, isError } = useGetInvoicesQuery({}, { refetchOnMountOrArgChange: 120 })
  const rows = data?.data ?? []

  const dueRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .map((inv) => {
        const due = getPendingAmount(inv)
        return {
          raw: inv,
          id: resolveInvoiceApiId(inv),
          invNo: invoiceDisplayNo(inv),
          dt: inv.dt ?? inv.date,
          party: inv.partyname ?? inv.customer ?? inv.customer_name ?? inv.party_relation?.partyname ?? '—',
          amount: Number(inv.payment ?? inv.amount) || 0,
          due,
        }
      })
      .filter((r) => r.due > 0.005)
      .filter((r) => {
        if (!q) return true
        return (
          String(r.invNo).toLowerCase().includes(q) ||
          String(r.party).toLowerCase().includes(q) ||
          String(r.due).toLowerCase().includes(q)
        )
      })
  }, [rows, search])

  const totalDue = useMemo(() => dueRows.reduce((s, r) => s + (Number(r.due) || 0), 0), [dueRows])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Due List</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted, #6b7280)' }}>
            Total Due: {formatCurrency(totalDue)}
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: '0.75rem 1rem' }}>
        <div className="exp-search-box" style={{ maxWidth: 320 }}>
          <Search size={16} className="exp-search-icon" />
          <input
            type="search"
            placeholder="Search invoice / party..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="exp-search-input"
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>DATE</th>
              <th>INVOICE</th>
              <th>PARTY</th>
              <th style={{ textAlign: 'right' }}>AMOUNT</th>
              <th style={{ textAlign: 'right' }}>DUE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted, #6b7280)' }}
                >
                  Loading...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted, #6b7280)' }}
                >
                  Could not load invoices.
                </td>
              </tr>
            ) : dueRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted, #6b7280)' }}
                >
                  No due invoices found.
                </td>
              </tr>
            ) : (
              dueRows.map((r) => (
                <tr key={r.id ?? `${r.invNo}-${r.dt}`}>
                  <td>{formatDate(r.dt)}</td>
                  <td className="font-medium">{r.invNo}</td>
                  <td>{r.party}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(r.amount)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(r.due)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {r.id ? (
                      <Link to={`/invoices/${r.id}/edit`} className="btn-icon" aria-label="Open invoice">
                        <Eye size={15} />
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

