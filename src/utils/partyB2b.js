/** Party master helpers (still used for GSTIN display merge). Party B2B flag kept for other UI. */

export function partyIsGstRegisteredB2B(party) {
  if (!party || typeof party !== 'object') return false
  const g = String(party.gst_no ?? '').trim()
  if (!g) return false
  const reg = party.gst_reg
  if (reg === true) return true
  return Number(reg) === 1
}

export function buildPartyMapByPid(customers) {
  const m = new Map()
  for (const c of customers || []) {
    const id = c.pid ?? c.id
    if (id != null) m.set(String(id), c)
  }
  return m
}

/**
 * B2B = invoice itself has buyer GSTIN (from sync gstno / gst_no).
 * Party master is NOT used to decide B2B vs B2C anymore.
 */
export function invoiceHasGstNo(inv) {
  if (!inv || typeof inv !== 'object') return false
  const g = String(
    inv.gstno ?? inv.gst_no ?? inv.gstin ?? inv.customer_gstin ?? inv.buyer_gstin ?? ''
  )
    .replace(/\s/g, '')
    .trim()
  return g.length > 0
}

/** @deprecated name kept for call sites — now invoice.gstno based, not party. */
export function invoiceIsB2BByParty(inv, _partyByPid) {
  return invoiceHasGstNo(inv)
}

/** Merge customer master GSTIN onto invoice when detail lacks GST (display only). */
export function mergePartyGstOntoInvoices(rows, customersList) {
  const byPid = buildPartyMapByPid(customersList)
  return rows.map((inv) => {
    if (invoiceHasGstNo(inv)) return inv
    const pid = inv.pid ?? inv.customer_id ?? inv.party_id
    if (pid == null) return inv
    const c = byPid.get(String(pid))
    if (!c) return inv
    const partyGst = String(c.gst_no ?? c.gstin ?? '').trim()
    if (!partyGst) return inv
    return { ...inv, gst_no: inv.gst_no || inv.gstno || partyGst, gstno: inv.gstno || partyGst }
  })
}
