import { useRef } from 'react'
import { X, Download } from 'lucide-react'
import html2pdf from 'html2pdf.js'
import { formatDate } from '../utils/format'
import { formatSalaryMonth, parseDeductionBreakdown } from '../utils/salaryDeductions'
import './SalaryReceiptModal.css'

const COMPANY = {
  name: 'HARSH TECHNOLOGY',
  gstin: '08DTGPS6229M2ZW',
  website: 'www.harshtechnology.com',
  phone: '+91-93511-71577',
  email: 'info@harshtechnology.com',
  address: 'BAYASA KI BORDI, MATA KA THAN, JODHPUR',
  logo: `${import.meta.env.BASE_URL}logo.png`,
}

function fmtAmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function receiptDate() {
  return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function SalaryReceiptModal({ payment, onClose }) {
  const printRef = useRef(null)

  const emp = payment?.employee ?? {}
  const empName = emp.empname ?? payment?.empname ?? '—'
  const empCode = emp.emp_code ?? '—'
  const payPeriod = formatSalaryMonth(payment?.salary_month)
  const payDate = formatDate(payment?.dt)
  const gross = Number(payment?.gross_amt) || 0
  const incentive = Number(payment?.incentive_amt) || 0
  const arrears = Number(payment?.arrears_amt) || 0
  const grossEarnings = gross + incentive + arrears
  const totalDed = Number(payment?.deduction_amt) || 0
  const net = Number(payment?.net_amt) || 0
  const { lwp, advance, other } = parseDeductionBreakdown(payment?.remarks, totalDed)
  const receiptNo = payment?.receipt_no ?? '—'

  const handlePrint = () => {
    const el = printRef.current
    if (!el) return
    const safeName = String(empName).replace(/[/\\:*?"<>|]/g, '-')
    const fileName = `Salary_${receiptNo}_${safeName}.pdf`
    html2pdf()
      .set({
        margin: 0,
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, width: 794, height: 1123 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] },
      })
      .from(el)
      .save()
  }

  return (
    <div className="sal-receipt-overlay" onClick={onClose}>
      <div className="sal-receipt-actions no-print" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sal-action-btn sal-action-btn--pdf" onClick={handlePrint}>
          <Download size={16} />
          Download PDF
        </button>
        <button type="button" className="sal-action-btn sal-action-btn--close" onClick={onClose}>
          <X size={16} />
          Close
        </button>
      </div>

      <div className="sal-receipt-sheet" ref={printRef} onClick={(e) => e.stopPropagation()}>
        <div className="sal-receipt-body">
          <header className="sal-receipt-header">
          <div className="sal-receipt-brand">
            <img src={COMPANY.logo} alt="" className="sal-receipt-logo" />
            <h1 className="sal-receipt-company">{COMPANY.name}</h1>
          </div>
          <div className="sal-receipt-meta">
            <div><strong>GSTIN:</strong> {COMPANY.gstin}</div>
            <div>{receiptDate()}</div>
          </div>
        </header>

        <hr className="sal-receipt-rule" />

        <section className="sal-receipt-info">
          <div className="sal-info-row"><span>Employee Name</span><strong>{empName}</strong></div>
          <div className="sal-info-row"><span>Employee Id</span><strong>{empCode}</strong></div>
          <div className="sal-info-row"><span>Pay Period</span><strong>{payPeriod}</strong></div>
          <div className="sal-info-row"><span>Pay Date</span><strong>{payDate}</strong></div>
        </section>

        <div className="sal-receipt-cols">
          <table className="sal-receipt-table">
            <thead>
              <tr>
                <th colSpan={2}>EARNINGS</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Basic</td><td className="sal-num">{fmtAmt(gross)}</td></tr>
              <tr><td>Incentive</td><td className="sal-num">{fmtAmt(incentive)}</td></tr>
              {arrears > 0 && <tr><td>Arrears</td><td className="sal-num">{fmtAmt(arrears)}</td></tr>}
              <tr className="sal-total-row">
                <td><strong>Gross Earnings</strong></td>
                <td className="sal-num"><strong>{fmtAmt(grossEarnings)}</strong></td>
              </tr>
            </tbody>
          </table>

          <table className="sal-receipt-table">
            <thead>
              <tr>
                <th colSpan={2}>DEDUCTIONS</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>LWP</td><td className="sal-num">{fmtAmt(lwp)}</td></tr>
              <tr><td>ADV DEL</td><td className="sal-num">{fmtAmt(advance)}</td></tr>
              <tr><td>OTHER DED</td><td className="sal-num">{fmtAmt(other)}</td></tr>
              <tr className="sal-total-row">
                <td><strong>Total Deductions</strong></td>
                <td className="sal-num"><strong>{fmtAmt(totalDed)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="sal-net-payable">
          <div className="sal-net-label">
            <strong>TOTAL NET PAYABLE</strong>
            <span className="sal-net-hint">Gross Earnings − Total Deductions</span>
          </div>
          <div className="sal-net-amount">RS {fmtAmt(net)}</div>
        </div>

        <div className="sal-receipt-spacer" aria-hidden />
        </div>

        <div className="sal-receipt-watermark" aria-hidden>
          <img src={COMPANY.logo} alt="" />
        </div>

        <footer className="sal-receipt-footer">
          <div className="sal-footer-website">{COMPANY.website}</div>
          <div className="sal-footer-bar">
            <span>{COMPANY.phone}</span>
            <span>{COMPANY.email}</span>
            <span>{COMPANY.address}</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
