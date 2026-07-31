import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { useGetMonthlyReportsQuery } from '../store/api'
import { formatCurrency } from '../utils/format'
import { formatSalaryMonth, lastSalaryMonth } from '../utils/salaryDeductions'

const METRICS = [
  { id: 'invoice_amt', label: 'Invoice Amount', field: 'total_invoice_amt', kind: 'money' },
  { id: 'invoice_count', label: 'Total Invoices', field: 'total_invoice_count', kind: 'count' },
  { id: 'expense_amt', label: 'Expense Amount', field: 'total_expense_amt', kind: 'money' },
  { id: 'expense_count', label: 'Total Expenses (count)', field: 'total_expense_count', kind: 'count' },
  { id: 'net', label: 'Net (Invoice − Expense)', field: 'net_amt', kind: 'money' },
  { id: 'inv_vs_exp', label: 'Invoice vs Expense', field: null, kind: 'compare' },
  { id: 'expense_by_head', label: 'Expenses by Head', field: null, kind: 'heads' },
]

const HEAD_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
]

/** Label text for on-bar display */
function formatBarLabel(value, kind = 'money') {
  const n = Number(value) || 0
  if (kind === 'count') return String(n)
  return formatCurrency(n, 0)
}

function MoneyBarLabel(props) {
  const { x, y, width, value } = props
  if (value == null || Number(value) === 0) return null
  const cx = Number(x) + Number(width) / 2
  return (
    <text
      x={cx}
      y={Number(y) - 6}
      fill="#111827"
      fontSize={10}
      fontWeight={600}
      textAnchor="middle"
    >
      {formatBarLabel(value, 'money')}
    </text>
  )
}

function CountBarLabel(props) {
  const { x, y, width, value } = props
  if (value == null) return null
  const cx = Number(x) + Number(width) / 2
  return (
    <text
      x={cx}
      y={Number(y) - 6}
      fill="#111827"
      fontSize={11}
      fontWeight={600}
      textAnchor="middle"
    >
      {formatBarLabel(value, 'count')}
    </text>
  )
}

/** Default: last up to 6 saved months (same feel as previous From→To range). */
function defaultSelectedMonths(allMonths) {
  if (!allMonths.length) return []
  return allMonths.slice(-6)
}

export default function GraphReport() {
  const [selectedMonths, setSelectedMonths] = useState([])
  const [didInitMonths, setDidInitMonths] = useState(false)
  const [metricId, setMetricId] = useState('inv_vs_exp')
  const [headMonth, setHeadMonth] = useState(() => lastSalaryMonth())

  const { data, isLoading, isError } = useGetMonthlyReportsQuery({})
  const rows = data?.data ?? []

  const metric = METRICS.find((m) => m.id === metricId) || METRICS[0]

  const allMonths = useMemo(() => {
    return [...new Set(rows.map((r) => r.report_month).filter(Boolean))].sort()
  }, [rows])

  useEffect(() => {
    if (didInitMonths || allMonths.length === 0) return
    setSelectedMonths(defaultSelectedMonths(allMonths))
    setHeadMonth(allMonths[allMonths.length - 1])
    setDidInitMonths(true)
  }, [allMonths, didInitMonths])

  const toggleMonth = (month) => {
    setSelectedMonths((prev) => {
      if (prev.includes(month)) {
        // Keep at least 1 selected when possible
        if (prev.length <= 1) return prev
        return prev.filter((m) => m !== month)
      }
      return [...prev, month].sort()
    })
  }

  const selectOnlyTwo = (a, b) => {
    setSelectedMonths([a, b].filter(Boolean).sort())
  }

  const sortedSelected = useMemo(() => {
    const set = new Set(selectedMonths)
    return [...rows]
      .filter((r) => set.has(r.report_month))
      .sort((a, b) => String(a.report_month).localeCompare(String(b.report_month)))
  }, [rows, selectedMonths])

  const trendData = useMemo(() => {
    return sortedSelected.map((r) => ({
      month: formatSalaryMonth(r.report_month),
      report_month: r.report_month,
      invoice_amt: Number(r.total_invoice_amt) || 0,
      invoice_count: Number(r.total_invoice_count) || 0,
      expense_amt: Number(r.total_expense_amt) || 0,
      expense_count: Number(r.total_expense_count) || 0,
      net: Number(r.net_amt) || 0,
    }))
  }, [sortedSelected])

  const headReport = useMemo(() => {
    return rows.find((r) => r.report_month === headMonth) ?? null
  }, [rows, headMonth])

  const headChartData = useMemo(() => {
    const heads = headReport?.expense_by_head ?? []
    return heads
      .map((h) => ({
        name: h.name || 'Uncategorized',
        total: Number(h.total) || 0,
        count: Number(h.count) || 0,
      }))
      .filter((h) => h.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [headReport])

  const singleBarData = useMemo(() => {
    if (metric.kind !== 'money' && metric.kind !== 'count') return []
    const key =
      metric.id === 'invoice_amt'
        ? 'invoice_amt'
        : metric.id === 'invoice_count'
          ? 'invoice_count'
          : metric.id === 'expense_amt'
            ? 'expense_amt'
            : metric.id === 'expense_count'
              ? 'expense_count'
              : 'net'
    return trendData.map((d) => ({
      month: d.month,
      value: d[key],
    }))
  }, [trendData, metric])

  const chartTotals = useMemo(() => {
    if (metric.kind === 'heads') {
      const total = headChartData.reduce((s, h) => s + (Number(h.total) || 0), 0)
      return { kind: 'money', items: [{ label: 'Total Expenses', value: total }] }
    }
    if (metric.kind === 'compare') {
      const inv = trendData.reduce((s, d) => s + (Number(d.invoice_amt) || 0), 0)
      const exp = trendData.reduce((s, d) => s + (Number(d.expense_amt) || 0), 0)
      return {
        kind: 'money',
        items: [
          { label: 'Total Invoice', value: inv },
          { label: 'Total Expense', value: exp },
          { label: 'Net', value: inv - exp },
        ],
      }
    }
    const total = singleBarData.reduce((s, d) => s + (Number(d.value) || 0), 0)
    return {
      kind: metric.kind,
      items: [{ label: `Total ${metric.label}`, value: total }],
    }
  }, [metric, headChartData, trendData, singleBarData])

  const hasChartData =
    (metric.kind === 'compare' && trendData.length > 0) ||
    ((metric.kind === 'money' || metric.kind === 'count') && singleBarData.length > 0) ||
    (metric.kind === 'heads' && headChartData.length > 0)

  const emptyMsg =
    rows.length === 0
      ? 'No saved monthly reports yet. Go to Monthly Report and click “Calculate & Save” first.'
      : selectedMonths.length === 0
        ? 'Select at least one month.'
        : sortedSelected.length === 0
          ? 'No reports for the selected months.'
          : null

  const lastTwo = allMonths.slice(-2)

  return (
    <div className="graph-report">
      <div className="card graph-toolbar">
        <div className="graph-months-block">
          <div className="graph-months-header">
            <span>Months</span>
            <div className="graph-months-actions">
              {lastTwo.length === 2 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => selectOnlyTwo(lastTwo[0], lastTwo[1])}
                  title="Compare last 2 months"
                >
                  Last 2 months
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedMonths(defaultSelectedMonths(allMonths))}
                disabled={allMonths.length === 0}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedMonths([...allMonths])}
                disabled={allMonths.length === 0}
              >
                All
              </button>
            </div>
          </div>
          {allMonths.length === 0 ? (
            <div className="graph-months-empty">No months saved yet</div>
          ) : (
            <div className="graph-months-chips">
              {allMonths.map((m) => {
                const on = selectedMonths.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    className={`graph-month-chip ${on ? 'graph-month-chip--on' : ''}`}
                    onClick={() => toggleMonth(m)}
                    aria-pressed={on}
                  >
                    {formatSalaryMonth(m)}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {metric.kind === 'heads' && (
          <label className="graph-field">
            <span>Month (for heads)</span>
            <select
              className="form-input"
              value={headMonth}
              onChange={(e) => setHeadMonth(e.target.value)}
            >
              {allMonths.length === 0 && (
                <option value={headMonth}>{formatSalaryMonth(headMonth)}</option>
              )}
              {allMonths.map((m) => (
                <option key={m} value={m}>{formatSalaryMonth(m)}</option>
              ))}
            </select>
          </label>
        )}

        <label className="graph-field graph-field--wide">
          <span>Show</span>
          <select
            className="form-input"
            value={metricId}
            onChange={(e) => setMetricId(e.target.value)}
          >
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 className="card-title">
          Graph Report
          <span className="report-date-range-label">{metric.label}</span>
        </h2>

        {!isLoading && !isError && hasChartData && (
          <div className="graph-total-bar">
            {chartTotals.items.map((item) => (
              <div key={item.label} className="graph-total-item">
                <span className="graph-total-label">{item.label}</span>
                <strong className="graph-total-value">
                  {chartTotals.kind === 'money'
                    ? formatCurrency(item.value, 2)
                    : String(Number(item.value) || 0)}
                </strong>
              </div>
            ))}
          </div>
        )}

        {isLoading && <div className="monthly-empty">Loading…</div>}
        {isError && <div className="monthly-empty">Could not load monthly reports.</div>}
        {!isLoading && !isError && emptyMsg && metric.kind !== 'heads' && (
          <div className="monthly-empty">{emptyMsg}</div>
        )}
        {!isLoading && !isError && metric.kind === 'heads' && headChartData.length === 0 && (
          <div className="monthly-empty">
            {headReport
              ? `No expense heads for ${formatSalaryMonth(headMonth)}.`
              : `No saved report for ${formatSalaryMonth(headMonth)}. Calculate & Save it in Monthly Report first.`}
          </div>
        )}

        {!isLoading && !isError && metric.kind === 'compare' && trendData.length > 0 && (
          <div className="graph-chart-wrap">
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={trendData} margin={{ top: 28, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v, 0)} width={80} />
                <Legend />
                <Bar dataKey="invoice_amt" name="Invoice Amount" fill="#2563eb" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="invoice_amt" content={MoneyBarLabel} />
                </Bar>
                <Bar dataKey="expense_amt" name="Expense Amount" fill="#dc2626" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="expense_amt" content={MoneyBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {!isLoading && !isError && (metric.kind === 'money' || metric.kind === 'count') && singleBarData.length > 0 && (
          <div className="graph-chart-wrap">
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={singleBarData} margin={{ top: 28, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => (metric.kind === 'money' ? formatCurrency(v, 0) : String(v))}
                  width={80}
                />
                <Bar dataKey="value" name={metric.label} fill="#2563eb" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="value"
                    content={metric.kind === 'money' ? MoneyBarLabel : CountBarLabel}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {!isLoading && !isError && metric.kind === 'heads' && headChartData.length > 0 && (
          <div className="graph-heads-layout">
            <div className="graph-chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={headChartData}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={({ name, percent }) => `${name} (${Math.round(percent * 100)}%)`}
                  >
                    {headChartData.map((_, i) => (
                      <Cell key={i} fill={HEAD_COLORS[i % HEAD_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="graph-chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={headChartData} layout="vertical" margin={{ top: 8, right: 56, left: 24, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v, 0)} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Bar dataKey="total" name="Amount" radius={[0, 4, 4, 0]}>
                    {headChartData.map((_, i) => (
                      <Cell key={i} fill={HEAD_COLORS[i % HEAD_COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="total"
                      position="right"
                      formatter={(v) => formatBarLabel(v, 'money')}
                      style={{ fontSize: 11, fontWeight: 600, fill: '#111827' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
