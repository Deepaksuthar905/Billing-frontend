import { useState } from 'react'
import { BarChart3, TrendingUp, FileText, Calendar, Download } from 'lucide-react'
import './Reports.css'

const reportCategories = [
  { id: 'sales', title: 'Sales Report', desc: 'Day-wise, item-wise sales summary', icon: TrendingUp },
  { id: 'purchase', title: 'Purchase Report', desc: 'Purchase orders and vendor summary', icon: BarChart3 },
  { id: 'gst', title: 'GST Reports', desc: 'GSTR-1, GSTR-3B, tax summary', icon: FileText },
  { id: 'profit', title: 'Profit & Loss', desc: 'Revenue, expenses and profit', icon: BarChart3 },
  { id: 'inventory', title: 'Stock Summary', desc: 'Current stock and valuation', icon: BarChart3 },
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

      <div className="reports-grid">
        {reportCategories.map((cat) => {
          const Icon = cat.icon
          return (
          <div key={cat.id} className="card report-card">
            <div className="report-card-icon">
              <Icon size={24} />
            </div>
            <h3 className="card-title">{cat.title}</h3>
            <p className="report-desc">{cat.desc}</p>
            <button type="button" className="btn btn-secondary btn-sm">
              View Report
            </button>
          </div>
          )
        })}
      </div>

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
    </div>
  )
}
