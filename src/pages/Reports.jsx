import { useState, useEffect } from 'react'
import { BarChart3, FileText, Calendar, Download, Share2, Printer } from 'lucide-react'
import {
  useGetGstRateReportQuery,
  useGetInvoicesQuery,
  useGetPurchaseOrdersQuery,
  useGetLedgerQuery,
  useGetExpenseReportQuery,
  useGetPayByListQuery,
} from '../store/api'
import { exportCurrentReport } from '../utils/reportExcelExport'
import './Reports.css'

const formatReportAmount = (num) =>
  `₹ ${Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const getDisplayValue = (value) => {
  if (value == null) return '0'
  if (typeof value === 'string' && value.trim() === '') return '0'
  return value
}

/** YYYY-MM-DD from API date (avoids timezone shifting whole-day compares). */
function parseIsoDatePart(value) {
  if (value == null || value === '') return null
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function toYmdLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Inclusive window ending today: e.g. 7 → today and previous 6 days. */
function rollingDaysFromTo(numDays) {
  const today = new Date()
  const end = toYmdLocal(today)
  const start = new Date(today)
  start.setDate(start.getDate() - (numDays - 1))
  return { from: toYmdLocal(start), to: end }
}

function dateRangePresetToFromTo(preset) {
  const today = new Date()
  const endToday = toYmdLocal(today)
  if (preset === 'current-month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: toYmdLocal(start), to: endToday }
  }
  if (preset === 'last-month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: toYmdLocal(start), to: toYmdLocal(end) }
  }
  if (preset === '7d') return rollingDaysFromTo(7)
  if (preset === '30d') return rollingDaysFromTo(30)
  if (preset === '90d') return rollingDaysFromTo(90)
  return null
}

function defaultRange7d() {
  return rollingDaysFromTo(7)
}

function defaultRangeCurrentMonth() {
  return dateRangePresetToFromTo('current-month') ?? defaultRange7d()
}

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
  { id: 'purchase', title: 'Expenses Report', desc: 'Purchase orders and vendor summary', icon: BarChart3 },
  { id: 'gst', title: 'GST Reports', desc: 'GSTR-1, 3B, purchase register, rate-wise tax', icon: FileText },
  { id: 'profit', title: 'Profit & Loss', desc: 'Revenue, expenses and profit', icon: BarChart3 },
  { id: 'inventory', title: 'Stock Summary', desc: 'Current stock and valuation', icon: BarChart3 },
  { id: 'ledger', title: 'Ledger', desc: 'Date-wise debit, credit and balance entries', icon: FileText },
]

const gstSubOptions = [
  { id: 'gstr1', title: 'GSTR-1' },
  { id: 'gstr3b', title: 'GSTR-3B' },
  { id: 'purchase-reg', title: 'Purchase register' },
  { id: 'gst-rate', title: 'GST Rate Report' },
]

/** GST % from purchase API — Tax rate column shows this only (no derived % when present). */
function pickPurchaseGstPercent(po) {
  const keys = ['gst', 'gst_rate', 'gst_percent', 'gstper', 'gstpct', 'tax_rate', 'taxRate']
  for (const k of keys) {
    const v = po[k]
    if (v != null && v !== '') {
      const n = Number(v)
      if (!Number.isNaN(n)) return n
    }
  }
  return null
}

/** Purchase bills → same column logic as sales (Value, taxes, POS) */
function buildPurchaseRegisterRows(purchases) {
  return purchases.map((po) => {
    const cgst = Number(po.cgst) || 0
    const sgst = Number(po.sgst) || 0
    const igst = Number(po.igst) || 0
    const totalTax = cgst + sgst + igst
    const billValue = Number(po.amount) || Number(po.total) || Number(po.payment) || 0
    const taxableFromApi = Number(po.taxable_amt)
    const taxableComputed = billValue - totalTax
    const safeTaxable =
      !Number.isNaN(taxableFromApi) && taxableFromApi > 0
        ? taxableFromApi
        : taxableComputed > 0
          ? taxableComputed
          : billValue
    const gstFromApi = pickPurchaseGstPercent(po)
    /** Pehle response ka `gst` (ya alias); na ho to taxable se derive */
    const taxRate =
      gstFromApi != null
        ? gstFromApi
        : safeTaxable > 0
          ? (totalTax / safeTaxable) * 100
          : 0
    return {
      gstin: po.vendor_gstin ?? po.gstin ?? po.gst_no ?? po.gstin_no,
      partyName: po.vendor ?? po.vendor_name ?? po.partyname ?? po.billing_name,
      invNo: po.inv_no ?? po.po_no ?? po.bill_no ?? po.id,
      date: po.dt ?? po.date,
      value: billValue,
      taxRate,
      taxableValue: safeTaxable,
      integratedTaxDisplay: sgst,
      centralTaxDisplay: igst,
      stateTaxDisplay: cgst,
      placeOfSupply: po.state ?? po.place_of_supply ?? po.state_name ?? po.pos,
    }
  })
}

/** Invoice line → outward supply totals (same basis as GSTR-1 table) */
function summarizeOutwardSupplies(invoices) {
  let taxable = 0
  let igst = 0
  let cgst = 0
  let sgst = 0
  let invoiceValue = 0
  for (const inv of invoices) {
    const c = Number(inv.cgst) || 0
    const s = Number(inv.sgst) || 0
    const i = Number(inv.igst) || 0
    const totalTax = c + s + i
    const val = Number(inv.amount) || Number(inv.payment) || 0
    const tv = val - totalTax
    const safeTaxable = tv > 0 ? tv : val
    taxable += safeTaxable
    igst += i
    cgst += c
    sgst += s
    invoiceValue += val
  }
  return { taxable, igst, cgst, sgst, invoiceValue, totalTax: igst + cgst + sgst }
}

/** Purchase bills → ITC-style totals (when API sends cgst/sgst/igst) */
function summarizePurchaseItc(purchases) {
  let taxable = 0
  let igst = 0
  let cgst = 0
  let sgst = 0
  let gross = 0
  for (const po of purchases) {
    const c = Number(po.cgst) || 0
    const s = Number(po.sgst) || 0
    const i = Number(po.igst) || 0
    const totalTax = c + s + i
    const val = Number(po.amount) || Number(po.total) || Number(po.payment) || 0
    const tv = val - totalTax
    const safeTaxable = tv > 0 ? tv : val
    taxable += safeTaxable
    igst += i
    cgst += c
    sgst += s
    gross += val
  }
  return { taxable, igst, cgst, sgst, gross, totalTax: igst + cgst + sgst }
}
export default function Reports() {
  const [dateRange, setDateRange] = useState('current-month')
  const [activeReportId, setActiveReportId] = useState('purchase')
  const [activeGstSub, setActiveGstSub] = useState('gstr1')
  const [gstRateFrom, setGstRateFrom] = useState(() => defaultRangeCurrentMonth().from)
  const [gstRateTo, setGstRateTo] = useState(() => defaultRangeCurrentMonth().to)
  const [gstr1From, setGstr1From] = useState(() => defaultRangeCurrentMonth().from)
  const [gstr1To, setGstr1To] = useState(() => defaultRangeCurrentMonth().to)
  const [gstr3bFrom, setGstr3bFrom] = useState(() => defaultRangeCurrentMonth().from)
  const [gstr3bTo, setGstr3bTo] = useState(() => defaultRangeCurrentMonth().to)
  const [purchaseRegFrom, setPurchaseRegFrom] = useState(() => defaultRangeCurrentMonth().from)
  const [purchaseRegTo, setPurchaseRegTo] = useState(() => defaultRangeCurrentMonth().to)
  const [ledgerFrom, setLedgerFrom] = useState(() => defaultRangeCurrentMonth().from)
  const [ledgerTo, setLedgerTo] = useState(() => defaultRangeCurrentMonth().to)
  /** Applied to API only after Apply — draft dates stay in ledgerFrom / ledgerTo */
  const [ledgerAppliedFrom, setLedgerAppliedFrom] = useState(() => defaultRangeCurrentMonth().from)
  const [ledgerAppliedTo, setLedgerAppliedTo] = useState(() => defaultRangeCurrentMonth().to)
  const [expRptFrom, setExpRptFrom] = useState(() => defaultRangeCurrentMonth().from)
  const [expRptTo, setExpRptTo] = useState(() => defaultRangeCurrentMonth().to)
  const [ledgerPayById, setLedgerPayById] = useState('')
  /** Set on Apply only — changing dropdown does not refetch */
  const [ledgerAppliedPbid, setLedgerAppliedPbid] = useState(undefined)

  const handleHeaderDateRangeChange = (preset) => {
    setDateRange(preset)
  }

  useEffect(() => {
    if (dateRange === 'custom') return
    const r = dateRangePresetToFromTo(dateRange)
    if (!r) return
    if (activeReportId === 'purchase') {
      setExpRptFrom(r.from)
      setExpRptTo(r.to)
    } else if (activeReportId === 'ledger') {
      setLedgerFrom(r.from)
      setLedgerTo(r.to)
    } else if (activeReportId === 'gst') {
      if (activeGstSub === 'gstr1') {
        setGstr1From(r.from)
        setGstr1To(r.to)
      } else if (activeGstSub === 'gstr3b') {
        setGstr3bFrom(r.from)
        setGstr3bTo(r.to)
      } else if (activeGstSub === 'purchase-reg') {
        setPurchaseRegFrom(r.from)
        setPurchaseRegTo(r.to)
      } else if (activeGstSub === 'gst-rate') {
        setGstRateFrom(r.from)
        setGstRateTo(r.to)
      }
    }
  }, [activeReportId, activeGstSub, dateRange])

  const { data: ledgerPayByData, isLoading: ledgerPayByLoading, isError: ledgerPayByError } = useGetPayByListQuery(
    undefined,
    { skip: activeReportId !== 'ledger' }
  )
  const ledgerPayByList = ledgerPayByData?.data ?? []

  useEffect(() => {
    if (activeReportId !== 'ledger') return
    const list = ledgerPayByData?.data
    if (!list?.length) return
    setLedgerPayById((prev) => (prev === '' ? String(list[0].pbid) : prev))
  }, [activeReportId, ledgerPayByData?.data])

  const selectedLedgerPayBy = ledgerPayByList.find((p) => String(p.pbid) === String(ledgerPayById))
  const selectedLedgerPayByApplied =
    ledgerAppliedPbid != null && ledgerAppliedPbid !== ''
      ? ledgerPayByList.find((p) => String(p.pbid) === String(ledgerAppliedPbid))
      : undefined
  const ledgerPbidForApi =
    ledgerAppliedPbid != null && ledgerAppliedPbid !== '' ? ledgerAppliedPbid : undefined

  const { data: invoicesData, isLoading: gstr1Loading } = useGetInvoicesQuery(
    { from: gstr1From, to: gstr1To },
    { skip: !(activeReportId === 'gst' && activeGstSub === 'gstr1') }
  )

  const { data: gstr3bInvoicesData, isLoading: gstr3bInvoicesLoading } = useGetInvoicesQuery(
    { from: gstr3bFrom, to: gstr3bTo },
    { skip: !(activeReportId === 'gst' && activeGstSub === 'gstr3b') }
  )

  const { data: gstr3bPurchasesData, isLoading: gstr3bPurchasesLoading } = useGetPurchaseOrdersQuery(
    { from: gstr3bFrom, to: gstr3bTo },
    { skip: !(activeReportId === 'gst' && activeGstSub === 'gstr3b') }
  )

  const { data: purchaseRegData, isLoading: purchaseRegLoading } = useGetPurchaseOrdersQuery(
    { from: purchaseRegFrom, to: purchaseRegTo },
    { skip: !(activeReportId === 'gst' && activeGstSub === 'purchase-reg') }
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
    /** API `amount` = invoice value column; fallback `payment` for older payloads */
    const invoiceValue = Number(inv.amount) || Number(inv.payment) || 0
    const taxableValue = invoiceValue - totalTax
    const safeTaxableValue = taxableValue > 0 ? taxableValue : invoiceValue
    const gstPercent = inv.gst != null && inv.gst !== '' ? Number(inv.gst) : null
    const taxRate =
      gstPercent != null && !Number.isNaN(gstPercent)
        ? gstPercent
        : safeTaxableValue > 0
          ? (totalTax / safeTaxableValue) * 100
          : 0
    return {
      gstin: inv.gstin ?? inv.gst_no ?? inv.gstin_no,
      partyName: inv.customer ?? inv.customer_name ?? inv.partyname ?? inv.billing_name,
      invNo: inv.inv_no ?? inv.id,
      date: inv.dt ?? inv.date,
      value: invoiceValue,
      taxRate,
      taxableValue: safeTaxableValue,
      cgst,
      sgst,
      igst,
      /** Table columns: Integrated → SGST, Central → IGST, State → CGST (per report layout) */
      integratedTaxDisplay: igst,
      centralTaxDisplay: cgst,
      stateTaxDisplay: sgst,
      placeOfSupply: inv.state ?? inv.place_of_supply ?? inv.state_name ?? inv.pos,
    }
  })
  const gstr1HsnSummary = gstr1Rows.length
    ? {
        totalTaxable: gstr1Rows.reduce((s, r) => s + (r.taxableValue || 0), 0),
        totalCgst: gstr1Rows.reduce((s, r) => s + r.cgst, 0),
        totalSgst: gstr1Rows.reduce((s, r) => s + r.sgst, 0),
        totalIgst: gstr1Rows.reduce((s, r) => s + r.igst, 0),
        total: gstr1Rows.reduce((s, r) => s + (r.value || 0), 0),
      }
    : null

  const gstr3bFromDt = gstr3bFrom ? new Date(gstr3bFrom) : null
  const gstr3bToDt = gstr3bTo ? new Date(gstr3bTo) : null
  const gstr3bInvoicesRaw = gstr3bInvoicesData?.data ?? []
  const gstr3bPurchasesRaw = gstr3bPurchasesData?.data ?? []
  const gstr3bInvoicesFiltered =
    gstr3bFromDt && gstr3bToDt
      ? gstr3bInvoicesRaw.filter((inv) => {
          const d = new Date(inv.dt ?? inv.date ?? 0)
          return d >= gstr3bFromDt && d <= gstr3bToDt
        })
      : gstr3bInvoicesRaw
  const gstr3bPurchasesFiltered =
    gstr3bFromDt && gstr3bToDt
      ? gstr3bPurchasesRaw.filter((po) => {
          const d = new Date(po.dt ?? po.date ?? 0)
          return d >= gstr3bFromDt && d <= gstr3bToDt
        })
      : gstr3bPurchasesRaw

  const outward3b = summarizeOutwardSupplies(gstr3bInvoicesFiltered)
  const itc3b = summarizePurchaseItc(gstr3bPurchasesFiltered)
  const net3b = {
    igst: outward3b.igst - itc3b.igst,
    cgst: outward3b.cgst - itc3b.cgst,
    sgst: outward3b.sgst - itc3b.sgst,
  }
  const gstr3bLoading = gstr3bInvoicesLoading || gstr3bPurchasesLoading

  const purchaseRegRaw = purchaseRegData?.data ?? []
  const purchaseRegFiltered =
    purchaseRegFrom && purchaseRegTo
      ? purchaseRegRaw.filter((po) => {
          const d = parseIsoDatePart(po.dt ?? po.date)
          return d != null && d >= purchaseRegFrom && d <= purchaseRegTo
        })
      : purchaseRegRaw
  const purchaseRegRows = buildPurchaseRegisterRows(purchaseRegFiltered)
  const purchaseRegTotals = purchaseRegRows.length
    ? {
        taxable: purchaseRegRows.reduce((s, r) => s + (r.taxableValue || 0), 0),
        igst: purchaseRegRows.reduce((s, r) => s + (r.centralTaxDisplay || 0), 0),
        cgst: purchaseRegRows.reduce((s, r) => s + (r.stateTaxDisplay || 0), 0),
        sgst: purchaseRegRows.reduce((s, r) => s + (r.integratedTaxDisplay || 0), 0),
        value: purchaseRegRows.reduce((s, r) => s + (r.value || 0), 0),
      }
    : null

  const { data: gstRateData, isLoading: gstRateLoading } = useGetGstRateReportQuery(
    { from: gstRateFrom, to: gstRateTo },
    { skip: !(activeReportId === 'gst' && activeGstSub === 'gst-rate') }
  )

  const { data: ledgerData, isLoading: ledgerLoading } = useGetLedgerQuery(
    { from: ledgerAppliedFrom, to: ledgerAppliedTo, pbid: ledgerPbidForApi },
    { skip: activeReportId !== 'ledger', refetchOnMountOrArgChange: true }
  )
  const ledgerRows = ledgerData?.entries ?? []
  const ledgerSummary = ledgerData?.summary ?? null

  const { data: expRptData, isLoading: expRptLoading } = useGetExpenseReportQuery(
    { from: expRptFrom, to: expRptTo },
    { skip: activeReportId !== 'purchase', refetchOnMountOrArgChange: true }
  )
  const expRptRows = expRptData?.data ?? []
  const expRptSummary = expRptData?.summary ?? null

  const gstRateRows = buildGstRateRows(gstRateData?.data)

  const activeReport = reportCategories.find((c) => c.id === activeReportId) || reportCategories[0]

  const handleReportTabClick = (id) => {
    setActiveReportId(id)
    if (id === 'gst') setActiveGstSub('gstr1')
  }

  const handleLedgerApply = () => {
    setLedgerAppliedFrom(ledgerFrom)
    setLedgerAppliedTo(ledgerTo)
    setLedgerAppliedPbid(ledgerPayById !== '' ? ledgerPayById : undefined)
  }

  const ledgerFiltersPending =
    activeReportId === 'ledger' &&
    (ledgerFrom !== ledgerAppliedFrom ||
      ledgerTo !== ledgerAppliedTo ||
      String(ledgerPayById || '') !== String(ledgerAppliedPbid ?? ''))

  const handleExportExcel = () => {
    exportCurrentReport({
      activeReportId,
      activeGstSub,
      gstr1From,
      gstr1To,
      gstr1Rows,
      gstr1HsnSummary,
      gstr3bFrom,
      gstr3bTo,
      outward3b,
      itc3b,
      net3b,
      gstr3bInvoicesFiltered,
      gstr3bPurchasesFiltered,
      purchaseRegFrom,
      purchaseRegTo,
      purchaseRegRows,
      purchaseRegRaw,
      gstRateFrom,
      gstRateTo,
      gstRateRows,
      ledgerFrom: ledgerAppliedFrom,
      ledgerTo: ledgerAppliedTo,
      ledgerPayByPbid: ledgerPbidForApi,
      ledgerPayByName: selectedLedgerPayByApplied?.name,
      ledgerPayByDetail: selectedLedgerPayByApplied?.detail,
      ledgerRows,
      ledgerSummary,
      expRptFrom,
      expRptTo,
      expRptRows,
      expRptSummary,
    })
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
              onChange={(e) => handleHeaderDateRangeChange(e.target.value)}
              className="select-input"
              aria-label="Report date range preset"
            > 
              <option value="current-month">current month</option>
              <option value="last-month">last month</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleExportExcel} title="Download Excel (.xlsx)">
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
          {activeReportId === 'purchase' && (
            <div className="exp-report">
              {/* Toolbar */}
              <div className="gst-rate-toolbar">
                <div className="gst-rate-dates">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={expRptFrom}
                      onChange={(e) => {
                        setDateRange('custom')
                        setExpRptFrom(e.target.value)
                      }}
                      className="form-input"
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={expRptTo}
                      onChange={(e) => {
                        setDateRange('custom')
                        setExpRptTo(e.target.value)
                      }}
                      className="form-input"
                    />
                  </label>
                </div>
              </div>

              {/* Summary Cards */}
              {expRptSummary && (
                <div className="exp-summary-grid">
                  <div className="exp-summary-card">
                    <span className="exp-summary-label">Total Payment</span>
                    <span className="exp-summary-value">{formatReportAmount(expRptSummary.total_payment)}</span>
                  </div>
                  <div className="exp-summary-card">
                    <span className="exp-summary-label">Taxable Amount</span>
                    <span className="exp-summary-value">{formatReportAmount(expRptSummary.total_taxable_amt)}</span>
                  </div>
                  <div className="exp-summary-card">
                    <span className="exp-summary-label">CGST</span>
                    <span className="exp-summary-value">{formatReportAmount(expRptSummary.total_cgst)}</span>
                  </div>
                  <div className="exp-summary-card">
                    <span className="exp-summary-label">SGST</span>
                    <span className="exp-summary-value">{formatReportAmount(expRptSummary.total_sgst)}</span>
                  </div>
                  <div className="exp-summary-card">
                    <span className="exp-summary-label">IGST</span>
                    <span className="exp-summary-value">{formatReportAmount(expRptSummary.total_igst)}</span>
                  </div>
                  <div className="exp-summary-card exp-summary-card--total">
                    <span className="exp-summary-label">Total GST</span>
                    <span className="exp-summary-value">{formatReportAmount(expRptSummary.total_gst)}</span>
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="card" style={{ marginTop: '1rem' }}>
                <h2 className="card-title">
                  Expenses &amp; Purchase Records
                  {expRptFrom && expRptTo && (
                    <span className="report-date-range-label">{expRptFrom} — {expRptTo}</span>
                  )}
                </h2>

                {expRptLoading && <div className="page-loading">Loading...</div>}

                {!expRptLoading && (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Inv No</th>
                          <th>Type</th>
                          <th>Date</th>
                          <th>Party</th>
                          <th>Item / Description</th>
                          <th className="text-right">Payment</th>
                          <th className="text-right">Taxable</th>
                          <th className="text-right">CGST</th>
                          <th className="text-right">SGST</th>
                          <th className="text-right">IGST</th>
                          <th>Pay By</th>
                          <th>Ref No</th>
                          <th>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expRptRows.length === 0 && (
                          <tr>
                            <td colSpan={13} className="text-center text-muted">No records found for selected date range.</td>
                          </tr>
                        )}
                        {expRptRows.map((row, idx) => (
                          <tr key={`${row.type}-${row.id}-${idx}`}>
                            <td className="font-medium">{row.inv_no ?? '—'}</td>
                            <td>
                              <span className={`badge badge--${row.type === 'purchase' ? 'pending' : 'paid'}`}>
                                {row.type === 'purchase' ? 'Purchase' : 'Expense'}
                              </span>
                            </td>
                            <td>{row.date ?? '—'}</td>
                            <td>{row.party_name ?? '—'}</td>
                            <td>{row.item_name ?? row.description ?? '—'}</td>
                            <td className="text-right">{formatReportAmount(row.payment)}</td>
                            <td className="text-right">{formatReportAmount(row.taxable_amt)}</td>
                            <td className="text-right">{formatReportAmount(row.cgst)}</td>
                            <td className="text-right">{formatReportAmount(row.sgst)}</td>
                            <td className="text-right">{formatReportAmount(row.igst)}</td>
                            <td>{row.payby ?? '—'}</td>
                            <td>{row.refno ?? '—'}</td>
                            <td>{row.state ?? '—'}</td>
                          </tr>
                        ))}
                        {expRptRows.length > 0 && expRptSummary && (
                          <tr className="table-total-row">
                            <td colSpan={5} className="font-medium">Total</td>
                            <td className="text-right font-medium">{formatReportAmount(expRptSummary.total_payment)}</td>
                            <td className="text-right font-medium">{formatReportAmount(expRptSummary.total_taxable_amt)}</td>
                            <td className="text-right font-medium">{formatReportAmount(expRptSummary.total_cgst)}</td>
                            <td className="text-right font-medium">{formatReportAmount(expRptSummary.total_sgst)}</td>
                            <td className="text-right font-medium">{formatReportAmount(expRptSummary.total_igst)}</td>
                            <td colSpan={3}></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeReportId === 'gst' && activeGstSub === 'gstr1' && (
            <div className="gstr1-report">
              <div className="gst-rate-toolbar">
                <div className="gst-rate-dates">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={gstr1From}
                      onChange={(e) => {
                        setDateRange('custom')
                        setGstr1From(e.target.value)
                      }}
                      className="form-input"
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={gstr1To}
                      onChange={(e) => {
                        setDateRange('custom')
                        setGstr1To(e.target.value)
                      }}
                      className="form-input"
                    />
                  </label>
                </div>
              </div>
              <h2 className="gst-rate-title">GSTR-1 – Outward Supplies</h2>
              {gstr1Loading && <p className="report-placeholder text-muted">Loading...</p>}
              <div className="gst-rate-table-wrap">
                <table className="gst-rate-table">
                  <thead>
                    <tr>
                      <th>Sno.</th>
                      <th>GSTIN</th>
                      <th>Party Name</th>
                      <th>Invoice no.</th>
                      <th>Date</th>
                      <th className="text-right">Value</th>
                      <th className="text-right">Tax Rate</th>
                      <th className="text-right">Taxable Value</th>
                      <th className="text-right">Integrated Tax</th>
                      <th className="text-right">Central Tax</th>
                      <th className="text-right">State Tax</th>
                      <th>Place of Supply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstr1Rows.map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{getDisplayValue(row.gstin)}</td>
                        <td>{getDisplayValue(row.partyName)}</td>
                        <td>{getDisplayValue(row.invNo)}</td>
                        <td>{getDisplayValue(row.date)}</td>
                        <td className="text-right">{formatReportAmount(row.value)}</td>
                        <td className="text-right">18%</td>
                        <td className="text-right">{formatReportAmount(row.taxableValue)}</td>
                        <td className="text-right">{formatReportAmount(row.integratedTaxDisplay)}</td>
                        <td className="text-right">{formatReportAmount(row.centralTaxDisplay)}</td>
                        <td className="text-right">{formatReportAmount(row.stateTaxDisplay)}</td>
                        <td>{getDisplayValue(row.placeOfSupply)}</td>
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

          {activeReportId === 'gst' && activeGstSub === 'gstr3b' && (
            <div className="gstr3b-report">
              <div className="gst-rate-toolbar">
                <div className="gst-rate-dates">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={gstr3bFrom}
                      onChange={(e) => {
                        setDateRange('custom')
                        setGstr3bFrom(e.target.value)
                      }}
                      className="form-input"
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={gstr3bTo}
                      onChange={(e) => {
                        setDateRange('custom')
                        setGstr3bTo(e.target.value)
                      }}
                      className="form-input"
                    />
                  </label>
                </div>
              </div>
              <h2 className="gst-rate-title">GSTR-3B – Monthly summary</h2>
              {/* <p className="report-placeholder text-muted gstr3b-note">
                India me monthly return ab <strong>GSTR-3B</strong> file hota hai (purana GSTR-3 band). Neeche sales / purchase
                bills se auto summary hai — final filing GST portal par karein.
              </p> */}
              {gstr3bLoading && <p className="report-placeholder text-muted">Loading...</p>}
              <div className="gstr3b-sections">
                <div className="card gstr3b-card">
                  <h3 className="card-title">3.1 Outward taxable supplies (sales)</h3>
                  <div className="gst-rate-table-wrap">
                    <table className="gst-rate-table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th className="text-right">Taxable value</th>
                          <th className="text-right">IGST</th>
                          <th className="text-right">CGST</th>
                          <th className="text-right">SGST</th>
                          <th className="text-right">Invoice value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Taxable outward supplies</td>
                          <td className="text-right">{formatReportAmount(outward3b.taxable)}</td>
                          <td className="text-right">{formatReportAmount(outward3b.igst)}</td>
                          <td className="text-right">{formatReportAmount(outward3b.cgst)}</td>
                          <td className="text-right">{formatReportAmount(outward3b.sgst)}</td>
                          <td className="text-right">{formatReportAmount(outward3b.invoiceValue)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-muted gstr3b-foot">
                    Invoices in range: {gstr3bInvoicesFiltered.length}
                  </p>
                </div>

                <div className="card gstr3b-card">
                  <h3 className="card-title">4 ITC available (purchases)</h3>
                  <div className="gst-rate-table-wrap">
                    <table className="gst-rate-table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th className="text-right">Taxable value</th>
                          <th className="text-right">IGST (ITC)</th>
                          <th className="text-right">CGST (ITC)</th>
                          <th className="text-right">SGST (ITC)</th>
                          <th className="text-right">Bill value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Inward supplies (ITC as per bills)</td>
                          <td className="text-right">{formatReportAmount(itc3b.taxable)}</td>
                          <td className="text-right">{formatReportAmount(itc3b.igst)}</td>
                          <td className="text-right">{formatReportAmount(itc3b.cgst)}</td>
                          <td className="text-right">{formatReportAmount(itc3b.sgst)}</td>
                          <td className="text-right">{formatReportAmount(itc3b.gross)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-muted gstr3b-foot">
                    Purchase bills in range: {gstr3bPurchasesFiltered.length}. 
                  </p>
                </div>

                <div className="card gstr3b-card">
                  <h3 className="card-title">Net tax (outward tax − ITC)</h3>
                  <div className="gst-rate-table-wrap">
                    <table className="gst-rate-table">
                      <thead>
                        <tr>
                          <th>Particulars</th>
                          <th className="text-right">IGST</th>
                          <th className="text-right">CGST</th>
                          <th className="text-right">SGST</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Net payable / (excess ITC) after set-off*</td>
                          <td className="text-right">{formatReportAmount(net3b.igst)}</td>
                          <td className="text-right">{formatReportAmount(net3b.cgst)}</td>
                          <td className="text-right">{formatReportAmount(net3b.sgst)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* <p className="text-muted gstr3b-foot">
                    *Simplified view; actual GSTR-3B me IGST/CGST/SGST set-off rules alag hote hain.
                  </p> */}
                </div>
              </div>
            </div>
          )}

          {activeReportId === 'gst' && activeGstSub === 'purchase-reg' && (
            <div className="purchase-reg-report">
              <div className="gst-rate-toolbar">
                <div className="gst-rate-dates">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={purchaseRegFrom}
                      onChange={(e) => {
                        setDateRange('custom')
                        setPurchaseRegFrom(e.target.value)
                      }}
                      className="form-input"
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={purchaseRegTo}
                      onChange={(e) => {
                        setDateRange('custom')
                        setPurchaseRegTo(e.target.value)
                      }}
                      className="form-input"
                    />
                  </label>
                </div>
              </div>
              <h2 className="gst-rate-title">Purchase register – Inward supplies (ITC)</h2>
              {/* <p className="report-placeholder text-muted gstr3b-note">
                GSTR-2B reconciliation ke liye vendor GSTIN, bill value aur tax break-up saath rakhna chahiye. Column mapping sales (GSTR-1) jaisi hai:
                Integrated = SGST, Central = IGST, State = CGST.
              </p> */}
              {purchaseRegLoading && <p className="report-placeholder text-muted">Loading...</p>}
              <div className="gst-rate-table-wrap">
                <table className="gst-rate-table">
                  <thead>
                    <tr>
                      <th>Sno.</th>
                      <th>Vendor GSTIN</th>
                      <th>Vendor / Party</th>
                      <th>Bill no.</th>
                      <th>Date</th>
                      <th className="text-right">Value</th>
                      <th className="text-right">Tax rate</th>
                      <th className="text-right">Taxable value</th>
                      <th className="text-right">Integrated tax</th>
                      <th className="text-right">Central tax</th>
                      <th className="text-right">State tax</th>
                      <th>Place of supply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseRegRows.map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{getDisplayValue(row.gstin)}</td>
                        <td>{getDisplayValue(row.partyName)}</td>
                        <td>{getDisplayValue(row.invNo)}</td>
                        <td>{getDisplayValue(row.date)}</td>
                        <td className="text-right">{formatReportAmount(row.value)}</td>
                        <td className="text-right">{`${Number(row.taxRate || 0).toFixed(2)}%`}</td>
                        <td className="text-right">{formatReportAmount(row.taxableValue)}</td>
                        <td className="text-right">{formatReportAmount(row.integratedTaxDisplay)}</td>
                        <td className="text-right">{formatReportAmount(row.centralTaxDisplay)}</td>
                        <td className="text-right">{formatReportAmount(row.stateTaxDisplay)}</td>
                        <td>{getDisplayValue(row.placeOfSupply)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {purchaseRegTotals && (
                    <tfoot>
                      <tr className="purchase-reg-tfoot">
                        <td colSpan={5}>
                          <strong>Total</strong> ({purchaseRegRows.length} bills)
                        </td>
                        <td className="text-right">
                          <strong>{formatReportAmount(purchaseRegTotals.value)}</strong>
                        </td>
                        <td />
                        <td className="text-right">
                          <strong>{formatReportAmount(purchaseRegTotals.taxable)}</strong>
                        </td>
                        <td className="text-right">
                          <strong>{formatReportAmount(purchaseRegTotals.sgst)}</strong>
                        </td>
                        <td className="text-right">
                          <strong>{formatReportAmount(purchaseRegTotals.igst)}</strong>
                        </td>
                        <td className="text-right">
                          <strong>{formatReportAmount(purchaseRegTotals.cgst)}</strong>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
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
                      onChange={(e) => {
                        setDateRange('custom')
                        setGstRateFrom(e.target.value)
                      }}
                      className="form-input"
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={gstRateTo}
                      onChange={(e) => {
                        setDateRange('custom')
                        setGstRateTo(e.target.value)
                      }}
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

          {activeReportId === 'ledger' && (
            <div className="card">
              <div className="ledger-toolbar">
                <h2 className="card-title" style={{ margin: 0 }}>Ledger</h2>
                <div className="ledger-toolbar-filters">
                  <div className="ledger-pay-by-group">
                    <label className="ledger-pay-by-label">
                      <span>Bank / Pay by</span>
                      <select
                        className="input-sm ledger-pay-by-select"
                        value={ledgerPayById}
                        onChange={(e) => setLedgerPayById(e.target.value)}
                        disabled={ledgerPayByLoading || ledgerPayByError || ledgerPayByList.length === 0}
                        aria-label="Bank or pay-by account for ledger"
                      >
                        {ledgerPayByList.map((p) => (
                          <option key={p.pbid} value={String(p.pbid)}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="ledger-date-row">
                    <label className="ledger-date-label">From</label>
                    <input
                      type="date"
                      value={ledgerFrom}
                      onChange={(e) => {
                        setDateRange('custom')
                        setLedgerFrom(e.target.value)
                      }}
                      className="input-sm"
                    />
                    <label className="ledger-date-label">To</label>
                    <input
                      type="date"
                      value={ledgerTo}
                      onChange={(e) => {
                        setDateRange('custom')
                        setLedgerTo(e.target.value)
                      }}
                      className="input-sm"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleLedgerApply}
                      disabled={ledgerLoading}
                    >
                      {ledgerLoading ? 'Loading...' : 'Apply'}
                    </button>
                  </div>
                </div>
              </div>
              {ledgerFiltersPending && (
                <p className="ledger-pending-hint text-muted">
                  Selected bank or dates are not loaded yet — click <strong>Apply</strong> to fetch from the server.
                </p>
              )}

              {/* Summary cards */}
              {ledgerSummary && (
                <div className="ledger-summary-row">
                  <div className="ledger-summary-card ledger-summary-card--credit">
                    <span className="ledger-summary-label">Total Credit</span>
                    <span className="ledger-summary-value">{formatReportAmount(ledgerSummary.total_credit)}</span>
                  </div>
                  <div className="ledger-summary-card ledger-summary-card--debit">
                    <span className="ledger-summary-label">Total Debit</span>
                    <span className="ledger-summary-value">{formatReportAmount(ledgerSummary.total_debit)}</span>
                  </div>
                  <div className="ledger-summary-card ledger-summary-card--balance">
                    <span className="ledger-summary-label">Closing Balance</span>
                    <span className="ledger-summary-value">{formatReportAmount(ledgerSummary.closing_balance)}</span>
                  </div>
                </div>
              )}

              {ledgerLoading && (
                <p className="report-placeholder text-muted" style={{ marginTop: '1rem' }}>Loading ledger...</p>
              )}

              {!ledgerLoading && ledgerRows.length === 0 && (
                <p className="report-placeholder text-muted" style={{ marginTop: '1rem' }}>
                  No entries found for selected date range.
                </p>
              )}

              {ledgerRows.length > 0 && (
                <div className="ledger-table-wrap">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>DATE</th>
                        <th>DESCRIPTION</th>
                        <th>TYPE</th>
                        <th>REF NO.</th>
                        <th className="text-right">DEBIT (₹)</th>
                        <th className="text-right">CREDIT (₹)</th>
                        <th className="text-right">BALANCE (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRows.map((row, i) => {
                        const balance = Number(row.balance ?? 0)
                        return (
                          <tr key={`${row.ref_id}-${i}`}>
                            <td className="ledger-date">
                              {row.date
                                ? new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—'}
                            </td>
                            <td className="ledger-particulars">
                              {row.description ? (
                                <span className="ledger-party">{row.description}</span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td>
                              <span className={`ledger-type-badge ledger-type-badge--${(row.type ?? '').toLowerCase()}`}>
                                {row.type ?? '—'}
                              </span>
                            </td>
                            <td className="text-muted">
                              {row.ref_no && row.ref_no !== '0' && row.ref_no !== null ? row.ref_no : '—'}
                            </td>
                            <td className="text-right ledger-debit">
                              {Number(row.debit) > 0 ? formatReportAmount(row.debit) : '—'}
                            </td>
                            <td className="text-right ledger-credit">
                              {Number(row.credit) > 0 ? formatReportAmount(row.credit) : '—'}
                            </td>
                            <td className="text-right ledger-balance">
                              {formatReportAmount(balance)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="ledger-totals-row">
                        <td colSpan={4}><strong>Closing Balance</strong></td>
                        <td className="text-right"><strong className="ledger-debit">{formatReportAmount(ledgerSummary?.total_debit ?? 0)}</strong></td>
                        <td className="text-right"><strong className="ledger-credit">{formatReportAmount(ledgerSummary?.total_credit ?? 0)}</strong></td>
                        <td className="text-right"><strong>{formatReportAmount(ledgerSummary?.closing_balance ?? 0)}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
