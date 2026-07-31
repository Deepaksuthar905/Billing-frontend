import { Fragment, useMemo, useState } from 'react'
import { Calculator, ChevronDown, GitCompareArrows, RefreshCw } from 'lucide-react'
import {
  useCompareMonthlyReportsQuery,
  useGenerateMonthlyReportMutation,
  useGetMonthlyReportsQuery,
} from '../store/api'
import { formatCurrency } from '../utils/format'
import { formatSalaryMonth, lastSalaryMonth } from '../utils/salaryDeductions'

function fmtDateTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function pctChange(oldVal, newVal) {
  const a = Number(oldVal) || 0
  const b = Number(newVal) || 0
  if (a === 0) return null
  return ((b - a) / Math.abs(a)) * 100
}

function ChangeBadge({ from, to, invert = false }) {
  const pct = pctChange(from, to)
  if (pct == null) return <span className="monthly-change">—</span>
  const rounded = Math.round(pct * 10) / 10
  // invert: for expenses, increase is "bad" (red)
  const positive = invert ? rounded <= 0 : rounded >= 0
  return (
    <span className={`monthly-change ${positive ? 'monthly-change--up' : 'monthly-change--down'}`}>
      {rounded > 0 ? '+' : ''}{rounded}%
    </span>
  )
}

export default function MonthlyReport() {
  const [genMonth, setGenMonth] = useState(lastSalaryMonth())
  const [expandedMrid, setExpandedMrid] = useState(null)

  const [cmpMonth1, setCmpMonth1] = useState('')
  const [cmpMonth2, setCmpMonth2] = useState('')
  const [appliedCompare, setAppliedCompare] = useState(null)

  const { data, isLoading, isError, refetch } = useGetMonthlyReportsQuery({})
  const [generateReport, { isLoading: isGenerating }] = useGenerateMonthlyReportMutation()

  const {
    data: compareData,
    isLoading: compareLoading,
    isError: compareError,
  } = useCompareMonthlyReportsQuery(appliedCompare ?? { month1: '', month2: '' }, {
    skip: !appliedCompare,
  })

  const rows = data?.data ?? []

  const handleGenerate = async () => {
    if (!genMonth) {
      alert('Please select a month.')
      return
    }
    try {
      await generateReport({ month: genMonth }).unwrap()
      refetch()
    } catch (err) {
      console.error('Generate monthly report failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not generate report.')
    }
  }

  const handleCompare = () => {
    if (!cmpMonth1 || !cmpMonth2) {
      alert('Please select both months to compare.')
      return
    }
    if (cmpMonth1 === cmpMonth2) {
      alert('Please select two different months.')
      return
    }
    setAppliedCompare({ month1: cmpMonth1, month2: cmpMonth2 })
  }

  const m1 = compareData?.month1 ?? null
  const m2 = compareData?.month2 ?? null

  /** Union of expense heads across both months for the comparison table */
  const compareHeads = useMemo(() => {
    if (!m1 || !m2) return []
    const map = new Map()
    for (const src of [m1, m2]) {
      for (const h of src?.expense_by_head ?? []) {
        const key = h.exhid != null ? String(h.exhid) : `name:${h.name}`
        if (!map.has(key)) map.set(key, h.name)
      }
    }
    const findTotal = (src, key) => {
      const list = src?.expense_by_head ?? []
      const hit = list.find((h) => (h.exhid != null ? String(h.exhid) : `name:${h.name}`) === key)
      return Number(hit?.total) || 0
    }
    return Array.from(map.entries()).map(([key, name]) => ({
      key,
      name,
      total1: findTotal(m1, key),
      total2: findTotal(m2, key),
    }))
  }, [m1, m2])

  return (
    <div className="monthly-report">
      {/* ── Generate toolbar ── */}
      <div className="card monthly-toolbar">
        <div className="monthly-toolbar-left">
          <label className="monthly-month-field">
            <span>Report Month</span>
            <input
              type="month"
              className="form-input"
              value={genMonth}
              onChange={(e) => setGenMonth(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={isGenerating}
          title="Calculate totals for this month and save into monthly_reports"
        >
          <Calculator size={18} />
          {isGenerating ? 'Calculating…' : 'Calculate & Save'}
        </button>
      </div>

      {/* ── Stored reports list ── */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 className="card-title monthly-card-title">
          Monthly Reports
          <button type="button" className="btn-icon" aria-label="Refresh" onClick={() => refetch()}>
            <RefreshCw size={15} />
          </button>
        </h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Month</th>
                <th style={{ textAlign: 'right' }}>Total Invoices</th>
                <th style={{ textAlign: 'right' }}>Invoice Amount</th>
                <th style={{ textAlign: 'right' }}>Total Expenses (count)</th>
                <th style={{ textAlign: 'right' }}>Expense Amount</th>
                <th style={{ textAlign: 'right' }}>Net (Inv − Exp)</th>
                <th>Last Calculated</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="monthly-empty">Loading…</td></tr>
              ) : isError ? (
                <tr><td colSpan={8} className="monthly-empty">Could not load monthly reports.</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="monthly-empty">No reports yet. Select a month and click "Calculate &amp; Save".</td></tr>
              ) : (
                rows.map((r) => {
                  const mrid = r.mrid ?? r.report_month
                  const isOpen = expandedMrid === mrid
                  const heads = r.expense_by_head ?? []
                  return (
                    <Fragment key={mrid}>
                      <tr
                        className="monthly-row"
                        onClick={() => setExpandedMrid(isOpen ? null : mrid)}
                        title="Click to see expense breakdown by head"
                      >
                        <td>
                          <ChevronDown size={15} className={`monthly-caret ${isOpen ? 'monthly-caret--open' : ''}`} />
                        </td>
                        <td className="font-medium">{formatSalaryMonth(r.report_month)}</td>
                        <td style={{ textAlign: 'right' }}>{r.total_invoice_count ?? 0}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(r.total_invoice_amt, 2)}</td>
                        <td style={{ textAlign: 'right' }}>{r.total_expense_count ?? 0}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(r.total_expense_amt, 2)}</td>
                        <td style={{ textAlign: 'right' }} className={Number(r.net_amt) >= 0 ? 'monthly-net--pos' : 'monthly-net--neg'}>
                          {formatCurrency(r.net_amt, 2)}
                        </td>
                        <td>{fmtDateTime(r.generated_at)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="monthly-detail-row">
                          <td colSpan={8}>
                            {heads.length === 0 ? (
                              <div className="monthly-empty">No expenses in this month.</div>
                            ) : (
                              <table className="data-table monthly-head-table">
                                <thead>
                                  <tr>
                                    <th>Expense Head</th>
                                    <th style={{ textAlign: 'right' }}>Entries</th>
                                    <th style={{ textAlign: 'right' }}>Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {heads.map((h) => (
                                    <tr key={h.exhid ?? h.name}>
                                      <td>{h.name}</td>
                                      <td style={{ textAlign: 'right' }}>{h.count ?? 0}</td>
                                      <td style={{ textAlign: 'right' }}>{formatCurrency(h.total, 2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Comparison ── */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 className="card-title">Compare Two Months</h2>
        <div className="monthly-compare-toolbar">
          <label className="monthly-month-field">
            <span>Month 1</span>
            <input type="month" className="form-input" value={cmpMonth1} onChange={(e) => setCmpMonth1(e.target.value)} />
          </label>
          <label className="monthly-month-field">
            <span>Month 2</span>
            <input type="month" className="form-input" value={cmpMonth2} onChange={(e) => setCmpMonth2(e.target.value)} />
          </label>
          <button type="button" className="btn btn-secondary" onClick={handleCompare} disabled={compareLoading}>
            <GitCompareArrows size={18} />
            {compareLoading ? 'Comparing…' : 'Compare'}
          </button>
        </div>

        {appliedCompare && compareError && (
          <div className="monthly-empty">Could not load comparison.</div>
        )}

        {m1 && m2 && !compareLoading && (
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th style={{ textAlign: 'right' }}>{formatSalaryMonth(m1.report_month)}</th>
                  <th style={{ textAlign: 'right' }}>{formatSalaryMonth(m2.report_month)}</th>
                  <th style={{ textAlign: 'right' }}>Change</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">Total Invoices</td>
                  <td style={{ textAlign: 'right' }}>{m1.total_invoice_count ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>{m2.total_invoice_count ?? 0}</td>
                  <td style={{ textAlign: 'right' }}><ChangeBadge from={m1.total_invoice_count} to={m2.total_invoice_count} /></td>
                </tr>
                <tr>
                  <td className="font-medium">Invoice Amount</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(m1.total_invoice_amt, 2)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(m2.total_invoice_amt, 2)}</td>
                  <td style={{ textAlign: 'right' }}><ChangeBadge from={m1.total_invoice_amt} to={m2.total_invoice_amt} /></td>
                </tr>
                <tr>
                  <td className="font-medium">Expense Amount</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(m1.total_expense_amt, 2)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(m2.total_expense_amt, 2)}</td>
                  <td style={{ textAlign: 'right' }}><ChangeBadge from={m1.total_expense_amt} to={m2.total_expense_amt} invert /></td>
                </tr>
                <tr>
                  <td className="font-medium">Net (Inv − Exp)</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(m1.net_amt, 2)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(m2.net_amt, 2)}</td>
                  <td style={{ textAlign: 'right' }}><ChangeBadge from={m1.net_amt} to={m2.net_amt} /></td>
                </tr>
              </tbody>
            </table>

            {compareHeads.length > 0 && (
              <>
                <h3 className="monthly-subheading">Expense by Head</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Expense Head</th>
                      <th style={{ textAlign: 'right' }}>{formatSalaryMonth(m1.report_month)}</th>
                      <th style={{ textAlign: 'right' }}>{formatSalaryMonth(m2.report_month)}</th>
                      <th style={{ textAlign: 'right' }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareHeads.map((h) => (
                      <tr key={h.key}>
                        <td>{h.name}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(h.total1, 2)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(h.total2, 2)}</td>
                        <td style={{ textAlign: 'right' }}><ChangeBadge from={h.total1} to={h.total2} invert /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
