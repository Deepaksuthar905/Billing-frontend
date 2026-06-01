import { useState, useEffect, useMemo } from 'react'
import { Banknote } from 'lucide-react'
import {
  useCreatePayInMutation,
  useGetInvoiceByIdQuery,
  useGetPayByListQuery,
} from '../store/api'
import { formatCurrency } from '../utils/format'
import {
  getInvoiceBalance,
  invoiceDisplayNo,
  resolveInvoiceApiId,
  resolvePartyId,
} from '../utils/invoicePayment'
import './PayInModal.css'

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Record customer payment against a due invoice (POST /pay-in).
 */
export default function PayInModal({ invId, listInvoice, onClose, onSuccess }) {
  const { data: detailRaw, isLoading: detailLoading } = useGetInvoiceByIdQuery(invId, {
    skip: !invId,
  })
  const { data: payByData } = useGetPayByListQuery()
  const [createPayIn, { isLoading: isSaving }] = useCreatePayInMutation()

  const inv = useMemo(() => {
    const detail = detailRaw?.data ?? detailRaw
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      return { ...listInvoice, ...detail, id: detail.invid ?? detail.id ?? invId }
    }
    return listInvoice ? { ...listInvoice, id: listInvoice.invid ?? listInvoice.id ?? invId } : null
  }, [detailRaw, listInvoice, invId])

  const balance = inv ? getInvoiceBalance(inv) : 0
  const total = Number(inv?.payment ?? inv?.amount) || 0
  const partyId = inv ? resolvePartyId(inv) : null
  const invoiceApiId = inv ? resolveInvoiceApiId(inv) : invId

  const paybyList = payByData?.data ?? []

  const [dt, setDt] = useState(todayYmd())
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [payby, setPayby] = useState('')
  const [referal, setReferal] = useState('')

  useEffect(() => {
    if (balance > 0) setAmount(String(Math.round(balance * 100) / 100))
  }, [balance])

  useEffect(() => {
    if (paybyList.length && payby === '') setPayby(String(paybyList[0].pbid ?? paybyList[0].id))
  }, [paybyList, payby])

  const amountNum = Number(amount) || 0
  const amountError =
    amountNum <= 0
      ? 'Enter amount greater than 0.'
      : balance > 0 && amountNum > balance + 0.01
        ? `Amount cannot exceed balance ${formatCurrency(balance)}.`
        : ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inv) {
      alert('Invoice details not loaded.')
      return
    }
    if (partyId == null || !Number.isFinite(partyId)) {
      alert('Customer (party) missing on this invoice. Edit invoice and select customer first.')
      return
    }
    if (invoiceApiId == null) {
      alert('Invoice ID missing.')
      return
    }
    if (amountError) {
      alert(amountError)
      return
    }

    const payload = {
      party_id: partyId,
      inv_id: Number(invoiceApiId),
      dt: dt || todayYmd(),
      amount: amountNum,
    }
    if (description.trim()) payload.description = description.trim()
    if (payby !== '') payload.payby = Number(payby)
    if (referal.trim()) payload.referal = referal.trim()

    try {
      await createPayIn(payload).unwrap()
      onSuccess?.()
      onClose()
    } catch (err) {
      console.error('Pay-in failed:', err)
      const msg =
        err?.data?.message ||
        (typeof err?.data === 'object' && err?.data?.errors
          ? Object.values(err.data.errors).flat().join(' ')
          : null) ||
        err?.data?.detail ||
        'Could not save payment.'
      alert(msg)
    }
  }

  return (
    <div className="modal-overlay pay-in-overlay" onClick={() => !isSaving && onClose()}>
      <div className="modal-box pay-in-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header pay-in-modal-header">
          <span className="modal-title">
            <Banknote size={20} />
            Record payment (Pay In)
          </span>
        </div>

        {detailLoading && !inv ? (
          <div className="modal-body">
            <p className="text-muted">Loading invoice…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body pay-in-modal-body">
              <div className="pay-in-summary">
                <div>
                  <span className="pay-in-summary-label">Invoice</span>
                  <strong>{invoiceDisplayNo(inv)}</strong>
                </div>
                <div>
                  <span className="pay-in-summary-label">Customer</span>
                  <strong>
                    {inv?.customer ?? inv?.customer_name ?? inv?.partyname ?? '—'}
                  </strong>
                </div>
                <div>
                  <span className="pay-in-summary-label">Invoice total</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>
                <div className="pay-in-summary--due">
                  <span className="pay-in-summary-label">Balance</span>
                  <strong>{formatCurrency(balance)}</strong>
                </div>
              </div>

              <p className="pay-in-hint text-muted">
                Partial payments allowed — record each receipt as a separate Pay In entry.
              </p>

              <div className="pay-in-form-grid">
                <label className="pay-in-field">
                  <span>Payment date</span>
                  <input
                    type="date"
                    className="form-input"
                    value={dt}
                    onChange={(e) => setDt(e.target.value)}
                    required
                  />
                </label>
                <label className="pay-in-field">
                  <span>Amount received (₹)</span>
                  <input
                    type="number"
                    className="form-input"
                    min="0.01"
                    step="0.01"
                    max={balance > 0 ? balance : undefined}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                  {amountError && <span className="pay-in-field-error">{amountError}</span>}
                </label>
                <label className="pay-in-field">
                  <span>Received via (Pay by)</span>
                  <select
                    className="form-input"
                    value={payby}
                    onChange={(e) => setPayby(e.target.value)}
                  >
                    {paybyList.map((p) => (
                      <option key={p.pbid ?? p.id} value={String(p.pbid ?? p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pay-in-field">
                  <span>Reference / UTR</span>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={100}
                    placeholder="Cheque no., UTR, etc."
                    value={referal}
                    onChange={(e) => setReferal(e.target.value)}
                  />
                </label>
                <label className="pay-in-field pay-in-field--full">
                  <span>Description (optional)</span>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Part payment – cash"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSaving || !!amountError}>
                {isSaving ? 'Saving…' : 'Save Pay In'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
