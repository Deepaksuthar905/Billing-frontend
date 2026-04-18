/**
 * INR display. `fractionDigits` optional — default 0 keeps existing screens unchanged.
 * Use `fractionDigits: 2` where rupee paisa should show (e.g. purchase line items).
 */
export function formatCurrency(num, fractionDigits = 0) {
  const n = Number(num)
  if (num == null || Number.isNaN(n)) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(0)
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)
}

/** API date "2025-03-16" → "16 Mar 2025" */
export function formatDate(str) {
  if (!str) return '—'
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return str
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
