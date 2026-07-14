import { useState } from 'react'
import { X } from 'lucide-react'
import { useCreateEmployeeMutation } from '../store/api'
import { INDIA_STATES } from '../utils/indiaStates'
import '../pages/Salary.css'

const initialForm = {
  emp_code: '',
  empname: '',
  mobno: '',
  designation: '',
  joining_date: '',
  monthly_salary: '',
  bank_name: '',
  bank_account: '',
  ifsc: '',
  pan_no: '',
  addr: '',
  city: '',
  state: '',
}

export default function EmployeeModal({ onClose, onSuccess }) {
  const [form, setForm] = useState(initialForm)
  const [createEmployee, { isLoading }] = useCreateEmployeeMutation()

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((p) => ({ ...p, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.empname.trim()) {
      alert('Please enter employee name.')
      return
    }
    const payload = {
      empname: form.empname.trim(),
      emp_code: form.emp_code.trim() || undefined,
      mobno: form.mobno.trim() || undefined,
      designation: form.designation.trim() || undefined,
      joining_date: form.joining_date || undefined,
      monthly_salary: form.monthly_salary !== '' ? Number(form.monthly_salary) : undefined,
      bank_name: form.bank_name.trim() || undefined,
      bank_account: form.bank_account.trim() || undefined,
      ifsc: form.ifsc.trim() || undefined,
      pan_no: form.pan_no.trim() || undefined,
      addr: form.addr.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      is_active: 1,
    }
    try {
      const res = await createEmployee(payload).unwrap()
      onSuccess?.(res?.data ?? res)
      onClose()
    } catch (err) {
      console.error('Create employee failed:', err)
      alert(err?.data?.message || err?.data?.detail || 'Could not save employee.')
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !isLoading && onClose()} role="presentation">
      <div className="modal-box modal-box--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create Employee</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close" disabled={isLoading}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="customer-form">
          <div className="salary-form-grid">
            <div className="form-group">
              <label htmlFor="empname">Employee Name <span className="required">*</span></label>
              <input id="empname" name="empname" value={form.empname} onChange={handleChange} className="form-input" required />
            </div>
            <div className="form-group">
              <label htmlFor="emp_code">Employee Id / Code</label>
              <input id="emp_code" name="emp_code" value={form.emp_code} onChange={handleChange} className="form-input" placeholder="e.g. 2023/02" />
            </div>
            <div className="form-group">
              <label htmlFor="designation">Designation</label>
              <input id="designation" name="designation" value={form.designation} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label htmlFor="mobno">Mobile</label>
              <input id="mobno" name="mobno" value={form.mobno} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label htmlFor="joining_date">Joining Date</label>
              <input id="joining_date" name="joining_date" type="date" value={form.joining_date} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label htmlFor="monthly_salary">Monthly Basic (₹)</label>
              <input id="monthly_salary" name="monthly_salary" type="number" min="0" step="0.01" value={form.monthly_salary} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label htmlFor="pan_no">PAN</label>
              <input id="pan_no" name="pan_no" value={form.pan_no} onChange={handleChange} className="form-input" maxLength={10} />
            </div>
            <div className="form-group">
              <label htmlFor="bank_name">Bank Name</label>
              <input id="bank_name" name="bank_name" value={form.bank_name} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label htmlFor="bank_account">Bank Account</label>
              <input id="bank_account" name="bank_account" value={form.bank_account} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label htmlFor="ifsc">IFSC</label>
              <input id="ifsc" name="ifsc" value={form.ifsc} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label htmlFor="city">City</label>
              <input id="city" name="city" value={form.city} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label htmlFor="state">State</label>
              <select id="state" name="state" value={form.state} onChange={handleChange} className="form-input">
                <option value="">Select state</option>
                {INDIA_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="form-group salary-form-grid--full">
              <label htmlFor="addr">Address</label>
              <input id="addr" name="addr" value={form.addr} onChange={handleChange} className="form-input" />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isLoading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Saving…' : 'Save Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
