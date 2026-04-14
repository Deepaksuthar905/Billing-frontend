import * as XLSX from 'xlsx'

/** Excel sheet name max 31 chars; invalid chars stripped */
function safeSheetName(name) {
  return String(name).slice(0, 31).replace(/[*?:/\\[\]]/g, '_')
}

/**
 * @param {Array<{ name: string, rows: any[][] }>} sheets
 * @param {string} fileName - without or with .xlsx
 */
export function downloadExcelWorkbook(sheets, fileName) {
  const wb = XLSX.utils.book_new()
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name))
  }
  const fn = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  XLSX.writeFile(wb, fn)
}

function tsFilePart() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

/**
 * @param {object} ctx - all fields from Reports.jsx current view
 */
export function exportCurrentReport(ctx) {
  const {
    activeReportId,
    activeGstSub,
    mockSalesReport,
    gstr1From,
    gstr1To,
    gstr1Rows,
    gstr1HsnSummary,
    gstr3bFrom,
    gstr3bTo,
    outward3b,
    itc3b,
    net3b,
    gstr3bInvoicesFiltered,
    gstr3bPurchasesFiltered,
    purchaseRegFrom,
    purchaseRegTo,
    purchaseRegRows,
    purchaseRegRaw,
    gstRateFrom,
    gstRateTo,
    gstRateRows,
    ledgerFrom,
    ledgerTo,
    ledgerPayByPbid,
    ledgerPayByName,
    ledgerPayByDetail,
    ledgerRows,
    ledgerSummary,
    expRptFrom,
    expRptTo,
    expRptRows,
    expRptSummary,
  } = ctx

  const sheets = []
  let baseName = `Report_${tsFilePart()}`

  if (activeReportId === 'sales') {
    sheets.push({
      name: 'Sales Overview',
      rows: [
        ['Date', 'Sales (₹)'],
        ...(mockSalesReport || []).map((d) => [d.date, d.sales]),
      ],
    })
    baseName = `Sales_Report_${tsFilePart()}`
  } else if (activeReportId === 'purchase') {
    // Summary sheet
    if (expRptSummary) {
      sheets.push({
        name: 'Summary',
        rows: [
          ['Expenses & Purchase Report Summary'],
          ['Period', `${expRptFrom ?? ''} to ${expRptTo ?? ''}`],
          [],
          ['Particulars', 'Amount (₹)'],
          ['Total Payment', expRptSummary.total_payment ?? 0],
          ['Total Taxable Amount', expRptSummary.total_taxable_amt ?? 0],
          ['Total CGST', expRptSummary.total_cgst ?? 0],
          ['Total SGST', expRptSummary.total_sgst ?? 0],
          ['Total IGST', expRptSummary.total_igst ?? 0],
          ['Total GST', expRptSummary.total_gst ?? 0],
        ],
      })
    }
    // Detail sheet
    sheets.push({
      name: 'Expenses & Purchases',
      rows: [
        ['Period', `${expRptFrom ?? ''} to ${expRptTo ?? ''}`],
        [],
        [
          'Inv No',
          'Type',
          'Date',
          'Party Name',
          'Item / Description',
          'Payment (₹)',
          'Taxable Amt (₹)',
          'CGST (₹)',
          'SGST (₹)',
          'IGST (₹)',
          'Pay By',
          'Ref No',
          'State',
        ],
        ...(expRptRows || []).map((row) => [
          row.inv_no ?? '',
          row.type ?? '',
          row.date ?? '',
          row.party_name ?? '',
          row.item_name ?? row.description ?? '',
          row.payment ?? 0,
          row.taxable_amt ?? 0,
          row.cgst ?? 0,
          row.sgst ?? 0,
          row.igst ?? 0,
          row.payby ?? '',
          row.refno ?? '',
          row.state ?? '',
        ]),
        ...(expRptSummary && expRptRows?.length
          ? [[
              'TOTAL', '', '', '', '',
              expRptSummary.total_payment ?? 0,
              expRptSummary.total_taxable_amt ?? 0,
              expRptSummary.total_cgst ?? 0,
              expRptSummary.total_sgst ?? 0,
              expRptSummary.total_igst ?? 0,
              '', '', '',
            ]]
          : []),
      ],
    })
    baseName = `Expenses_Report_${expRptFrom ?? ''}_${expRptTo ?? ''}`
  } else if (activeReportId === 'ledger') {
    const ledgerPayByRows =
      ledgerPayByPbid != null || ledgerPayByName != null || ledgerPayByDetail != null
        ? [
            [
              'Bank / Pay by',
              ledgerPayByName
                ? `${ledgerPayByName}${ledgerPayByPbid != null ? ` (pbid ${ledgerPayByPbid})` : ''}`
                : ledgerPayByPbid != null
                  ? `pbid ${ledgerPayByPbid}`
                  : '—',
            ],
            ['Detail', ledgerPayByDetail ?? '—'],
          ]
        : []
    sheets.push({
      name: 'Ledger',
      rows: [
        ['Ledger Report'],
        ['Period', `${ledgerFrom ?? ''} to ${ledgerTo ?? ''}`],
        ...ledgerPayByRows,
        [],
        ['Date', 'Particulars', 'Voucher Type', 'Voucher No', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)'],
        ...(ledgerRows || []).map((row) => [
          row.date ?? row.dt ?? '',
          row.particulars ?? row.narration ?? row.description ?? '',
          row.voucher_type ?? row.vch_type ?? row.type ?? '',
          row.voucher_no ?? row.vch_no ?? row.ref_no ?? '',
          row.debit ?? row.dr ?? 0,
          row.credit ?? row.cr ?? 0,
          row.balance ?? row.bal ?? '',
        ]),
        ...(ledgerSummary
          ? [
              [],
              ['Summary'],
              ['Total Debit', ledgerSummary.total_debit ?? ledgerSummary.totalDebit ?? ''],
              ['Total Credit', ledgerSummary.total_credit ?? ledgerSummary.totalCredit ?? ''],
              ['Closing Balance', ledgerSummary.closing_balance ?? ledgerSummary.closingBalance ?? ''],
            ]
          : []),
      ],
    })
    baseName = `Ledger_${ledgerFrom ?? ''}_${ledgerTo ?? ''}`
  } else if (activeReportId === 'gst' && activeGstSub === 'gstr1') {
    sheets.push({
      name: 'GSTR-1 Outward',
      rows: [
        ['Date range', `${gstr1From} to ${gstr1To}`],
        [],
        [
          'Sno.',
          'GSTIN',
          'Party Name',
          'Invoice no.',
          'Date',
          'Value',
          'Tax Rate %',
          'Taxable Value',
          'Integrated Tax (SGST)',
          'Central Tax (IGST)',
          'State Tax (CGST)',
          'Place of Supply',
        ],
        ...(gstr1Rows || []).map((row, i) => [
          i + 1,
          row.gstin ?? '',
          row.partyName ?? '',
          row.invNo ?? '',
          row.date ?? '',
          row.value ?? 0,
          row.taxRate ?? 0,
          row.taxableValue ?? 0,
          row.integratedTaxDisplay ?? 0,
          row.centralTaxDisplay ?? 0,
          row.stateTaxDisplay ?? 0,
          row.placeOfSupply ?? '',
        ]),
      ],
    })
    if (gstr1HsnSummary) {
      sheets.push({
        name: 'HSN Summary',
        rows: [
          ['HSN', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total'],
          [
            '—',
            gstr1HsnSummary.totalTaxable,
            gstr1HsnSummary.totalCgst,
            gstr1HsnSummary.totalSgst,
            gstr1HsnSummary.totalIgst,
            gstr1HsnSummary.total,
          ],
        ],
      })
    }
    baseName = `GSTR-1_${gstr1From}_${gstr1To}`
  } else if (activeReportId === 'gst' && activeGstSub === 'gstr3b') {
    sheets.push({
      name: 'GSTR-3B Summary',
      rows: [
        ['Period', `${gstr3bFrom} to ${gstr3bTo}`],
        ['Invoices in range', gstr3bInvoicesFiltered?.length ?? 0],
        ['Purchase bills in range', gstr3bPurchasesFiltered?.length ?? 0],
        [],
        ['3.1 Outward taxable supplies (sales)'],
        ['Description', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Invoice value'],
        [
          'Taxable outward supplies',
          outward3b?.taxable ?? 0,
          outward3b?.igst ?? 0,
          outward3b?.cgst ?? 0,
          outward3b?.sgst ?? 0,
          outward3b?.invoiceValue ?? 0,
        ],
        [],
        ['4 ITC available (purchases)'],
        ['Description', 'Taxable value', 'IGST (ITC)', 'CGST (ITC)', 'SGST (ITC)', 'Bill value'],
        [
          'Inward supplies (ITC as per bills)',
          itc3b?.taxable ?? 0,
          itc3b?.igst ?? 0,
          itc3b?.cgst ?? 0,
          itc3b?.sgst ?? 0,
          itc3b?.gross ?? 0,
        ],
        [],
        ['Net tax (outward − ITC)'],
        ['Particulars', 'IGST', 'CGST', 'SGST'],
        [
          'Net payable / (excess ITC) after set-off',
          net3b?.igst ?? 0,
          net3b?.cgst ?? 0,
          net3b?.sgst ?? 0,
        ],
      ],
    })
    baseName = `GSTR-3B_${gstr3bFrom}_${gstr3bTo}`
  } else if (activeReportId === 'gst' && activeGstSub === 'purchase-reg') {
    sheets.push({
      name: 'Purchase Register',
      rows: [
        ['Date range', `${purchaseRegFrom} to ${purchaseRegTo}`],
        ['API rows', purchaseRegRaw?.length ?? 0],
        ['Filtered rows', purchaseRegRows?.length ?? 0],
        [],
        [
          'Sno.',
          'Vendor GSTIN',
          'Vendor / Party',
          'Bill no.',
          'Date',
          'Value',
          'Tax Rate %',
          'Taxable Value',
          'Integrated Tax (SGST)',
          'Central Tax (IGST)',
          'State Tax (CGST)',
          'Place of supply',
        ],
        ...(purchaseRegRows || []).map((row, i) => [
          i + 1,
          row.gstin ?? '',
          row.partyName ?? '',
          row.invNo ?? '',
          row.date ?? '',
          row.value ?? 0,
          row.taxRate ?? 0,
          row.taxableValue ?? 0,
          row.integratedTaxDisplay ?? 0,
          row.centralTaxDisplay ?? 0,
          row.stateTaxDisplay ?? 0,
          row.placeOfSupply ?? '',
        ]),
      ],
    })
    baseName = `Purchase_Register_${purchaseRegFrom}_${purchaseRegTo}`
  } else if (activeReportId === 'gst' && activeGstSub === 'gst-rate') {
    sheets.push({
      name: 'GST Rate Report',
      rows: [
        ['Date range', `${gstRateFrom} to ${gstRateTo}`],
        [],
        [
          'Tax Name',
          'Tax Percent',
          'Taxable Sale Amount',
          'Tax In',
          'Taxable Purchase/Expense Amount',
          'Tax Out',
        ],
        ...(gstRateRows || []).map((row) => [
          row.taxName,
          row.taxPercent,
          row.taxableSale ?? '',
          row.taxIn ?? '',
          row.taxableExpense ?? '',
          row.taxOut ?? '',
        ]),
      ],
    })
    baseName = `GST_Rate_Report_${gstRateFrom}_${gstRateTo}`
  } else {
    sheets.push({
      name: 'Report',
      rows: [
        ['Section', String(activeReportId)],
        ['Note', 'No tabular data for this section yet.'],
      ],
    })
    baseName = `Report_${activeReportId}_${tsFilePart()}`
  }

  downloadExcelWorkbook(sheets, baseName)
}
