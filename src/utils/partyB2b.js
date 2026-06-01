/** Party master: B2B when gst_no non-empty and gst_reg = 1 (billing DB party table). */

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

/** Uses invoice pid / customer_id / party_id → party map. */
export function invoiceIsB2BByParty(inv, partyByPid) {
  const pid = inv.pid ?? inv.customer_id ?? inv.party_id
  if (pid == null) return false
  return partyIsGstRegisteredB2B(partyByPid.get(String(pid)))
}

/** Merge customer master GSTIN onto invoice when detail lacks 15-char GST. */
export function mergePartyGstOntoInvoices(rows, customersList) {
  const byPid = buildPartyMapByPid(customersList)
  return rows.map((inv) => {
    const pid = inv.pid ?? inv.customer_id ?? inv.party_id
    if (pid == null) return inv
    const c = byPid.get(String(pid))
    if (!c) return inv
    const partyGst = String(c.gst_no ?? c.gstin ?? '').trim()
    if (!partyGst) return inv
    if (String(inv.gst_no ?? inv.customer_gstin ?? inv.buyer_gstin ?? '').replace(/\s/g, '').length >= 15) {
      return inv
    }
    return { ...inv, gst_no: inv.gst_no || partyGst }
  })
}
