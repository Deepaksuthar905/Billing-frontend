import { useRef } from 'react'
import { X, Download, Banknote } from 'lucide-react'
import html2pdf from 'html2pdf.js'
import { useGetInvoiceByIdQuery } from '../store/api'
import { getPendingAmount } from '../utils/invoicePayment'
import './InvoicePreviewModal.css'

/* ── Company Details (change here when logo is ready) ── */
const COMPANY = {
  name: 'Harsh Technology',
  address: '171/219 Parashavnath Nagar Bhadwasiya Road Jodhpur',
  phone: '8386011123',
  email: 'info@harshtechnology.com',
  gstin: '08DTGPS6229M2ZW',
  state: '08-Rajasthan',
  logo: `${import.meta.env.BASE_URL}logo.png`,
  bankName: 'PUNJAB AND SIND BANK, CHOPASNI ROAD, JODHPUR',
  bankAccount: '02211100004426',
  ifsc: 'PSIB0000221',
  accountHolder: 'HARSH TECHNOLOGY',
  terms: 'Thanks for doing business with us!',
}

/* ── Number → Indian words ── */
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function numToWords(n) {
  n = Math.round(Number(n) || 0)
  if (n === 0) return 'Zero'
  if (n < 0) return 'Minus ' + numToWords(-n)
  let words = ''
  if (n >= 10000000) { words += numToWords(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000 }
  if (n >= 100000)   { words += numToWords(Math.floor(n / 100000)) + ' Lakh '; n %= 100000 }
  if (n >= 1000)     { words += numToWords(Math.floor(n / 1000)) + ' Thousand '; n %= 1000 }
  if (n >= 100)      { words += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100 }
  if (n >= 20)       { words += tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''); n = 0 }
  else if (n > 0)    { words += ones[n] }
  return words.trim()
}

function amountInWords(amt) {
  const n = Math.round(Number(amt) || 0)
  return numToWords(n) + ' Rupees only'
}

/* ── Safe number ── */
const n2 = (v) => Number(v || 0).toFixed(2)
const fmt = (v) => `₹ ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function InvoicePreviewModal({ invId, onClose, onRecordPayment }) {
  const printRef = useRef(null)
  const { data: raw, isLoading, isError } = useGetInvoiceByIdQuery(invId, { skip: !invId })

  /* Normalise various API shapes */
  const inv = raw?.data ?? raw ?? {}
  const items = Array.isArray(inv.items)
    ? inv.items
    : Array.isArray(inv.line_items)
      ? inv.line_items
      : []

  const invNo       = inv.inv_no ?? inv.invoice_no ?? inv.id ?? '—'
  const invDate     = inv.dt ?? inv.date ?? '—'
  const customer    = inv.customer ?? inv.customer_name ?? inv.partyname ?? inv.billing_name ?? '—'
  const custAddress = inv.billing_address ?? inv.customer_address ?? inv.address ?? ''
  const custPhone   = inv.customer_phone ?? inv.phone ?? inv.contact ?? ''
  const custGstin   = inv.customer_gstin ?? inv.gstin ?? ''
  const pos         = inv.place_of_supply ?? inv.state ?? inv.state_of_supply ?? ''
  const cgst        = Number(inv.cgst || 0)
  const sgst        = Number(inv.sgst || 0)
  const igst        = Number(inv.igst || 0)
  const totalTax    = cgst + sgst + igst
  const totalAmt    = Number(inv.amount ?? inv.payment ?? 0)
  const taxableAmt  = totalAmt - totalTax > 0 ? totalAmt - totalTax : totalAmt
  const hsnCode     = items[0]?.hsn_code ?? items[0]?.hsn ?? inv.hsn ?? '998319'
  const pendingDue  = getPendingAmount(inv)
  const received    = Math.max(0, totalAmt - pendingDue)
  const balance     = pendingDue > 0.005 ? pendingDue : Math.max(0, totalAmt - received)
  const isIgst      = igst > 0

  const handlePrint = () => {
    const el = printRef.current
    if (!el) return
    const fileName = `Invoice_${invNo}_${invDate}.pdf`.replace(/[/\\:*?"<>|]/g, '-')
    html2pdf()
      .set({
        margin: [10, 12, 10, 12],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(el)
      .save()
  }

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      {/* Action bar — hidden during print */}
      <div className="inv-modal-actions no-print" onClick={(e) => e.stopPropagation()}>
        {pendingDue > 0.005 && onRecordPayment && (
          <button
            type="button"
            className="inv-action-btn inv-action-btn--pay"
            onClick={() => onRecordPayment({ ...inv, id: inv.invid ?? inv.id ?? invId })}
          >
            <Banknote size={16} />
            Record Pay In
          </button>
        )}
        <button type="button" className="inv-action-btn inv-action-btn--pdf" onClick={handlePrint}>
          <Download size={16} />
          Download PDF
        </button>
        <button type="button" className="inv-action-btn inv-action-btn--close" onClick={onClose}>
          <X size={16} />
          Close
        </button>
      </div>

      <div
        className="inv-modal-sheet"
        ref={printRef}
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading && <div className="inv-loading">Loading invoice…</div>}
        {isError   && <div className="inv-loading">Could not load invoice details.</div>}

        {!isLoading && !isError && (
          <>
            {/* ── Header ── */}
            <div className="inv-header">
              <div className="inv-company-block">
                <div className="inv-logo-wrap">
                  <img src={COMPANY.logo} alt="Logo" className="inv-logo-img" />
                </div>
                <div className="inv-company-info">
                  <div className="inv-company-name">{COMPANY.name}</div>
                  <div className="inv-company-addr">{COMPANY.address}</div>
                  <div className="inv-company-meta">
                    <span>Phone: {COMPANY.phone}</span>
                  </div>
                  <div className="inv-company-meta">
                    <span>GSTIN: {COMPANY.gstin}</span>
                  </div>
                </div>
              </div>
              <div className="inv-company-right">
                <div><span className="inv-meta-label">Email: </span>{COMPANY.email}</div>
                <div><span className="inv-meta-label">State: </span>{COMPANY.state}</div>
              </div>
            </div>

            <div className="inv-title-bar">Tax Invoice</div>

            {/* ── Bill To + Invoice Details ── */}
            <div className="inv-parties-row">
              <div className="inv-bill-to">
                <div className="inv-section-label">Bill To:</div>
                <div className="inv-party-name">{customer}</div>
                {custAddress && <div className="inv-party-detail">{custAddress}</div>}
                {custPhone   && <div className="inv-party-detail">Contact No: {custPhone}</div>}
                {custGstin   && <div className="inv-party-detail">GSTIN: {custGstin}</div>}
                {pos         && <div className="inv-party-detail">State: {pos}</div>}
              </div>
              <div className="inv-details-box">
                <div className="inv-section-label">Invoice Details:</div>
                <table className="inv-details-table">
                  <tbody>
                    <tr><td>No:</td><td><strong>{invNo}</strong></td></tr>
                    <tr><td>Date:</td><td>{invDate}</td></tr>
                    <tr><td>Place Of Supply:</td><td>{pos || '—'}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Items Table ── */}
            <table className="inv-items-table">
              <thead>
                <tr>
                  <th className="inv-col-sno">S no.</th>
                  <th className="inv-col-item">Item name</th>
                  <th className="inv-col-hsn">HSN / SAC</th>
                  <th className="inv-col-qty">Quantity</th>
                  <th className="inv-col-price">Price / Unit(₹)</th>
                  <th className="inv-col-gst">GST(₹)</th>
                  <th className="inv-col-amt">Amount(₹)</th>
                </tr>
              </thead>
              <tbody>
                {items.length > 0
                  ? items.map((item, idx) => {
                      const itemAmt  = Number(item.amount ?? item.total ?? 0)
                      const itemTax  = Number(item.tax_amt ?? item.gst_amt ?? item.taxAmt ?? 0)
                      const itemQty  = Number(item.qty ?? item.quantity ?? 1)
                      const itemRate = Number(item.price ?? item.rate ?? item.unit_price ?? 0)
                      const itemHsn  = item.hsn_code ?? item.hsn ?? item.hsnCode ?? '998319'
                      const itemGstPct = Number(item.gst_pct ?? item.tax_pct ?? item.taxPct ?? 0)
                      return (
                        <tr key={idx}>
                          <td className="text-center">{idx + 1}</td>
                          <td>
                            <div className="inv-item-name">{item.item ?? item.item_name ?? item.name ?? ''}</div>
                            {item.description && <div className="inv-item-desc">{item.description}</div>}
                            {item.item_code && <div className="inv-item-desc">({item.item_code})</div>}
                          </td>
                          <td className="text-center">{itemHsn || '—'}</td>
                          <td className="text-center">{itemQty}</td>
                          <td className="text-right">₹ {n2(itemRate)}</td>
                          <td className="text-right">
                            ₹ {n2(itemTax)}{itemGstPct ? ` (${itemGstPct}%)` : ''}
                          </td>
                          <td className="text-right">₹ {n2(itemAmt)}</td>
                        </tr>
                      )
                    })
                  : (
                    /* Fallback: no line items from API, show single row summary */
                    <tr>
                      <td className="text-center">1</td>
                      <td>{inv.item_name ?? inv.item ?? inv.description ?? '—'}</td>
                      <td className="text-center">{hsnCode || '—'}</td>
                      <td className="text-center">1</td>
                      <td className="text-right">{fmt(taxableAmt)}</td>
                      <td className="text-right">{fmt(totalTax)}{inv.gst ? ` (${inv.gst}%)` : ''}</td>
                      <td className="text-right">{fmt(totalAmt)}</td>
                    </tr>
                  )
                }
                {/* Total row */}
                <tr className="inv-items-total">
                  <td></td>
                  <td><strong>Total</strong></td>
                  <td></td>
                  <td className="text-center">
                    {items.length > 0
                      ? items.reduce((s, i) => s + Number(i.qty ?? i.quantity ?? 1), 0)
                      : 1}
                  </td>
                  <td></td>
                  <td className="text-right"><strong>₹ {n2(totalTax)}</strong></td>
                  <td className="text-right"><strong>₹ {n2(totalAmt)}</strong></td>
                </tr>
              </tbody>
            </table>

            {/* ── Bottom Section: Tax Summary + Totals ── */}
            <div className="inv-bottom-row">
              {/* Tax Summary */}
              <div className="inv-tax-summary">
                <div className="inv-section-label">Tax Summary:</div>
                <table className="inv-tax-table">
                  <thead>
                    <tr>
                      <th>HSN / SAC</th>
                      <th>Taxable amount (₹)</th>
                      {isIgst ? (
                        <>
                          <th>IGST Rate (%)</th>
                          <th>IGST Amt (₹)</th>
                        </>
                      ) : (
                        <>
                          <th>CGST Rate (%)</th>
                          <th>CGST Amt (₹)</th>
                          <th>SGST Rate (%)</th>
                          <th>SGST Amt (₹)</th>
                        </>
                      )}
                      <th>Total Tax (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{hsnCode || '—'}</td>
                      <td className="text-right">{n2(taxableAmt)}</td>
                      {isIgst ? (
                        <>
                          <td className="text-center">18%</td>
                          <td className="text-right">{n2(igst)}</td>
                        </>
                      ) : (
                        <>
                          <td className="text-center">9%</td>
                          <td className="text-right">{n2(cgst)}</td>
                          <td className="text-center">9%</td>
                          <td className="text-right">{n2(sgst)}</td>
                        </>
                      )}
                      <td className="text-right">{n2(totalTax)}</td>
                    </tr>
                    <tr className="inv-tax-total">
                      <td><strong>TOTAL</strong></td>
                      <td className="text-right"><strong>{n2(taxableAmt)}</strong></td>
                      {isIgst ? (
                        <>
                          <td></td>
                          <td className="text-right"><strong>{n2(igst)}</strong></td>
                        </>
                      ) : (
                        <>
                          <td></td>
                          <td className="text-right"><strong>{n2(cgst)}</strong></td>
                          <td></td>
                          <td className="text-right"><strong>{n2(sgst)}</strong></td>
                        </>
                      )}
                      <td className="text-right"><strong>{n2(totalTax)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Totals box */}
              <div className="inv-totals-box">
                <div className="inv-totals-row">
                  <span>Sub Total</span>
                  <span>{fmt(totalAmt)}</span>
                </div>
                <div className="inv-totals-row inv-totals-row--total">
                  <span>Total</span>
                  <span>{fmt(totalAmt)}</span>
                </div>
                <div className="inv-totals-words">
                  <div className="inv-totals-words-label">Invoice Amount in Words:</div>
                  <div className="inv-totals-words-val">{amountInWords(totalAmt)}</div>
                </div>
                <div className="inv-totals-row">
                  <span>Received</span>
                  <span>{fmt(received)}</span>
                </div>
                <div className="inv-totals-row">
                  <span>Balance</span>
                  <span>{fmt(balance)}</span>
                </div>
              </div>
            </div>

            {/* ── Terms & Bank ── */}
            <div className="inv-footer-row">
              <div className="inv-footer-left">
                {COMPANY.terms && (
                  <div className="inv-terms">
                    <div className="inv-section-label">Terms &amp; Conditions:</div>
                    <div className="inv-terms-text">{inv.terms ?? COMPANY.terms}</div>
                  </div>
                )}
                <div className="inv-bank">
                  <div className="inv-section-label">Bank Details:</div>
                  <div>Name : {COMPANY.bankName}</div>
                  <div>Account No. : {COMPANY.bankAccount}</div>
                  <div>IFSC Code : {COMPANY.ifsc}</div>
                  <div>Account holder's name : {COMPANY.accountHolder}</div>
                </div>
              </div>
              <div className="inv-signature">
                <div className="inv-section-label">For {COMPANY.name}:</div>
                <div className="inv-sig-space"></div>
                <div className="inv-sig-label">Authorised Signatory</div>
                <div className="inv-sig-label inv-sig-proprietor">Proprietor</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
