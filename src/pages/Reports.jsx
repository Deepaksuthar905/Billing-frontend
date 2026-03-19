import { useState } from 'react'
import { BarChart3, TrendingUp, FileText, Calendar, Download, Share2, Printer } from 'lucide-react'
import { useGetGstRateReportQuery, useGetInvoicesQuery } from '../store/api'
import './Reports.css'

const formatReportAmount = (num) =>
  num != null ? `₹ ${Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

function buildGstRateRows(data) {
  if (!data || typeof data !== 'object') {
    return [
      { taxName: 'IGST@18%', taxPercent: '18%', taxableSale: null, taxIn: null, taxableExpense: null, taxOut: null },
      { taxName: 'SGST@9%', taxPercent: '9%', taxableSale: null, taxIn: null, taxableExpense: null, taxOut: null },
      { taxName: 'CGST@9%', taxPercent: '9%', taxableSale: null, taxIn: null, taxableExpense: null, taxOut: null },
    ]
  }
  const n = (v) => (v != null && v !== '' ? Number(v) : null)
  return [
    {
      taxName: 'IGST@18%',
      taxPercent: '18%',
      taxableSale: n(data.igstsales) != null ? n(data.igstsales) / 0.18 : null,
      taxIn: data.igstsales,
      taxableExpense: n(data.igstexp) != null ? n(data.igstexp) / 0.18 : null,
      taxOut: data.igstexp,
    },
    {
      taxName: 'SGST@9%',
      taxPercent: '9%',
      taxableSale: n(data.sgstsales) != null ? n(data.sgstsales) / 0.09 : null,
      taxIn: data.sgstsales,
      taxableExpense: n(data.sgstexp) != null ? n(data.sgstexp) / 0.09 : null,
      taxOut: data.sgstexp,
    },
    {
      taxName: 'CGST@9%',
      taxPercent: '9%',
      taxableSale: n(data.cgstsales) != null ? n(data.cgstsales) / 0.09 : null,
      taxIn: data.cgstsales,
      taxableExpense: n(data.cgstexp) != null ? n(data.cgstexp) / 0.09 : null,
      taxOut: data.cgstexp,
    },
  ]
}

const reportCategories = [
  { id: 'sales', title: 'Sales Report', desc: 'Day-wise, item-wise sales summary', icon: TrendingUp },
  { id: 'purchase', title: 'Purchase Report', desc: 'Purchase orders and vendor summary', icon: BarChart3 },
  { id: 'gst', title: 'GST Reports', desc: 'GSTR-1, GSTR-3B, tax summary', icon: FileText },
  { id: 'profit', title: 'Profit & Loss', desc: 'Revenue, expenses and profit', icon: BarChart3 },
  { id: 'inventory', title: 'Stock Summary', desc: 'Current stock and valuation', icon: BarChart3 },
]

const gstSubOptions = [
  { id: 'gstr1', title: 'GSTR-1' },
  { id: 'gst-rate', title: 'GST Rate Report' },
]

const mockSalesReport = [
  { date: '10 Mar', sales: 42000 },
  { date: '11 Mar', sales: 38000 },
  { date: '12 Mar', sales: 51000 },
  { date: '13 Mar', sales: 45000 },
  { date: '14 Mar', sales: 62000 },
  { date: '15 Mar', sales: 48500 },
  { date: '16 Mar', sales: 41200 },
]

export default function Reports() {
  const [dateRange, setDateRange] = useState('7d')
  const [activeReportId, setActiveReportId] = useState('sales')
  const [activeGstSub, setActiveGstSub] = useState('gstr1')
  const [gstRateFrom, setGstRateFrom] = useState('2026-03-01')
  const [gstRateTo, setGstRateTo] = useState('2026-03-18')
  const [gstr1From, setGstr1From] = useState('2026-03-01')
  const [gstr1To, setGstr1To] = useState('2026-03-18')

  const { data: invoicesData, isLoading: gstr1Loading } = useGetInvoicesQuery(
    { from: gstr1From, to: gstr1To },
    { skip: !(activeReportId === 'gst' && activeGstSub === 'gstr1') }
  )

  const invoices = invoicesData?.data ?? []
  const fromDt = gstr1From ? new Date(gstr1From) : null
  const toDt = gstr1To ? new Date(gstr1To) : null
  const filteredInvoices = fromDt && toDt
    ? invoices.filter((inv) => {
        const d = new Date(inv.dt ?? inv.date ?? 0)
        return d >= fromDt && d <= toDt
      })
    : invoices
  const gstr1Rows = filteredInvoices.map((inv) => {
    const cgst = Number(inv.cgst) || 0
    const sgst = Number(inv.sgst) || 0
    const igst = Number(inv.igst) || 0
    const totalTax = cgst + sgst + igst
    const payment = Number(inv.payment) || 0
    const taxableValue = payment - totalTax
    return {
      invNo: inv.inv_no ?? inv.id,
      date: inv.dt ?? inv.date,
      customer: inv.customer ?? inv.customer_name ?? inv.partyname ?? '—',
      taxableValue: taxableValue > 0 ? taxableValue : payment,
      cgst,
      sgst,
      igst,
      total: payment,
    }
  })
  const gstr1HsnSummary = gstr1Rows.length
    ? {
        totalTaxable: gstr1Rows.reduce((s, r) => s + (r.taxableValue || 0), 0),
        totalCgst: gstr1Rows.reduce((s, r) => s + r.cgst, 0),
        totalSgst: gstr1Rows.reduce((s, r) => s + r.sgst, 0),
        totalIgst: gstr1Rows.reduce((s, r) => s + r.igst, 0),
        total: gstr1Rows.reduce((s, r) => s + r.total, 0),
      }
    : null

  const { data: gstRateData, isLoading: gstRateLoading } = useGetGstRateReportQuery(
    { from: gstRateFrom, to: gstRateTo },
    { skip: !(activeReportId === 'gst' && activeGstSub === 'gst-rate') }
  )

  const gstRateRows = buildGstRateRows(gstRateData?.data)

  const activeReport = reportCategories.find((c) => c.id === activeReportId) || reportCategories[0]

  const handleReportTabClick = (id) => {
    setActiveReportId(id)
    if (id === 'gst') setActiveGstSub('gstr1')
  }

  return (
    <div className="reports-page">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <div className="report-actions">
          <div className="date-range-select">
            <Calendar size={18} />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="select-input"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
          <button type="button" className="btn btn-secondary">
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      <div className="reports-layout">
        <aside className="reports-sidebar">
          {reportCategories.map((cat) => {
            const Icon = cat.icon
            const isActive = activeReportId === cat.id
            const isGst = cat.id === 'gst'
            return (
              <div key={cat.id} className="reports-tab-group">
                <button
                  type="button"
                  className={`reports-tab ${isActive && !isGst ? 'reports-tab--active' : isGst ? 'reports-tab--parent' : ''} ${isGst && activeReportId === 'gst' ? 'reports-tab--active' : ''}`}
                  onClick={() => handleReportTabClick(cat.id)}
                >
                  <Icon size={20} />
                  <span>{cat.title}</span>
                </button>
                {isGst && activeReportId === 'gst' && (
                  <div className="reports-sub">
                    {gstSubOptions.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        className={`reports-tab reports-tab--sub ${activeGstSub === sub.id ? 'reports-tab--active' : ''}`}
                        onClick={() => setActiveGstSub(sub.id)}
                      >
                        <span>{sub.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </aside>

        <div className="reports-content">
          {activeReportId === 'sales' && (
            <div className="card">
              <h2 className="card-title">Sales Overview (Last 7 days)</h2>
              <div className="chart-placeholder">
                <div className="bar-chart">
                  {mockSalesReport.map((d) => (
                    <div key={d.date} className="bar-group">
                      <div
                        className="bar"
                        style={{ height: `${(d.sales / 70000) * 100}%` }}
                        title={`₹${d.sales.toLocaleString('en-IN')}`}
                      />
                      <span className="bar-label">{d.date}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="chart-legend">
                <span>₹ Thousand</span>
              </div>
            </div>
          )}

          {activeReportId === 'purchase' && (
            <div className="card">
              <h2 className="card-title">Purchase Report</h2>
              <p className="report-placeholder">{activeReport.desc}</p>
              <p className="report-placeholder text-muted">Purchase orders and vendor summary will appear here.</p>
            </div>
          )}

          {activeReportId === 'gst' && activeGstSub === 'gstr1' && (
            <div className="gstr1-report">
              <div className="gst-rate-toolbar">
                <div className="gst-rate-dates">
                  <label>
                    <span>From</span>
                    <input type="date" value={gstr1From} onChange={(e) => setGstr1From(e.target.value)} className="form-input" />
                  </label>
                  <label>
                    <span>To</span>
                    <input type="date" value={gstr1To} onChange={(e) => setGstr1To(e.target.value)} className="form-input" />
                  </label>
                </div>
              </div>
              <h2 className="gst-rate-title">GSTR-1 – Outward Supplies</h2>
              {gstr1Loading && <p className="report-placeholder text-muted">Loading...</p>}
              <div className="gst-rate-table-wrap">
                <table className="gst-rate-table">
                  <thead>
                    <tr>
                      <th>Invoice No</th>
                      <th>Date</th>
                      <th>Customer / Party</th>
                      <th className="text-right">Taxable Value</th>
                      <th className="text-right">CGST</th>
                      <th className="text-right">SGST</th>
                      <th className="text-right">IGST</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstr1Rows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.invNo}</td>
                        <td>{row.date}</td>
                        <td>{row.customer}</td>
                        <td className="text-right">{formatReportAmount(row.taxableValue)}</td>
                        <td className="text-right">{formatReportAmount(row.cgst)}</td>
                        <td className="text-right">{formatReportAmount(row.sgst)}</td>
                        <td className="text-right">{formatReportAmount(row.igst)}</td>
                        <td className="text-right">{formatReportAmount(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {gstr1HsnSummary && (
                <div className="gstr1-hsn-summary card">
                  <h3 className="card-title">HSN Summary</h3>
                  <table className="gst-rate-table">
                    <thead>
                      <tr>
                        <th>HSN</th>
                        <th className="text-right">Taxable Value</th>
                        <th className="text-right">CGST</th>
                        <th className="text-right">SGST</th>
                        <th className="text-right">IGST</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>—</td>
                        <td className="text-right">{formatReportAmount(gstr1HsnSummary.totalTaxable)}</td>
                        <td className="text-right">{formatReportAmount(gstr1HsnSummary.totalCgst)}</td>
                        <td className="text-right">{formatReportAmount(gstr1HsnSummary.totalSgst)}</td>
                        <td className="text-right">{formatReportAmount(gstr1HsnSummary.totalIgst)}</td>
                        <td className="text-right">{formatReportAmount(gstr1HsnSummary.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeReportId === 'gst' && activeGstSub === 'gst-rate' && (
            <div className="gst-rate-report">
              <div className="gst-rate-toolbar">
                <div className="gst-rate-dates">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={gstRateFrom}
                      onChange={(e) => setGstRateFrom(e.target.value)}
                      className="form-input"
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={gstRateTo}
                      onChange={(e) => setGstRateTo(e.target.value)}
                      className="form-input"
                    />
                  </label>
                </div>
                <div className="gst-rate-actions">
                  <button type="button" className="btn btn-primary gst-share-btn">
                    <Share2 size={18} />
                    Share With Accountant
                    <span className="share-dot" aria-hidden />
                  </button>
                  <button type="button" className="gst-icon-btn" title="Export">
                    <Download size={20} />
                  </button>
                  <button type="button" className="gst-icon-btn" title="Print">
                    <Printer size={20} />
                  </button>
                </div>
              </div>
              <h2 className="gst-rate-title">GST TAX RATE REPORT</h2>
              {gstRateLoading && (
                <p className="report-placeholder text-muted">Loading...</p>
              )}
              <div className="gst-rate-table-wrap">
                <table className="gst-rate-table">
                  <thead>
                    <tr>
                      <th>Tax Name</th>
                      <th className="text-right">Tax Percent</th>
                      <th className="text-right">Taxable Sale Amount</th>
                      <th className="text-right">Tax In</th>
                      <th className="text-right">Taxable Purchase/Expense Amount</th>
                      <th className="text-right">Tax Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstRateRows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.taxName}</td>
                        <td className="text-right">{row.taxPercent}</td>
                        <td className="text-right">{formatReportAmount(row.taxableSale)}</td>
                        <td className="text-right">{formatReportAmount(row.taxIn)}</td>
                        <td className="text-right">{formatReportAmount(row.taxableExpense)}</td>
                        <td className="text-right">{formatReportAmount(row.taxOut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeReportId === 'profit' && (
            <div className="card">
              <h2 className="card-title">Profit & Loss</h2>
              <p className="report-placeholder">{activeReport.desc}</p>
              <p className="report-placeholder text-muted">Revenue, expenses and profit will appear here.</p>
            </div>
          )}

          {activeReportId === 'inventory' && (
            <div className="card">
              <h2 className="card-title">Stock Summary</h2>
              <p className="report-placeholder">{activeReport.desc}</p>
              <p className="report-placeholder text-muted">Current stock and valuation will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
