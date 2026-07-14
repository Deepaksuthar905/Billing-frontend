const DED_META_RE = /__ded__:([\d.]+),([\d.]+),([\d.]+)/

/** Encode LWP / advance / other into remarks for PDF breakdown on list. */
export function encodeDeductionRemarks(userRemarks, lwp, advance, other) {
  const meta = `__ded__:${Number(lwp) || 0},${Number(advance) || 0},${Number(other) || 0}`
  const text = (userRemarks || '').trim()
  return text ? `${text} ${meta}` : meta
}

/** Parse deduction breakdown from remarks; falls back to all-in-other if missing. */
export function parseDeductionBreakdown(remarks, totalDeduction = 0) {
  const m = String(remarks || '').match(DED_META_RE)
  if (m) {
    return {
      lwp: Number(m[1]) || 0,
      advance: Number(m[2]) || 0,
      other: Number(m[3]) || 0,
      userRemarks: String(remarks).replace(DED_META_RE, '').trim(),
    }
  }
  const total = Number(totalDeduction) || 0
  return { lwp: 0, advance: 0, other: total, userRemarks: String(remarks || '').trim() }
}

export function formatSalaryMonth(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || '—'
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  if (Number.isNaN(d.getTime())) return ym
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export function currentSalaryMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
