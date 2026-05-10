/**
 * GSTR-1 portal-oriented JSON slices (NIC offline tool / Returns JSON shape).
 * Tabs: b2b, b2c (→ b2cs), b2b-hsn, b2c-hsn, doc-summary (→ doc_issue).
 */

import { buildDocumentIssuedSummary } from './documentIssuedSummary'
import { invoiceIsB2BByParty } from './partyB2b'
import {
  aggregateHsnRows,
  buildGstr1InvoiceEntry,
  customerGstin,
  dateToFp,
  DEFAULT_SELLER_GSTIN,
  getGstr1PlaceOfSupply,
  round2,
} from './gstr1JsonExport'

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

function invNo(inv) {
  return String(inv.inv_no ?? inv.invoice_no ?? inv.id ?? '').trim()
}

function normalizeCtin(g) {
  const x = String(g ?? '')
    .replace(/\s/g, '')
    .toUpperCase()
  return x.length === 15 && GSTIN_RE.test(x) ? x : ''
}

function resolveCtinForB2bPortal(inv, partyByPid, sellerGstin) {
  const pid = inv.pid ?? inv.customer_id ?? inv.party_id
  const party = pid != null ? partyByPid.get(String(pid)) : null
  if (party?.gst_no) {
    const fromParty = normalizeCtin(party.gst_no)
    if (fromParty) return fromParty
  }
  return normalizeCtin(customerGstin(inv, sellerGstin))
}

function buildB2bPortalSection(b2bFull, partyByPid, sellerGstin) {
  const byCtin = {}
  const skippedNoValidCtin = []
  for (const inv of b2bFull) {
    const ctin = resolveCtinForB2bPortal(inv, partyByPid, sellerGstin)
    if (!ctin) {
      skippedNoValidCtin.push(invNo(inv) || String(inv.id ?? ''))
      continue
    }
    if (!byCtin[ctin]) byCtin[ctin] = []
    byCtin[ctin].push(inv)
  }
  const b2b = Object.keys(byCtin)
    .sort()
    .map((ctin) => ({
      ctin,
      inv: byCtin[ctin].map((inv) => buildGstr1InvoiceEntry(inv, sellerGstin)),
    }))
  return { b2b, skippedNoValidCtin }
}

/**
 * B2CS consolidated rows (INTER vs INTRAB2C, rate, POS) — typical Returns JSON `b2cs`.
 */
export function buildB2csPortalRows(b2cInvoices, sellerGstin = DEFAULT_SELLER_GSTIN) {
  const seller = String(sellerGstin || DEFAULT_SELLER_GSTIN).replace(/\s/g, '').toUpperCase()
  const map = new Map()

  for (const inv of b2cInvoices) {
    const igst = Number(inv.igst) || 0
    const cgst = Number(inv.cgst) || 0
    const sgst = Number(inv.sgst) || 0
    const totalTax = cgst + sgst + igst
    const invoiceValue = Number(inv.amount) || Number(inv.payment) || 0
    const taxablePre = invoiceValue - totalTax
    const taxable = taxablePre > 0 ? taxablePre : invoiceValue

    const sply_ty = igst > 0.005 ? 'INTER' : 'INTRAB2C'
    const pos = getGstr1PlaceOfSupply(inv, seller)
    const gstPct = inv.gst != null && inv.gst !== '' ? Number(inv.gst) : null
    const rtRaw =
      gstPct != null && !Number.isNaN(gstPct)
        ? gstPct
        : taxable > 0
          ? (totalTax / taxable) * 100
          : 0
    const rt = round2(rtRaw)
    const key = `${sply_ty}|${rt}|${pos}`

    const prev =
      map.get(key) || {
        sply_ty,
        rt,
        typ: 'OE',
        etin: '',
        pos,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0,
      }
    prev.txval = round2(prev.txval + round2(taxable))
    prev.iamt = round2(prev.iamt + igst)
    prev.camt = round2(prev.camt + cgst)
    prev.samt = round2(prev.samt + sgst)
    map.set(key, prev)
  }

  return [...map.values()].sort((a, b) =>
    a.pos !== b.pos ? String(a.pos).localeCompare(String(b.pos)) : a.rt - b.rt
  )
}

function buildDocIssueSection(fullInvoices) {
  const summary = buildDocumentIssuedSummary(fullInvoices)
  const doc_det = summary.rows.map((row, idx) => ({
    doc_num: idx + 1,
    docs: [
      {
        num: 1,
        from: row.srFrom,
        to: row.srTo,
        totnum: row.totalNumber,
        cancel: row.cancelled,
        net_issue: Math.max(0, row.totalNumber - row.cancelled),
      },
    ],
  }))
  return { doc_det }
}

function buildDocIssuePortalPayload(fullInvoices, gstin, fp) {
  return {
    gstin,
    fp,
    doc_issue: buildDocIssueSection(fullInvoices),
  }
}

/**
 * Single file: `b2b` + `b2cs` + `hsn` (both B2B/B2C) + `doc_issue` — same shape as full GSTR-1 JSON for offline tool.
 */
export function buildCombinedGstr1PortalPayload(ctx) {
  const { fullInvoices, partyByPid, anchorDateStr, gstin } = ctx
  const list = Array.isArray(fullInvoices) ? fullInvoices : []
  const seller = (gstin || DEFAULT_SELLER_GSTIN).replace(/\s/g, '').toUpperCase()
  const fp = dateToFp(
    anchorDateStr || (list[0] && (list[0].dt ?? list[0].date)) || undefined
  )

  const b2bFull = list.filter((inv) => invoiceIsB2BByParty(inv, partyByPid))
  const b2cFull = list.filter((inv) => !invoiceIsB2BByParty(inv, partyByPid))

  const { b2b } = buildB2bPortalSection(b2bFull, partyByPid, seller)

  return {
    gstin: seller,
    fp,
    b2b,
    b2cs: buildB2csPortalRows(b2cFull, seller),
    hsn: {
      hsn_b2b: ensureHsnRowShape(aggregateHsnRows(b2bFull)),
      hsn_b2c: ensureHsnRowShape(aggregateHsnRows(b2cFull)),
    },
    doc_issue: buildDocIssueSection(list),
  }
}

function ensureHsnRowShape(rows) {
  return rows.map((r) => ({
    num: r.num,
    hsn_sc: r.hsn_sc,
    desc: r.desc ?? '',
    uqc: r.uqc,
    qty: r.qty,
    rt: r.rt,
    txval: r.txval,
    iamt: r.iamt,
    camt: r.camt,
    samt: r.samt,
    csamt: r.csamt ?? 0,
  }))
}

/**
 * @param {'b2b'|'b2c'|'b2b-hsn'|'b2c-hsn'|'doc-summary'} tab
 * @param {{ fullInvoices: object[], partyByPid: Map, anchorDateStr?: string, gstin?: string }} ctx
 */
/** Invoice numbers skipped from `b2b` JSON — party B2B but no valid 15-char GSTIN. */
export function getB2bPortalSkippedInvoices(b2bFull, partyByPid, sellerGstin) {
  const seller = String(sellerGstin || DEFAULT_SELLER_GSTIN).replace(/\s/g, '').toUpperCase()
  return buildB2bPortalSection(b2bFull, partyByPid, seller).skippedNoValidCtin
}

export function buildPortalSlicePayload(tab, ctx) {
  const { fullInvoices, partyByPid, anchorDateStr, gstin } = ctx
  const list = Array.isArray(fullInvoices) ? fullInvoices : []
  const seller = (gstin || DEFAULT_SELLER_GSTIN).replace(/\s/g, '').toUpperCase()
  const fp = dateToFp(
    anchorDateStr || (list[0] && (list[0].dt ?? list[0].date)) || undefined
  )

  const b2bFull = list.filter((inv) => invoiceIsB2BByParty(inv, partyByPid))
  const b2cFull = list.filter((inv) => !invoiceIsB2BByParty(inv, partyByPid))

  switch (tab) {
    case 'b2b': {
      const { b2b } = buildB2bPortalSection(b2bFull, partyByPid, seller)
      return { gstin: seller, fp, b2b }
    }
    case 'b2c':
      return { gstin: seller, fp, b2cs: buildB2csPortalRows(b2cFull, seller) }
    case 'b2b-hsn':
      return {
        gstin: seller,
        fp,
        hsn: { hsn_b2b: ensureHsnRowShape(aggregateHsnRows(b2bFull)) },
      }
    case 'b2c-hsn':
      return {
        gstin: seller,
        fp,
        hsn: { hsn_b2c: ensureHsnRowShape(aggregateHsnRows(b2cFull)) },
      }
    case 'doc-summary':
      return buildDocIssuePortalPayload(list, seller, fp)
    default:
      throw new Error(`Unknown portal slice tab: ${tab}`)
  }
}
