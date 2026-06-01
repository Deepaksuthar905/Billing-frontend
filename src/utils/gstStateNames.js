/** GST state / UT codes (NIC) → display name */
export const GST_STATE_CODE_TO_NAME = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
}

const NAME_TO_CODE = Object.fromEntries(
  Object.entries(GST_STATE_CODE_TO_NAME).map(([code, name]) => [
    name.toLowerCase().replace(/\s+/g, ' ').trim(),
    code,
  ])
)

/** 2-digit POS from state name, `08`, or `08-Rajasthan`. */
export function stateToPosCode(stateRaw) {
  const s = String(stateRaw ?? '').trim()
  if (!s || s === '0') return ''
  if (/^\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{2})[-\s]/i)
  if (m) return m[1]
  const key = s.toLowerCase()
  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key]
  for (const [name, code] of Object.entries(NAME_TO_CODE)) {
    if (key.includes(name) || name.includes(key)) return code
  }
  return ''
}

export function gstPlaceOfSupplyLabel(stateRaw) {
  const code = stateToPosCode(stateRaw)
  if (!code) return stateRaw && String(stateRaw) !== '0' ? String(stateRaw) : '—'
  const name = GST_STATE_CODE_TO_NAME[code] || String(stateRaw)
  return `${code}-${name}`
}
