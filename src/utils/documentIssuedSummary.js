/**
 * GSTR-1 style “Summary of documents issued during the tax period”.
 * Groups sales documents by nature, serial range, counts, cancelled.
 */

export const DOC_OUTWARD = 'Invoices for outward supply'
export const DOC_CREDIT_NOTE = 'Credit Note'
export const DOC_DEBIT_NOTE = 'Debit Note'

function invNo(inv) {
  return String(inv.inv_no ?? inv.invoice_no ?? inv.id ?? '').trim()
}

function isCancelled(inv) {
  const st = String(inv.status ?? '').toLowerCase()
  if (st === 'cancelled' || st === 'canceled') return true
  if (inv.cancelled === true || inv.is_cancelled === true || inv.cancel === true) return true
  const n = Number(inv.cancelled ?? inv.is_cancelled ?? inv.cancel ?? 0)
  return n === 1
}

/**
 * Best-effort document type from API fields + fallbacks (negative totals, invoice no. prefix).
 */
export function classifyDocumentNature(inv) {
  const raw =
    inv.doc_type ??
    inv.document_type ??
    inv.inv_type ??
    inv.note_type ??
    inv.type ??
    inv.voucher_type ??
    inv.vch_type ??
    ''
  const d = String(raw).toLowerCase().trim()
  if (d.includes('credit') || d === 'cn' || d === 'credit_note') return DOC_CREDIT_NOTE
  if (d.includes('debit') || d === 'dn' || d === 'debit_note') return DOC_DEBIT_NOTE

  const code = Number(inv.doc_typ ?? inv.doc_type_code ?? NaN)
  if (!Number.isNaN(code)) {
    if (code === 2 || code === 5) return DOC_CREDIT_NOTE
    if (code === 3 || code === 6) return DOC_DEBIT_NOTE
  }

  const amt = Number(inv.payment ?? inv.amount ?? 0)
  const no = invNo(inv).toUpperCase()
  if (amt < 0 || /^CN[-\s]?/i.test(no) || no.includes('CRN') || no.includes('CREDIT')) {
    return DOC_CREDIT_NOTE
  }
  if (/^DN[-\s]?/i.test(no) || no.includes('DEBIT')) return DOC_DEBIT_NOTE

  return DOC_OUTWARD
}

function trailingNumber(str) {
  const m = String(str ?? '').match(/(\d+)\s*$/)
  if (!m) return null
  try {
    return BigInt(m[1])
  } catch {
    return null
  }
}

function compareInvNo(a, b) {
  const na = trailingNumber(a)
  const nb = trailingNumber(b)
  if (na != null && nb != null) {
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function serialRange(items) {
  const nos = items.map((x) => x.no).filter(Boolean)
  if (nos.length === 0) return { from: '—', to: '—' }
  const nums = nos.map(trailingNumber)
  const allNumeric = nums.every((x) => x != null)
  if (allNumeric) {
    let minN = nums[0]
    let maxN = nums[0]
    for (const x of nums) {
      if (x < minN) minN = x
      if (x > maxN) maxN = x
    }
    return { from: String(minN), to: String(maxN) }
  }
  const sorted = [...nos].sort(compareInvNo)
  return { from: sorted[0], to: sorted[sorted.length - 1] }
}

/**
 * @param {object[]} invoices – already filtered by date (same list as GSTR-1).
 * @returns {{ rows: Array<{ nature: string, srFrom: string, srTo: string, totalNumber: number, cancelled: number }>, grandTotal: number, grandCancelled: number }}
 */
export function buildDocumentIssuedSummary(invoices) {
  const list = Array.isArray(invoices) ? invoices : []
  const byNature = new Map()

  for (const inv of list) {
    const nature = classifyDocumentNature(inv)
    const cancelled = isCancelled(inv)
    const no = invNo(inv)
    if (!byNature.has(nature)) byNature.set(nature, [])
    byNature.get(nature).push({ no, cancelled })
  }

  const rows = []
  for (const [nature, items] of byNature) {
    const { from, to } = serialRange(items)
    const totalNumber = items.length
    const cancelled = items.filter((x) => x.cancelled).length
    rows.push({
      nature,
      srFrom: from,
      srTo: to,
      totalNumber,
      cancelled,
    })
  }

  rows.sort((a, b) => a.nature.localeCompare(b.nature))

  const grandTotal = rows.reduce((s, r) => s + r.totalNumber, 0)
  const grandCancelled = rows.reduce((s, r) => s + r.cancelled, 0)

  return { rows, grandTotal, grandCancelled }
}
