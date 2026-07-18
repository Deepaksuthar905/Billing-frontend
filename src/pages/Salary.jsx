import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Edit, Plus, Search, UserPlus } from 'lucide-react'
import { useGetSalaryPaymentsQuery } from '../store/api'
import { formatCurrency, formatDate } from '../utils/format'
import { formatSalaryMonth } from '../utils/salaryDeductions'
import EmployeeModal from '../components/EmployeeModal'
import SalaryReceiptModal from '../components/SalaryReceiptModal'
import './Salary.css'

function toYmdLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function currentMonthRange() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: toYmdLocal(start), to: toYmdLocal(today) }
}

export default function Salary() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState(() => currentMonthRange().from)
  const [to, setTo] = useState(() => currentMonthRange().to)
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false)
  const [receiptRow, setReceiptRow] = useState(null)

  const { data, isLoading, isError, refetch } = useGetSalaryPaymentsQuery(
    { from: from || undefined, to: to || undefined },
    { refetchOnMountOrArgChange: 120 }
  )

  const rows = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const emp = r.employee ?? {}
      const name = emp.empname ?? r.empname ?? ''
      const code = emp.emp_code ?? ''
      const receipt = r.receipt_no ?? ''
      const month = r.salary_month ?? ''
      return (
        String(name).toLowerCase().includes(q) ||
        String(code).toLowerCase().includes(q) ||
        String(receipt).toLowerCase().includes(q) ||
        String(month).toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const totalNet = useMemo(
    () => filtered.reduce((s, r) => s + (Number(r.net_amt) || 0), 0),
    [filtered]
  )

  useEffect(() => {
    if (!employeeModalOpen) refetch()
  }, [employeeModalOpen, refetch])

  return (
    <div className="page salary-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Salary</h1>
          <p className="salary-subtitle">Total paid: {formatCurrency(totalNet, 2)}</p>
        </div>
        <div className="salary-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEmployeeModalOpen(true)}>
            <UserPlus size={18} />
            Create Employee
          </button>
          <Link to="/salary/new" className="btn btn-primary">
            <Plus size={18} />
            Pay Salary
          </Link>
        </div>
      </div>

      <div className="card salary-filters">
        <div className="salary-filters-row">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="search"
              placeholder="Search employee, receipt, month…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          <label className="salary-date-field">
            <span>From</span>
            <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="salary-date-field">
            <span>To</span>
            <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Employee</th>
              <th>Emp Id</th>
              <th>Pay Period</th>
              <th>Pay Date</th>
              <th>Paid Via</th>
              <th style={{ textAlign: 'right' }}>Net Payable</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="salary-empty">Loading…</td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={8} className="salary-empty">Could not load salary payments.</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="salary-empty">No salary payments yet. Create an employee and pay salary.</td>
              </tr>
            ) : (
              filtered.map((r) => {
                const emp = r.employee ?? {}
                const payBy = r.pay_by ?? r.payBy ?? {}
                const salid = r.salid ?? r.id
                return (
                  <tr key={salid ?? r.receipt_no}>
                    <td className="font-medium">{r.receipt_no ?? '—'}</td>
                    <td>{emp.empname ?? r.empname ?? '—'}</td>
                    <td>{emp.emp_code ?? '—'}</td>
                    <td>{formatSalaryMonth(r.salary_month)}</td>
                    <td>{formatDate(r.dt)}</td>
                    <td>{payBy.name ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(r.net_amt, 2)}</td>
                    <td>
                      <div className="salary-row-actions">
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Edit salary"
                          title="Edit"
                          onClick={() =>
                            navigate(`/salary/${salid}/edit`, { state: { payment: r } })
                          }
                          disabled={salid == null}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Download receipt"
                          title="PDF"
                          onClick={() => setReceiptRow(r)}
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {employeeModalOpen && (
        <EmployeeModal
          onClose={() => setEmployeeModalOpen(false)}
          onSuccess={() => refetch()}
        />
      )}

      {receiptRow && (
        <SalaryReceiptModal
          payment={receiptRow}
          onClose={() => setReceiptRow(null)}
        />
      )}
    </div>
  )
}
