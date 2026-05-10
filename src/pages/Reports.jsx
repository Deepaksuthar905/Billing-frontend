import { useState, useEffect, useMemo } from 'react'
import { BarChart3, FileText, Calendar, Download, Share2, Printer, FileJson } from 'lucide-react'
import {
  API_BASE_URL,
  useGetGstRateReportQuery,
  useGetInvoicesQuery,
  useGetPurchaseOrdersQuery,
  useGetLedgerQuery,
  useGetExpenseReportQuery,
  useGetPayByListQuery,
  useGetCustomersQuery,
} from '../store/api'
import { getAuthToken } from '../lib/authToken'
import { exportCurrentReport } from '../utils/reportExcelExport'
import { aggregateHsnRows, downloadJson } from '../utils/gstr1JsonExport'
import { buildDocumentIssuedSummary } from '../utils/documentIssuedSummary'
import {
  buildPartyMapByPid,
  invoiceIsB2BByParty,
  mergePartyGstOntoInvoices,
} from '../utils/partyB2b'
import {
  buildCombinedGstr1PortalPayload,
  buildPortalSlicePayload,
  getB2bPortalSkippedInvoices,
} from '../utils/gstr1PortalSliceExport'
import './Reports.css'

/** Same outward-supply row shape as GSTR-1 table */
function mapInvoiceToGstr1Row(inv) {
  const cgst = Number(inv.cgst) || 0
  const sgst = Number(inv.sgst) || 0
  const igst = Number(inv.igst) || 0
  const totalTax = cgst + sgst + igst
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
    integratedTaxDisplay: igst,
    centralTaxDisplay: cgst,
    stateTaxDisplay: sgst,
    placeOfSupply: inv.state ?? inv.place_of_supply ?? inv.state_name ?? inv.pos,
  }
}

const GST_SUBS_WITH_INVOICES = ['gstr1', 'b2b', 'b2c', 'b2b-hsn', 'b2c-hsn', 'doc-summary']
/** B2B/B2C split needs `/customers` (party gst_no + gst_reg). */
const GST_SUBS_NEED_PARTY_FOR_B2 = ['b2b', 'b2c', 'b2b-hsn', 'b2c-hsn']

/** GST portal–style JSON download (NIC Returns JSON shape). */
const GST_SUBS_PORTAL_JSON = ['b2b', 'b2c', 'b2b-hsn', 'b2c-hsn', 'doc-summary']

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
  { id: 'b2b', title: 'B2B' },
  { id: 'b2c', title: 'B2C' },
  { id: 'b2b-hsn', title: 'B2B HSN' },
  { id: 'b2c-hsn', title: 'B2C HSN' },
  { id: 'doc-summary', title: 'Documents issued' },
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
      integratedTaxDisplay: igst,
      centralTaxDisplay: cgst,
      stateTaxDisplay: sgst,
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
  const [isExportingPortalJson, setIsExportingPortalJson] = useState(false)
  const [isExportingFullGstr1Json, setIsExportingFullGstr1Json] = useState(false)

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
      if (GST_SUBS_WITH_INVOICES.includes(activeGstSub)) {
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

  const { data: invoicesData, isLoading: gstInvoicesLoading } = useGetInvoicesQuery(
    { from: gstr1From, to: gstr1To },
    { skip: !(activeReportId === 'gst' && GST_SUBS_WITH_INVOICES.includes(activeGstSub)) }
  )

  const { data: customersData, isLoading: customersForB2Loading } = useGetCustomersQuery(undefined, {
    skip: !(activeReportId === 'gst' && GST_SUBS_NEED_PARTY_FOR_B2.includes(activeGstSub)),
  })

  const partyByPid = useMemo(
    () => buildPartyMapByPid(customersData?.data ?? []),
    [customersData?.data]
  )

  const gstB2SplitLoading =
    gstInvoicesLoading ||
    (GST_SUBS_NEED_PARTY_FOR_B2.includes(activeGstSub) && customersForB2Loading)

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
  const gstr1Rows = filteredInvoices.map(mapInvoiceToGstr1Row)

  const b2bInvoices = filteredInvoices.filter((inv) => invoiceIsB2BByParty(inv, partyByPid))
  const b2cInvoices = filteredInvoices.filter((inv) => !invoiceIsB2BByParty(inv, partyByPid))
  const b2bRows = b2bInvoices.map(mapInvoiceToGstr1Row)
  const b2cRows = b2cInvoices.map(mapInvoiceToGstr1Row)
  const b2bHsnRows = aggregateHsnRows(b2bInvoices)
  const b2cHsnRows = aggregateHsnRows(b2cInvoices)
  const b2bHsnTotals = b2bHsnRows.reduce(
    (s, r) => ({
      txval: s.txval + (Number(r.txval) || 0),
      iamt: s.iamt + (Number(r.iamt) || 0),
      camt: s.camt + (Number(r.camt) || 0),
      samt: s.samt + (Number(r.samt) || 0),
    }),
    { txval: 0, iamt: 0, camt: 0, samt: 0 }
  )
  const b2cHsnTotals = b2cHsnRows.reduce(
    (s, r) => ({
      txval: s.txval + (Number(r.txval) || 0),
      iamt: s.iamt + (Number(r.iamt) || 0),
      camt: s.camt + (Number(r.camt) || 0),
      samt: s.samt + (Number(r.samt) || 0),
    }),
    { txval: 0, iamt: 0, camt: 0, samt: 0 }
  )
  const documentIssuedSummary = buildDocumentIssuedSummary(filteredInvoices)
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
        igst: purchaseRegRows.reduce((s, r) => s + (r.integratedTaxDisplay || 0), 0),
        cgst: purchaseRegRows.reduce((s, r) => s + (r.centralTaxDisplay || 0), 0),
        sgst: purchaseRegRows.reduce((s, r) => s + (r.stateTaxDisplay || 0), 0),
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

  const handleExportGstPortalJson = async () => {
    if (!GST_SUBS_PORTAL_JSON.includes(activeGstSub)) return

    let sourceRows = filteredInvoices
    if (activeGstSub === 'b2b' || activeGstSub === 'b2b-hsn') sourceRows = b2bInvoices
    else if (activeGstSub === 'b2c' || activeGstSub === 'b2c-hsn') sourceRows = b2cInvoices

    if (activeGstSub !== 'doc-summary' && !sourceRows.length) {
      alert('No invoices to export for this tab.')
      return
    }
    if (activeGstSub === 'doc-summary' && !filteredInvoices.length) {
      alert('No invoices to export for this tab.')
      return
    }

    setIsExportingPortalJson(true)
    try {
      const token = getAuthToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      let customersList = customersData?.data ?? []
      if (!customersList.length) {
        const cr = await fetch(`${API_BASE_URL}/customers`, { headers })
        if (cr.ok) {
          const raw = await cr.json()
          customersList =
            raw?.data ?? raw?.results ?? (Array.isArray(raw) ? raw : [])
        }
      }
      const partyByPid = buildPartyMapByPid(customersList)

      const idsForFetch =
        activeGstSub === 'doc-summary'
          ? filteredInvoices.map((i) => i.id).filter((id) => id != null)
          : sourceRows.map((i) => i.id).filter((id) => id != null)

      const rows = await Promise.all(
        idsForFetch.map(async (id) => {
          const res = await fetch(`${API_BASE_URL}/invoices/${id}`, { headers })
          if (!res.ok) throw new Error(`Could not load invoice ${id} (${res.status})`)
          const raw = await res.json()
          return raw?.data ?? raw
        })
      )
      const merged = mergePartyGstOntoInvoices(rows, customersList)

      const anchor = gstr1From || gstr1To || (merged[0] && (merged[0].dt ?? merged[0].date))
      const payload = buildPortalSlicePayload(activeGstSub, {
        fullInvoices: merged,
        partyByPid,
        anchorDateStr: anchor,
      })

      const fp = payload.fp
      const g = payload.gstin
      const labels = {
        b2b: 'B2B',
        b2c: 'B2CS',
        'b2b-hsn': 'B2B_HSN',
        'b2c-hsn': 'B2C_HSN',
        'doc-summary': 'DOC_ISSUE',
      }
      const fn = `GSTR1_${labels[activeGstSub]}_${fp}_${g}.json`.replace(/[/\\:*?"<>|]/g, '-')

      if (activeGstSub === 'b2b') {
        const b2bFull = merged.filter((inv) => invoiceIsB2BByParty(inv, partyByPid))
        const skipped = getB2bPortalSkippedInvoices(b2bFull, partyByPid, g)
        if (skipped.length) {
          alert(
            `${skipped.length} invoice(s) skipped — buyer GSTIN must be valid 15-character format on party or invoice: ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '…' : ''}`
          )
        }
        if (!payload.b2b?.length) {
          alert('No B2B rows with valid GSTIN in JSON (portal requires ctin). Empty b2b array in file.')
        }
      }

      downloadJson(fn, payload)
    } catch (err) {
      console.error('GST portal JSON export failed:', err)
      alert(err?.message || 'Export failed. Check console.')
    } finally {
      setIsExportingPortalJson(false)
    }
  }

  const handleExportCombinedGstr1Json = async () => {
    if (activeReportId !== 'gst' || !GST_SUBS_WITH_INVOICES.includes(activeGstSub)) return
    if (!filteredInvoices.length) {
      alert('No invoices in the selected date range.')
      return
    }

    setIsExportingFullGstr1Json(true)
    try {
      const token = getAuthToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      let customersList = customersData?.data ?? []
      if (!customersList.length) {
        const cr = await fetch(`${API_BASE_URL}/customers`, { headers })
        if (cr.ok) {
          const raw = await cr.json()
          customersList =
            raw?.data ?? raw?.results ?? (Array.isArray(raw) ? raw : [])
        }
      }
      const partyByPid = buildPartyMapByPid(customersList)

      const idsForFetch = filteredInvoices.map((i) => i.id).filter((id) => id != null)

      const rows = await Promise.all(
        idsForFetch.map(async (id) => {
          const res = await fetch(`${API_BASE_URL}/invoices/${id}`, { headers })
          if (!res.ok) throw new Error(`Could not load invoice ${id} (${res.status})`)
          const raw = await res.json()
          return raw?.data ?? raw
        })
      )
      const merged = mergePartyGstOntoInvoices(rows, customersList)

      const anchor = gstr1From || gstr1To || (merged[0] && (merged[0].dt ?? merged[0].date))
      const payload = buildCombinedGstr1PortalPayload({
        fullInvoices: merged,
        partyByPid,
        anchorDateStr: anchor,
      })

      const b2bFull = merged.filter((inv) => invoiceIsB2BByParty(inv, partyByPid))
      const skipped = getB2bPortalSkippedInvoices(b2bFull, partyByPid, payload.gstin)
      if (skipped.length) {
        alert(
          `${skipped.length} B2B invoice(s) skipped in b2b block — portal needs valid 15-char GSTIN on party/invoice: ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '…' : ''}`
        )
      }

      const fn = `GSTR1_FULL_${payload.fp}_${payload.gstin}.json`.replace(/[/\\:*?"<>|]/g, '-')
      downloadJson(fn, payload)
    } catch (err) {
      console.error('Full GSTR-1 JSON export failed:', err)
      alert(err?.message || 'Export failed. Check console.')
    } finally {
      setIsExportingFullGstr1Json(false)
    }
  }

  const handleExportExcel = () => {
    exportCurrentReport({
      activeReportId,
      activeGstSub,
      gstr1From,
      gstr1To,
      gstr1Rows,
      gstr1HsnSummary,
      b2bFrom: gstr1From,
      b2bTo: gstr1To,
      b2bRows,
      b2cRows,
      b2bHsnRows,
      b2cHsnRows,
      docSummaryFrom: gstr1From,
      docSummaryTo: gstr1To,
      documentIssuedSummary,
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
          {activeReportId === 'gst' && GST_SUBS_WITH_INVOICES.includes(activeGstSub) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCombinedGstr1Json}
              disabled={
                isExportingFullGstr1Json || isExportingPortalJson || gstInvoicesLoading
              }
              title="Single file: b2b + b2cs + hsn (B2B & B2C) + doc_issue — same combined shape as GSTR-1 offline utility"
            >
              <FileJson size={18} />
              {isExportingFullGstr1Json ? 'Building…' : 'Full GSTR-1 JSON'}
            </button>
          )}
          {activeReportId === 'gst' && GST_SUBS_PORTAL_JSON.includes(activeGstSub) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportGstPortalJson}
              disabled={
                isExportingPortalJson || isExportingFullGstr1Json || gstInvoicesLoading
              }
              title="Current tab only — slice JSON for GST offline tool"
            >
              <FileJson size={18} />
              {isExportingPortalJson ? 'Exporting…' : 'Tab JSON'}
            </button>
          )}
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
              {gstInvoicesLoading && <p className="report-placeholder text-muted">Loading...</p>}
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
                        <td className="text-right">{`${Number(row.taxRate || 0).toFixed(2)}%`}</td>
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

          {activeReportId === 'gst' && activeGstSub === 'b2b' && (
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
              <h2 className="gst-rate-title">B2B – Registered outward supplies</h2>
              <p className="report-placeholder text-muted" style={{ marginBottom: '0.75rem' }}>
                Party master: <code>gst_no</code> filled and <code>gst_reg</code> = 1. Count: {b2bRows.length}
              </p>
              {gstB2SplitLoading && <p className="report-placeholder text-muted">Loading...</p>}
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
                    {b2bRows.map((row, i) => (
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
                </table>
              </div>
            </div>
          )}

          {activeReportId === 'gst' && activeGstSub === 'b2c' && (
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
              <h2 className="gst-rate-title">B2C – Unregistered / retail outward supplies</h2>
              <p className="report-placeholder text-muted" style={{ marginBottom: '0.75rem' }}>
                All others (no party match, empty <code>gst_no</code>, or <code>gst_reg</code> ≠ 1). Count:{' '}
                {b2cRows.length}
              </p>
              {gstB2SplitLoading && <p className="report-placeholder text-muted">Loading...</p>}
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
                    {b2cRows.map((row, i) => (
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
                </table>
              </div>
            </div>
          )}

          {activeReportId === 'gst' && activeGstSub === 'b2b-hsn' && (
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
              <h2 className="gst-rate-title">B2B – HSN summary</h2>
              <p className="report-placeholder text-muted" style={{ marginBottom: '0.75rem' }}>
                HSN-wise totals for party-B2B invoices only ({b2bInvoices.length} invoices).
              </p>
              {gstB2SplitLoading && <p className="report-placeholder text-muted">Loading...</p>}
              <div className="gst-rate-table-wrap">
                <table className="gst-rate-table">
                  <thead>
                    <tr>
                      <th>Sno.</th>
                      <th>HSN</th>
                      <th>UQC</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate %</th>
                      <th className="text-right">Taxable value</th>
                      <th className="text-right">IGST</th>
                      <th className="text-right">CGST</th>
                      <th className="text-right">SGST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b2bHsnRows.map((row) => (
                      <tr key={`${row.hsn_sc}-${row.rt}-${row.uqc}-${row.num}`}>
                        <td>{row.num}</td>
                        <td>{row.hsn_sc}</td>
                        <td>{row.uqc}</td>
                        <td className="text-right">{row.qty}</td>
                        <td className="text-right">{`${Number(row.rt || 0).toFixed(2)}%`}</td>
                        <td className="text-right">{formatReportAmount(row.txval)}</td>
                        <td className="text-right">{formatReportAmount(row.iamt)}</td>
                        <td className="text-right">{formatReportAmount(row.camt)}</td>
                        <td className="text-right">{formatReportAmount(row.samt)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {b2bHsnRows.length > 0 && (
                    <tfoot>
                      <tr className="table-total-row">
                        <td colSpan={5} className="font-medium">Total</td>
                        <td className="text-right font-medium">{formatReportAmount(b2bHsnTotals.txval)}</td>
                        <td className="text-right font-medium">{formatReportAmount(b2bHsnTotals.iamt)}</td>
                        <td className="text-right font-medium">{formatReportAmount(b2bHsnTotals.camt)}</td>
                        <td className="text-right font-medium">{formatReportAmount(b2bHsnTotals.samt)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {activeReportId === 'gst' && activeGstSub === 'b2c-hsn' && (
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
              <h2 className="gst-rate-title">B2C – HSN summary</h2>
              <p className="report-placeholder text-muted" style={{ marginBottom: '0.75rem' }}>
                HSN-wise totals for non–party-B2B invoices ({b2cInvoices.length} invoices).
              </p>
              {gstB2SplitLoading && <p className="report-placeholder text-muted">Loading...</p>}
              <div className="gst-rate-table-wrap">
                <table className="gst-rate-table">
                  <thead>
                    <tr>
                      <th>Sno.</th>
                      <th>HSN</th>
                      <th>UQC</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate %</th>
                      <th className="text-right">Taxable value</th>
                      <th className="text-right">IGST</th>
                      <th className="text-right">CGST</th>
                      <th className="text-right">SGST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b2cHsnRows.map((row) => (
                      <tr key={`${row.hsn_sc}-${row.rt}-${row.uqc}-${row.num}`}>
                        <td>{row.num}</td>
                        <td>{row.hsn_sc}</td>
                        <td>{row.uqc}</td>
                        <td className="text-right">{row.qty}</td>
                        <td className="text-right">{`${Number(row.rt || 0).toFixed(2)}%`}</td>
                        <td className="text-right">{formatReportAmount(row.txval)}</td>
                        <td className="text-right">{formatReportAmount(row.iamt)}</td>
                        <td className="text-right">{formatReportAmount(row.camt)}</td>
                        <td className="text-right">{formatReportAmount(row.samt)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {b2cHsnRows.length > 0 && (
                    <tfoot>
                      <tr className="table-total-row">
                        <td colSpan={5} className="font-medium">Total</td>
                        <td className="text-right font-medium">{formatReportAmount(b2cHsnTotals.txval)}</td>
                        <td className="text-right font-medium">{formatReportAmount(b2cHsnTotals.iamt)}</td>
                        <td className="text-right font-medium">{formatReportAmount(b2cHsnTotals.camt)}</td>
                        <td className="text-right font-medium">{formatReportAmount(b2cHsnTotals.samt)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {activeReportId === 'gst' && activeGstSub === 'doc-summary' && (
            <div className="gstr1-report doc-issued-report">
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
              <h2 className="gst-rate-title">Summary of documents issued during the tax period</h2>
              <p className="report-placeholder text-muted" style={{ marginBottom: '0.75rem' }}>
                Same date range as GSTR-1. Rows group by document type (invoice vs credit/debit note). Serial range uses
                trailing numbers in invoice no. when possible; otherwise full number as printed. Cancelled ={' '}
                <code>status</code> cancelled or flags <code>cancelled</code> / <code>is_cancelled</code>.
              </p>
              {gstInvoicesLoading && <p className="report-placeholder text-muted">Loading...</p>}
              <div className="gst-rate-table-wrap">
                <table className="gst-rate-table doc-issued-table">
                  <thead>
                    <tr className="doc-issued-grand-total">
                      <th colSpan={3} className="text-left text-muted" style={{ fontWeight: 600 }}>
                        Period total
                      </th>
                      <th className="text-right">{documentIssuedSummary.grandTotal}</th>
                      <th className="text-right">{documentIssuedSummary.grandCancelled}</th>
                    </tr>
                    <tr>
                      <th>Nature of document</th>
                      <th>Sr. No. From</th>
                      <th>Sr. No. To</th>
                      <th className="text-right">Total Number</th>
                      <th className="text-right">Cancelled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentIssuedSummary.rows.length === 0 && !gstInvoicesLoading && (
                      <tr>
                        <td colSpan={5} className="text-center text-muted">
                          No documents in this range.
                        </td>
                      </tr>
                    )}
                    {documentIssuedSummary.rows.map((row) => (
                      <tr key={row.nature}>
                        <td>{row.nature}</td>
                        <td>{row.srFrom}</td>
                        <td>{row.srTo}</td>
                        <td className="text-right">{row.totalNumber}</td>
                        <td className="text-right">{row.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                          <strong>{formatReportAmount(purchaseRegTotals.igst)}</strong>
                        </td>
                        <td className="text-right">
                          <strong>{formatReportAmount(purchaseRegTotals.cgst)}</strong>
                        </td>
                        <td className="text-right">
                          <strong>{formatReportAmount(purchaseRegTotals.sgst)}</strong>
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
