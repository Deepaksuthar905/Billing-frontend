/**
 * Purchase register / GSTR-2B style inward supply rows.
 * API often sends `gst` as total tax amount (not %); list may omit cgst/sgst/igst.
 */

import { gstPlaceOfSupplyLabel, stateToPosCode } from './gstStateNames'

export const DEFAULT_BUSINESS_STATE =
  import.meta.env.VITE_COMPANY_STATE || 'Rajasthan'

function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100
}

const GST_RATE_SLABS = [0, 5, 12, 18, 28]

function snapGstRatePercent(derived) {
  if (!Number.isFinite(derived) || derived <= 0) return 0
  let best = 18
  let minD = Infinity
  for (const s of GST_RATE_SLABS) {
    const d = Math.abs(derived - s)
    if (d < minD) {
      minD = d
      best = s
    }
  }
  return best
}

/** True when `gst` field is total tax (Purchase save sends gst = cgst+sgst+igst). */
function gstFieldIsTaxAmount(po, totalTaxFromSplit) {
  const g = Number(po.gst)
  if (Number.isNaN(g) || g <= 0) return false
  if (g > 28) return true
  if (totalTaxFromSplit > 0.005 && Math.abs(g - totalTaxFromSplit) < 1) return true
  return false
}

function pickPurchaseGstRatePercent(po, totalTax, taxable) {
  const rateKeys = ['gst_rate', 'gst_percent', 'gstper', 'gstpct', 'tax_rate', 'taxRate']
  for (const k of rateKeys) {
    const v = po[k]
    if (v != null && v !== '') {
      const n = Number(v)
      if (!Number.isNaN(n) && n > 0 && n <= 28) return round2(n)
    }
  }
  const g = Number(po.gst)
  if (!gstFieldIsTaxAmount(po, totalTax) && !Number.isNaN(g) && g > 0 && g <= 28) {
    return round2(g)
  }
  if (taxable > 0 && totalTax > 0.005) {
    return snapGstRatePercent((totalTax / taxable) * 100)
  }
  return 0
}

function isIntraStateSupply(po, businessState = DEFAULT_BUSINESS_STATE) {
  const posName = String(po.state ?? po.place_of_supply ?? po.state_name ?? '').trim()
  if (!posName) return true
  const biz = String(businessState).trim().toLowerCase()
  const pos = posName.toLowerCase()
  if (pos === biz) return true
  const code = stateToPosCode(posName)
  const bizCode = stateToPosCode(businessState)
  if (code && bizCode && code === bizCode) return true
  return pos.includes(biz) || biz.includes(pos)
}

function derivePurchaseTaxSplit(po, businessState = DEFAULT_BUSINESS_STATE) {
  let cgst = round2(Number(po.cgst) || 0)
  let sgst = round2(Number(po.sgst) || 0)
  let igst = round2(Number(po.igst) || 0)
  let totalTax = round2(cgst + sgst + igst)

  const billValue = round2(Number(po.amount) || Number(po.total) || Number(po.payment) || 0)
  const taxableFromApi = Number(po.taxable_amt)
  let taxable = round2(
    !Number.isNaN(taxableFromApi) && taxableFromApi > 0
      ? taxableFromApi
      : billValue - totalTax > 0.005
        ? billValue - totalTax
        : billValue
  )

  if (totalTax < 0.005 && billValue > taxable + 0.005) {
    totalTax = round2(billValue - taxable)
  }
  if (totalTax < 0.005 && gstFieldIsTaxAmount(po, 0)) {
    totalTax = round2(Number(po.gst))
  }

  if (cgst + sgst + igst < 0.005 && totalTax > 0.005) {
    if (isIntraStateSupply(po, businessState)) {
      const half = round2(totalTax / 2)
      cgst = half
      sgst = round2(totalTax - half)
      igst = 0
    } else {
      igst = totalTax
      cgst = 0
      sgst = 0
    }
  }

  return { cgst, sgst, igst, totalTax, billValue, taxable }
}

function resolveVendorGstin(po, partyByPid) {
  const fromPo = String(
    po.vendor_gstin ?? po.gstin ?? po.gst_no ?? po.gstin_no ?? ''
  ).trim()
  if (fromPo && fromPo !== '0' && fromPo.length >= 10) return fromPo

  const pid = po.prhid ?? po.vendor_id ?? po.party_id
  if (pid == null || !partyByPid) return ''
  const party = partyByPid.get(String(pid))
  const g = String(party?.gst_no ?? party?.gstin ?? '').trim()
  return g && g !== '0' ? g : ''
}

/**
 * @param {object[]} purchases
 * @param {Map<string, object>} [partyByPid] vendors from `/customers?prtytyp=1`
 * @param {string} [businessState]
 */
export function buildPurchaseRegisterRows(
  purchases,
  partyByPid,
  businessState = DEFAULT_BUSINESS_STATE
) {
  return (purchases || []).map((po) => {
    const { cgst, sgst, igst, billValue, taxable } = derivePurchaseTaxSplit(
      po,
      businessState
    )
    const totalTax = round2(cgst + sgst + igst)
    const taxRate = pickPurchaseGstRatePercent(po, totalTax, taxable)
    const stateRaw = po.state ?? po.place_of_supply ?? po.state_name ?? po.pos ?? ''

    return {
      gstin: resolveVendorGstin(po, partyByPid),
      partyName:
        po.vendor ?? po.vendor_name ?? po.partyname ?? po.billing_name ?? '—',
      invNo: po.p_inv_no ?? po.inv_no ?? po.po_no ?? po.bill_no ?? po.id,
      date: po.dt ?? po.date,
      value: billValue,
      taxRate,
      taxableValue: taxable,
      igst,
      cgst,
      sgst,
      cess: round2(Number(po.cess) || 0),
      placeOfSupply: gstPlaceOfSupplyLabel(stateRaw),
      posCode: stateToPosCode(stateRaw),
      reverseCharge: po.rchrg ?? po.reverse_charge ?? 'N',
      invoiceType: po.inv_typ ?? 'R',
    }
  })
}

export function formatRegisterGstin(v) {
  const g = String(v ?? '').trim()
  if (!g || g === '0') return '—'
  return g
}

/** GSTR-3B ITC block totals — same tax derivation as purchase register rows. */
export function summarizePurchaseItcTotals(purchases, businessState = DEFAULT_BUSINESS_STATE) {
  let taxable = 0
  let igst = 0
  let cgst = 0
  let sgst = 0
  let gross = 0
  for (const po of purchases || []) {
    const row = derivePurchaseTaxSplit(po, businessState)
    taxable += row.taxable
    igst += row.igst
    cgst += row.cgst
    sgst += row.sgst
    gross += row.billValue
  }
  return {
    taxable: round2(taxable),
    igst: round2(igst),
    cgst: round2(cgst),
    sgst: round2(sgst),
    gross: round2(gross),
    totalTax: round2(igst + cgst + sgst),
  }
}
