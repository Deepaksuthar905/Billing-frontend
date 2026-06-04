/**
 * Builds GSTR-1-style outward-supply JSON (b2b + hsn + doc_issue) for offline tools / GST utilities.
 * Matches common JSON templates with gstin, fp (MMYYYY), b2b[].ctin / inv[], hsn.hsn_b2b[], doc_issue.
 */

export const DEFAULT_SELLER_GSTIN =
  import.meta.env.VITE_COMPANY_GSTIN || '08DTGPS6229M2ZW'

export function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100
}

/** DD-MM-YYYY */
export function formatIdt(dt) {
  if (!dt) return ''
  const d = new Date(typeof dt === 'string' && dt.length <= 10 ? `${dt}T12:00:00` : dt)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

/** Filing period MMYYYY — use anchor date (e.g. filter “from” or first invoice). */
export function dateToFp(anchorDateStr) {
  const d = anchorDateStr
    ? new Date(`${anchorDateStr}T12:00:00`)
    : new Date()
  if (Number.isNaN(d.getTime())) {
    const n = new Date()
    return `${String(n.getMonth() + 1).padStart(2, '0')}${n.getFullYear()}`
  }
  return `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`
}

function normalizeItems(inv) {
  if (Array.isArray(inv.items) && inv.items.length) return inv.items
  if (Array.isArray(inv.line_items) && inv.line_items.length) return inv.line_items
  return []
}

function invNo(inv) {
  return String(inv.inv_no ?? inv.invoice_no ?? inv.id ?? '').trim()
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

/** Buyer GSTIN — checks common API keys + nested customer; ignores value if it equals seller GSTIN. */
function normalizeGstinStr(v) {
  const g = String(v ?? '')
    .replace(/\s/g, '')
    .toUpperCase()
  return g.length === 15 ? g : ''
}

export function customerGstin(inv, sellerGstin = '') {
  const seller = normalizeGstinStr(sellerGstin)
  const cust =
    inv.customer && typeof inv.customer === 'object'
      ? inv.customer
      : null
  const party =
    inv.party && typeof inv.party === 'object' ? inv.party : null

  const candidates = [
    inv.customer_gstin,
    inv.buyer_gstin,
    inv.party_gstin,
    inv.billing_gstin,
    inv.gst_no,
    inv.gstin_no,
    cust?.gst_no,
    cust?.gstin,
    party?.gst_no,
    party?.gstin,
    /** Often buyer GSTIN; skip when API duplicates seller here */
    inv.gstin,
  ]

  for (const c of candidates) {
    const g = normalizeGstinStr(c)
    if (!g || !GSTIN_RE.test(g)) continue
    if (seller && g === seller) continue
    return g
  }
  return ''
}

/** Registered buyer (valid GSTIN, not seller) — B2B vs B2C in UI reports. */
export function isB2BInvoice(inv, sellerGstin = DEFAULT_SELLER_GSTIN) {
  const seller = normalizeGstinStr(sellerGstin)
  const ctin = customerGstin(inv, seller || '')
  return GSTIN_RE.test(ctin)
}

/** POS: 2-digit state code — prefer buyer GSTIN; else numeric state field; else seller state. */
export function getGstr1PlaceOfSupply(inv, sellerGstin = DEFAULT_SELLER_GSTIN) {
  const g = customerGstin(inv, sellerGstin)
  if (g && GSTIN_RE.test(g)) return g.slice(0, 2)
  const raw = inv.place_of_supply ?? inv.state ?? inv.state_name ?? inv.pos ?? ''
  const s = String(raw).trim()
  if (/^[0-9]{2}$/.test(s)) return s
  if (/^[0-9]{2}-/.test(s)) return s.slice(0, 2)
  return String(sellerGstin || '').slice(0, 2) || '00'
}

function unitToUqc(unit) {
  const u = String(unit ?? '')
    .trim()
    .toUpperCase()
  if (!u) return 'NOS'
  const map = {
    PCS: 'PCS',
    PIECE: 'PCS',
    PIECES: 'PCS',
    NOS: 'NOS',
    CTN: 'CTN',
    CARTON: 'CTN',
    BOX: 'BOX',
    KGS: 'KGS',
    KG: 'KGS',
    SQF: 'SQF',
    SQFT: 'SQF',
    MTR: 'MTR',
    MTRS: 'MTR',
    LTR: 'LTR',
    SET: 'SET',
    SETS: 'SET',
    BAG: 'BAG',
    BAGS: 'BAG',
    DRM: 'DRM',
    ROLL: 'ROLL',
  }
  if (map[u]) return map[u]
  if (u.length <= 3) return u
  return u.slice(0, 8)
}

function lineTaxSplit(lineTax, headerIgst) {
  const t = round2(lineTax)
  if (headerIgst > 0.005) {
    return { iamt: t, camt: 0, samt: 0 }
  }
  const half = round2(t / 2)
  return { iamt: 0, camt: half, samt: round2(t - half) }
}

/**
 * @param {object} inv – full invoice from API
 * @param {string} sellerGstin
 */
export function buildGstr1InvoiceEntry(inv, sellerGstin) {
  const inum = invNo(inv)
  const idt = formatIdt(inv.dt ?? inv.date)
  const cgst = Number(inv.cgst) || 0
  const sgst = Number(inv.sgst) || 0
  const igst = Number(inv.igst) || 0
  const totalTax = cgst + sgst + igst
  const invoiceValue = Number(inv.amount) || Number(inv.payment) || 0
  const headerTaxable = invoiceValue - totalTax
  const safeHeaderTaxable = headerTaxable > 0 ? headerTaxable : invoiceValue

  const pos = getGstr1PlaceOfSupply(inv, sellerGstin)
  const items = normalizeItems(inv)
  const rtDefault = (() => {
    const t = cgst + sgst + igst
    const tv = safeHeaderTaxable > 0 ? safeHeaderTaxable : 1
    return t > 0 ? Math.round((t / tv) * 100) : 18
  })()

  let itms
  if (items.length === 0) {
    itms = [
      {
        num: 1,
        itm_det: {
          txval: round2(safeHeaderTaxable),
          rt: rtDefault,
          iamt: round2(igst),
          camt: round2(cgst),
          samt: round2(sgst),
          csamt: 0,
        },
      },
    ]
  } else {
    itms = items.map((line, idx) => {
      const gross = Number(line.amount ?? line.total ?? 0)
      const lineTax = Number(line.tax_amt ?? line.gst_amt ?? line.taxAmt ?? 0)
      const txval = gross - lineTax > 0 ? round2(gross - lineTax) : round2(gross)
      const rt = Number(line.tax_pct ?? line.gst_pct ?? line.gst ?? rtDefault) || rtDefault
      const { iamt, camt, samt } = lineTaxSplit(lineTax, igst)
      return {
        num: idx + 1,
        itm_det: {
          txval,
          rt,
          iamt,
          camt,
          samt,
          csamt: 0,
        },
      }
    })
  }

  return {
    inum,
    idt,
    val: Math.round(invoiceValue),
    pos,
    rchrg: 'N',
    inv_typ: 'R',
    itms,
  }
}

/**
 * HSN-wise aggregate (same rules as GSTR-1 JSON `hsn.hsn_b2b`).
 * @param {object[]} fullInvoices
 */
export function aggregateHsnRows(fullInvoices) {
  const hsnAgg = new Map()
  let hsnSeq = 0

  for (const inv of fullInvoices) {
    const cgst = Number(inv.cgst) || 0
    const sgst = Number(inv.sgst) || 0
    const igst = Number(inv.igst) || 0
    const items = normalizeItems(inv)

    if (items.length === 0) {
      const hsn_sc = String(inv.hsn ?? inv.hsn_code ?? '998319').replace(/\D/g, '').slice(0, 8) || '998319'
      const invoiceValue = Number(inv.amount) || Number(inv.payment) || 0
      const totalTax = cgst + sgst + igst
      const txval = round2(invoiceValue - totalTax > 0 ? invoiceValue - totalTax : invoiceValue)
      const rtCalc = txval > 0 ? Math.round((totalTax / txval) * 100) : 18
      const key = `${hsn_sc}|${rtCalc}|NOS`
      const prev = hsnAgg.get(key) || {
        num: 0,
        hsn_sc,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0,
        desc: '',
        user_desc: '',
        uqc: 'NOS',
        qty: 0,
        rt: rtCalc,
      }
      prev.txval = round2(prev.txval + txval)
      prev.iamt = round2(prev.iamt + igst)
      prev.camt = round2(prev.camt + cgst)
      prev.samt = round2(prev.samt + sgst)
      prev.qty = round2(prev.qty + 1)
      hsnAgg.set(key, prev)
      continue
    }

    for (const line of items) {
      const hsn_sc = String(line.hsn_code ?? line.hsn ?? line.hsnCode ?? inv.hsn ?? '998319')
        .replace(/\D/g, '')
        .slice(0, 8) || '998319'
      const gross = Number(line.amount ?? line.total ?? 0)
      const lineTax = Number(line.tax_amt ?? line.gst_amt ?? line.taxAmt ?? 0)
      const txval = round2(gross - lineTax > 0 ? gross - lineTax : gross)
      const rtRaw = Number(line.tax_pct ?? line.gst_pct ?? 0) || (txval > 0 ? Math.round((lineTax / txval) * 100) : 18)
      const rt = Math.round(rtRaw)
      const qty = Number(line.qty ?? line.quantity ?? 1) || 1
      const uqc = unitToUqc(line.unit ?? line.uqc ?? line.uom)
      const key = `${hsn_sc}|${rt}|${uqc}`
      const lineIgst = igst > 0.005 ? lineTax : 0
      const lineCgst = igst > 0.005 ? 0 : round2(lineTax / 2)
      const lineSgst = igst > 0.005 ? 0 : round2(lineTax - lineCgst)

      const prev = hsnAgg.get(key) || {
        num: 0,
        hsn_sc,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0,
        desc: '',
        user_desc: '',
        uqc,
        qty: 0,
        rt,
      }
      prev.txval = round2(prev.txval + txval)
      prev.iamt = round2(prev.iamt + lineIgst)
      prev.camt = round2(prev.camt + lineCgst)
      prev.samt = round2(prev.samt + lineSgst)
      prev.qty = round2(prev.qty + qty)
      hsnAgg.set(key, prev)
    }
  }

  return [...hsnAgg.values()]
    .sort((a, b) => a.hsn_sc.localeCompare(b.hsn_sc) || a.rt - b.rt || a.uqc.localeCompare(b.uqc))
    .map((row) => {
      hsnSeq += 1
      return { ...row, num: hsnSeq }
    })
}

/**
 * @param {object[]} fullInvoices – each element: normalized invoice object (with items when available)
 * @param {{ gstin?: string, fp?: string, anchorDateForFp?: string }} opts
 */
export function buildGstr1JsonPayload(fullInvoices, opts = {}) {
  const gstin = (opts.gstin || DEFAULT_SELLER_GSTIN).replace(/\s/g, '').toUpperCase()
  const fp =
    opts.fp ||
    dateToFp(opts.anchorDateForFp || (fullInvoices[0] && (fullInvoices[0].dt ?? fullInvoices[0].date)))

  const byCtin = {}
  const skippedNoGstin = []
  for (const inv of fullInvoices) {
    const ctin = customerGstin(inv, gstin)
    if (!GSTIN_RE.test(ctin)) {
      skippedNoGstin.push(invNo(inv) || inv.id)
      continue
    }
    if (!byCtin[ctin]) byCtin[ctin] = []
    byCtin[ctin].push(inv)
  }

  const b2b = Object.keys(byCtin)
    .sort()
    .map((ctin) => ({
      ctin,
      inv: byCtin[ctin].map((inv) => buildGstr1InvoiceEntry(inv, gstin)),
    }))

  const hsn_b2b = aggregateHsnRows(fullInvoices)

  const sortedForDocs = [...fullInvoices].sort((a, b) => {
    const da = new Date(a.dt ?? a.date ?? 0).getTime()
    const db = new Date(b.dt ?? b.date ?? 0).getTime()
    if (da !== db) return da - db
    return invNo(a).localeCompare(invNo(b), undefined, { numeric: true })
  })
  const nums = sortedForDocs.map((x) => invNo(x)).filter(Boolean)
  const doc_issue =
    nums.length > 0
      ? {
          doc_det: [
            {
              doc_num: 1,
              docs: [
                {
                  cancel: 0,
                  from: nums[0],
                  to: nums[nums.length - 1],
                  net_issue: sortedForDocs.length,
                  num: 1,
                  totnum: sortedForDocs.length,
                },
              ],
            },
          ],
        }
      : { doc_det: [] }

  return {
    payload: {
      gstin,
      fp,
      b2b,
      hsn: { hsn_b2b },
      doc_issue,
    },
    skippedNoGstin,
  }
}

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 0)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
