import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

/** Live Laravel API; override with VITE_API_BASE_URL for local (e.g. http://127.0.0.1:8000/api) */
const DEFAULT_API_BASE = 'https://superplayerauction.com/billing/api'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '')

const baseUrl = API_BASE_URL

/** Backend { data: [] }, { results: [] } (Django), ya direct [] accept karta hai */
function normalizeList(response) {
  if (Array.isArray(response)) return { data: response }
  if (response && typeof response === 'object' && Array.isArray(response.results)) return { data: response.results }
  if (response && typeof response === 'object' && Array.isArray(response.data)) return { data: response.data }
  return response && typeof response === 'object' ? response : { data: [] }
}

/** Django/DRF snake_case → frontend camelCase (dashboard) */
function normalizeDashboard(r) {
  if (!r || typeof r !== 'object') return r
  const map = {
    total_sales: 'totalSales',
    total_purchase: 'totalPurchase',
    sales_change_percent: 'salesChangePercent',
    purchase_change_percent: 'purchaseChangePercent',
    outstanding_change_percent: 'outstandingChangePercent',
    invoice_count: 'invoiceCount',
    recent_invoices: 'recentInvoices',
    recent_purchases: 'recentPurchases',
  }
  const out = {}
  for (const k of Object.keys(r)) {
    const key = map[k] ?? k
    let val = r[k]
    if (key === 'recentInvoices' && Array.isArray(val)) {
      val = val.map((inv) => ({
        id: inv.id,
        customer: inv.customer ?? inv.customer_name,
        amount: inv.amount,
        date: inv.date,
        status: inv.status,
      }))
    }
    if (key === 'recentPurchases' && Array.isArray(val)) {
      val = val.map((po) => ({
        id: po.id,
        vendor: po.vendor ?? po.vendor_name,
        amount: po.amount,
        date: po.date,
      }))
    }
    out[key] = val
  }
  return out
}

export const billingApi = createApi({
  reducerPath: 'billingApi',
  baseQuery: fetchBaseQuery({
    baseUrl,
    prepareHeaders: (headers) => {
      headers.set('Content-Type', 'application/json')
      // Agar auth use karte ho to: const token = getState().auth?.token; if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  }),
  tagTypes: ['Dashboard', 'Invoice', 'PurchaseOrder', 'Vendor', 'Customer', 'Item', 'Expense', 'ExpenseHead'],
  keepUnusedDataFor: 5 * 60, // 5 min cache – same request dubara nahi bhelegi
  endpoints: (builder) => ({
    // Dashboard – ek hi call, sab stats + recent lists
    getDashboard: builder.query({
      query: () => ({ url: '/dashboard', method: 'GET' }),
      transformResponse: normalizeDashboard,
      providesTags: ['Dashboard'],
    }),

    getPayByList: builder.query({
      query: () => ({ url: '/pay-by', method: 'GET' }),
      transformResponse: normalizeList,
    }),

    // Invoices
    getInvoices: builder.query({
      query: ({ search, status, from, to } = {}) => {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (status) params.set('status', status)
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        return { url: `/invoices?${params}` }
      },
      transformResponse: normalizeList,
      providesTags: (result) =>
        result?.data ? [...result.data.map(({ id }) => ({ type: 'Invoice', id })), 'Invoice'] : ['Invoice'],
    }),
    getInvoiceById: builder.query({
      query: (id) => ({ url: `/invoices/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Invoice', id }],
    }),
    createInvoice: builder.mutation({
      query: (body) => ({ url: '/invoices', method: 'POST', body }),
      invalidatesTags: ['Invoice', 'Dashboard'],
    }),
    updateInvoice: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/invoices/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Invoice', id }, 'Invoice', 'Dashboard'],
    }),
    deleteInvoice: builder.mutation({
      query: (id) => ({ url: `/invoices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Invoice', 'Dashboard'],
    }),
    // Purchase orders
    getPurchaseOrders: builder.query({
      query: (arg) => {
        const params = new URLSearchParams()
        if (typeof arg === 'string' && arg) params.set('search', arg)
        else if (arg && typeof arg === 'object') {
          if (arg.search) params.set('search', arg.search)
          if (arg.from) params.set('from', arg.from)
          if (arg.to) params.set('to', arg.to)
        }
        const qs = params.toString()
        return { url: qs ? `/purchases?${qs}` : '/purchases' }
      },
      transformResponse: normalizeList,
      providesTags: (result) =>
        result?.data
          ? [...result.data.map(({ id }) => ({ type: 'PurchaseOrder', id })), 'PurchaseOrder']
          : ['PurchaseOrder'],
    }),
    createPurchaseOrder: builder.mutation({
      query: (body) => ({ url: '/purchases', method: 'POST', body }),
      invalidatesTags: ['PurchaseOrder', 'Dashboard', 'Vendor'],
    }),
    deletePurchaseOrder: builder.mutation({
      query: (id) => ({ url: `/delpurchase/${id}`, method: 'POST' }),
      invalidatesTags: ['PurchaseOrder', 'Dashboard'],
    }),

    getGstRateReport: builder.query({
      query: ({ from, to }) => ({
        url: `/gstratereport?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      }),
    }),

    // Vendors
    getVendors: builder.query({
      query: (search) => ({
        url: search ? `/vendors?search=${encodeURIComponent(search)}` : '/vendors',
      }),
      transformResponse: normalizeList,
      providesTags: (result) =>
        result?.data ? [...result.data.map(({ id }) => ({ type: 'Vendor', id })), 'Vendor'] : ['Vendor'],
    }),

    // Customers
    getCustomers: builder.query({
      query: (arg) => {
        const params = new URLSearchParams()
        const search = typeof arg === 'string' ? arg : arg?.search
        const prtytyp = typeof arg === 'object' && arg?.prtytyp !== undefined ? arg.prtytyp : undefined
        if (search) params.set('search', search)
        if (prtytyp !== undefined) params.set('prtytyp', prtytyp)
        return { url: params.toString() ? `/customers?${params}` : '/customers' }
      },
      transformResponse: normalizeList,
      providesTags: (result) =>
        result?.data
          ? [...result.data.map(({ id }) => ({ type: 'Customer', id })), 'Customer']
          : ['Customer'],
    }),
    createCustomer: builder.mutation({
      query: (body) => ({ url: '/parties', method: 'POST', body }),
      invalidatesTags: ['Customer'],
    }),

    // Items / Inventory
    getItems: builder.query({
      query: ({ search, status } = {}) => {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (status) params.set('status', status)
        return { url: `/items?${params}` }
      },
      transformResponse: (r) => {
        if (Array.isArray(r)) return { data: r.map((i) => ({ ...i, id: i.item_id ?? i.id })), summary: null }
        if (!r || typeof r !== 'object') return { data: [], summary: null }
        const data = (r.data ?? r.results ?? []).map((i) => ({ ...i, id: i.item_id ?? i.id }))
        return { data, summary: r.summary ?? null }
      },
      providesTags: (result) =>
        result?.data ? [...result.data.map(({ id }) => ({ type: 'Item', id })), 'Item'] : ['Item'],
    }),
    createItem: builder.mutation({
      query: (body) => ({ url: '/items', method: 'POST', body }),
      invalidatesTags: ['Item', 'Dashboard'],
    }),
    updateItem: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/items/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Item', id }, 'Item', 'Dashboard'],
    }),

    // Expense + Purchase combined report
    getExpenseReport: builder.query({
      query: ({ from, to }) => ({
        url: `/expensereport?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        method: 'POST',
      }),
    }),

    // Ledger
    getLedger: builder.query({
      query: ({ from, to, pbid }) => {
        const params = new URLSearchParams()
        params.set('from', from)
        params.set('to', to)
        if (pbid != null && pbid !== '') params.set('pbid', String(pbid))
        return { url: `/ledger?${params.toString()}`, method: 'POST' }
      },
      transformResponse: (r) => ({
        entries: Array.isArray(r?.entries) ? r.entries : [],
        summary: r?.summary ?? null,
      }),
    }),

    // Expense Heads (Categories)
    getExpenseHeads: builder.query({
      query: () => ({ url: '/expenses-heads' }),
      transformResponse: normalizeList,
      providesTags: (result) =>
        result?.data
          ? [...result.data.map(({ id }) => ({ type: 'ExpenseHead', id })), 'ExpenseHead']
          : ['ExpenseHead'],
    }),
    createExpenseHead: builder.mutation({
      query: (body) => ({ url: '/expenses-heads', method: 'POST', body }),
      invalidatesTags: ['ExpenseHead'],
    }),

    // Expenses
    getExpenses: builder.query({
      query: ({ search, from, to, exp_head_id } = {}) => {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        if (exp_head_id) params.set('exp_head_id', exp_head_id)
        const qs = params.toString()
        return { url: qs ? `/expenses?${qs}` : '/expenses' }
      },
      transformResponse: normalizeList,
      providesTags: (result) =>
        result?.data
          ? [...result.data.map(({ id }) => ({ type: 'Expense', id })), 'Expense']
          : ['Expense'],
    }),
    createExpense: builder.mutation({
      query: (body) => ({ url: '/expenses', method: 'POST', body }),
      invalidatesTags: ['Expense', 'Dashboard'],
    }),
    deleteExpense: builder.mutation({
      query: (exid) => ({ url: `/delexpenses/${exid}`, method: 'POST' }),
      invalidatesTags: ['Expense', 'ExpenseHead', 'Dashboard'],
    }),
  }),
})

export const {
  useGetDashboardQuery,
  useGetPayByListQuery,
  useGetInvoicesQuery,
  useGetInvoiceByIdQuery,
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
  useDeleteInvoiceMutation,
  useGetPurchaseOrdersQuery,
  useCreatePurchaseOrderMutation,
  useDeletePurchaseOrderMutation,
  useGetGstRateReportQuery,
  useGetVendorsQuery,
  useGetCustomersQuery,
  useCreateCustomerMutation,
  useGetItemsQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
  useGetLedgerQuery,
  useGetExpenseHeadsQuery,
  useCreateExpenseHeadMutation,
  useGetExpensesQuery,
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useGetExpenseReportQuery,
} = billingApi
