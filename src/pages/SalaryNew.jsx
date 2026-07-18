import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  useCreateSalaryPaymentMutation,
  useUpdateSalaryPaymentMutation,
  useGetSalaryPaymentByIdQuery,
  useGetEmployeesQuery,
  useGetPayByListQuery,
} from '../store/api'
import { formatCurrency } from '../utils/format'
import { lastSalaryMonth, encodeDeductionRemarks, parseDeductionBreakdown } from '../utils/salaryDeductions'
import './Salary.css'

const round2 = (n) => Math.round(Number(n) * 100) / 100

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

function dtToYmd(dt) {
  if (!dt) return todayYmd()
  const m = String(dt).match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return todayYmd()
  return d.toISOString().slice(0, 10)
}

function amountStr(v) {
  if (v == null || v === '') return '0'
  return String(Number(v) || 0)
}

export default function SalaryNew() {
  const navigate = useNavigate()
  const location = useLocation()
  const { salid: salidParam } = useParams()
  const paymentFromNav = location.state?.payment ?? null
  const editingSalid = salidParam ? Number(salidParam) : paymentFromNav?.salid ?? paymentFromNav?.id ?? null
  const isEdit = editingSalid != null && !Number.isNaN(Number(editingSalid))
  const hydratedRef = useRef(null)

  const { data: empData, isLoading: empLoading } = useGetEmployeesQuery({ is_active: 1 })
  const { data: payByData } = useGetPayByListQuery()
  const { data: paymentFetched } = useGetSalaryPaymentByIdQuery(editingSalid, {
    skip: !isEdit,
  })
  const [createPayment, { isLoading: isCreating }] = useCreateSalaryPaymentMutation()
  const [updatePayment, { isLoading: isUpdating }] = useUpdateSalaryPaymentMutation()
  const isSaving = isCreating || isUpdating

  const employees = empData?.data ?? []
  const paybyList = payByData?.data ?? []
  const paymentSource = paymentFetched ?? paymentFromNav

  const [empid, setEmpid] = useState('')
  const [salaryMonth, setSalaryMonth] = useState(lastSalaryMonth())
  const [dt, setDt] = useState(todayYmd())
  const [grossAmt, setGrossAmt] = useState('')
  const [incentiveAmt, setIncentiveAmt] = useState('0')
  const [arrearsAmt, setArrearsAmt] = useState('0')
  const [lwpAmt, setLwpAmt] = useState('0')
  const [advanceDed, setAdvanceDed] = useState('0')
  const [otherDed, setOtherDed] = useState('0')
  const [payby, setPayby] = useState('')
  const [refno, setRefno] = useState('')
  const [remarks, setRemarks] = useState('')

  const selectedEmployee = useMemo(
    () => employees.find((e) => String(e.empid ?? e.id) === String(empid)),
    [employees, empid]
  )

  useEffect(() => {
    if (!isEdit || !paymentSource) return
    const key = String(paymentSource.salid ?? paymentSource.id ?? editingSalid)
    if (hydratedRef.current === key) return
    hydratedRef.current = key

    const ded = parseDeductionBreakdown(paymentSource.remarks, paymentSource.deduction_amt)
    setEmpid(String(paymentSource.empid ?? paymentSource.employee?.empid ?? ''))
    setSalaryMonth(paymentSource.salary_month || lastSalaryMonth())
    setDt(dtToYmd(paymentSource.dt))
    setGrossAmt(amountStr(paymentSource.gross_amt))
    setIncentiveAmt(amountStr(paymentSource.incentive_amt))
    setArrearsAmt(amountStr(paymentSource.arrears_amt))
    setLwpAmt(amountStr(ded.lwp))
    setAdvanceDed(amountStr(ded.advance))
    setOtherDed(amountStr(ded.other))
    setPayby(
      paymentSource.payby != null && paymentSource.payby !== ''
        ? String(paymentSource.payby)
        : paymentSource.pay_by?.pbid != null
          ? String(paymentSource.pay_by.pbid)
          : paymentSource.payBy?.pbid != null
            ? String(paymentSource.payBy.pbid)
            : ''
    )
    setRefno(paymentSource.refno ?? '')
    setRemarks(ded.userRemarks || '')
  }, [isEdit, paymentSource, editingSalid])

  useEffect(() => {
    if (isEdit) return
    if (!selectedEmployee) return
    const basic = Number(selectedEmployee.monthly_salary) || 0
    if (basic > 0) setGrossAmt(String(basic))
  }, [selectedEmployee?.empid, isEdit])

  useEffect(() => {
    if (paybyList.length && payby === '') {
      setPayby(String(paybyList[0].pbid ?? paybyList[0].id))
    }
  }, [paybyList, payby])

  const gross = round2(grossAmt)
  const incentive = round2(incentiveAmt)
  const arrears = round2(arrearsAmt)
  const lwp = round2(lwpAmt)
  const advance = round2(advanceDed)
  const other = round2(otherDed)
  const deduction = round2(lwp + advance + other)
  const grossEarnings = round2(gross + incentive + arrears)
  const netAmt = round2(grossEarnings - deduction)

  const handleSave = async (e) => {
    e.preventDefault()
    if (!empid) {
      alert('Please select an employee.')
      return
    }
    if (netAmt < 0) {
      alert('Net payable cannot be negative.')
      return
    }
    const payload = {
      empid: Number(empid),
      salary_month: salaryMonth,
      dt,
      gross_amt: gross,
      incentive_amt: incentive,
      arrears_amt: arrears,
      deduction_amt: deduction,
      net_amt: netAmt,
      payby: payby !== '' ? Number(payby) : undefined,
      refno: refno.trim() || undefined,
      remarks: encodeDeductionRemarks(remarks, lwp, advance, other),
      payment_type: 'salary',
    }
    try {
      if (isEdit) {
        await updatePayment({ salid: Number(editingSalid), ...payload }).unwrap()
      } else {
        await createPayment(payload).unwrap()
      }
      navigate('/salary')
    } catch (err) {
      console.error('Salary payment failed:', err)
      const msg =
        err?.data?.message ||
        (err?.data?.errors ? Object.values(err.data.errors).flat().join(' ') : null) ||
        'Could not save salary payment.'
      alert(msg)
    }
  }

  return (
    <div className="page salary-page">
      <div className="page-header">
        <div className="salary-header-left">
          <Link to="/salary" className="btn btn-secondary btn-sm salary-back-btn">
            <ArrowLeft size={16} />
            Back
          </Link>
          <h1 className="page-title">{isEdit ? 'Edit Salary' : 'Pay Salary'}</h1>
        </div>
      </div>

      <form className="card salary-form-card" onSubmit={handleSave}>
        <div className="salary-form-grid">
          <label className="form-group">
            <span>Employee <span className="required">*</span></span>
            <select className="form-input" value={empid} onChange={(e) => setEmpid(e.target.value)} required disabled={empLoading}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.empid ?? e.id} value={String(e.empid ?? e.id)}>
                  {e.empname}{e.emp_code ? ` (${e.emp_code})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span>Salary Month <span className="required">*</span></span>
            <input type="month" className="form-input" value={salaryMonth} onChange={(e) => setSalaryMonth(e.target.value)} required />
          </label>

          <label className="form-group">
            <span>Pay Date <span className="required">*</span></span>
            <input type="date" className="form-input" value={dt} onChange={(e) => setDt(e.target.value)} required />
          </label>

          <label className="form-group">
            <span>Basic (₹)</span>
            <input type="number" min="0" step="0.01" className="form-input" value={grossAmt} onChange={(e) => setGrossAmt(e.target.value)} />
          </label>

          <label className="form-group">
            <span>Incentive (₹)</span>
            <input type="number" min="0" step="0.01" className="form-input" value={incentiveAmt} onChange={(e) => setIncentiveAmt(e.target.value)} />
          </label>

          <label className="form-group">
            <span>Arrears (₹)</span>
            <input type="number" min="0" step="0.01" className="form-input" value={arrearsAmt} onChange={(e) => setArrearsAmt(e.target.value)} />
          </label>

          <label className="form-group">
            <span>LWP Deduction (₹)</span>
            <input type="number" min="0" step="0.01" className="form-input" value={lwpAmt} onChange={(e) => setLwpAmt(e.target.value)} />
          </label>

          <label className="form-group">
            <span>Advance Deduction (₹)</span>
            <input type="number" min="0" step="0.01" className="form-input" value={advanceDed} onChange={(e) => setAdvanceDed(e.target.value)} />
          </label>

          <label className="form-group">
            <span>Other Deduction (₹)</span>
            <input type="number" min="0" step="0.01" className="form-input" value={otherDed} onChange={(e) => setOtherDed(e.target.value)} />
          </label>

          <label className="form-group">
            <span>Paid Via</span>
            <select className="form-input" value={payby} onChange={(e) => setPayby(e.target.value)}>
              {paybyList.map((p) => (
                <option key={p.pbid ?? p.id} value={String(p.pbid ?? p.id)}>
                  {p.name ?? `PayBy ${p.pbid ?? p.id}`}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span>Reference / UTR</span>
            <input type="text" className="form-input" value={refno} onChange={(e) => setRefno(e.target.value)} placeholder="Cheque no., UTR…" />
          </label>

          <label className="form-group salary-form-grid--full">
            <span>Remarks</span>
            <input type="text" className="form-input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
        </div>

        <div className="salary-summary-bar">
          <div>
            <span className="text-muted">Gross Earnings</span>
            <strong>{formatCurrency(grossEarnings, 2)}</strong>
          </div>
          <div>
            <span className="text-muted">Total Deductions</span>
            <strong>{formatCurrency(deduction, 2)}</strong>
          </div>
          <div className="salary-summary-net">
            <span>Net Payable</span>
            <strong>{formatCurrency(netAmt, 2)}</strong>
          </div>
        </div>

        <div className="salary-form-actions">
          <Link to="/salary" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? 'Saving…' : isEdit ? 'Update Salary' : 'Save & Generate Receipt'}
          </button>
        </div>
      </form>
    </div>
  )
}
