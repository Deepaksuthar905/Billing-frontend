/** Remaining balance from API (`balance`), else fallback to due calculation. */
export function getInvoiceBalance(inv) {
  if (!inv || typeof inv !== 'object') return 0
  const bal = Number(inv.balance)
  if (!Number.isNaN(bal) && bal >= 0) return bal
  return getPendingAmount(inv)
}

/** Outstanding due on an invoice (balance → paylater → pending status). */
export function getPendingAmount(inv) {
  if (!inv || typeof inv !== 'object') return 0
  const bal = Number(inv.balance)
  if (!Number.isNaN(bal) && bal > 0.005) return bal
  const pl = Number(inv.paylater)
  if (!Number.isNaN(pl) && pl > 0.005) return pl
  const st = String(inv.status || '').toLowerCase()
  if (st === 'pending' || st === 'unpaid' || st === 'overdue') {
    return Number(inv.payment ?? inv.amount) || 0
  }
  return 0
}

export function resolveInvoiceApiId(inv) {
  return inv?.invid ?? inv?.inv_id ?? inv?.id ?? null
}

export function resolvePartyId(inv) {
  const pid = inv?.pid ?? inv?.party_id ?? inv?.customer_id
  return pid != null && pid !== '' ? Number(pid) : null
}

export function invoiceDisplayNo(inv) {
  return String(inv?.inv_no ?? inv?.invoice_no ?? inv?.invid ?? inv?.id ?? '—')
}
