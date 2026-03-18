import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const baseUrl = import.meta.env.VITE_API_BASE_URL || ''

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
  tagTypes: ['Dashboard', 'Invoice', 'PurchaseOrder', 'Vendor', 'Customer', 'Item'],
  keepUnusedDataFor: 5 * 60, // 5 min cache – same request dubara nahi bhelegi
  endpoints: (builder) => ({
    // Dashboard – ek hi call, sab stats + recent lists
    getDashboard: builder.query({
      query: () => ({ url: '/dashboard', method: 'GET' }),
      transformResponse: normalizeDashboard,
      providesTags: ['Dashboard'],
    }),

    // Invoices
    getInvoices: builder.query({
      query: ({ search, status } = {}) => {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (status) params.set('status', status)
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
    // Purchase orders
    getPurchaseOrders: builder.query({
      query: (search) => ({
        url: search ? `/purchases?search=${encodeURIComponent(search)}` : '/purchases',
      }),
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
      query: (search) => ({
        url: search ? `/customers?search=${encodeURIComponent(search)}` : '/customers',
      }),
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
  }),
})

export const {
  useGetDashboardQuery,
  useGetInvoicesQuery,
  useGetInvoiceByIdQuery,
  useCreateInvoiceMutation,
  useGetPurchaseOrdersQuery,
  useCreatePurchaseOrderMutation,
  useGetVendorsQuery,
  useGetCustomersQuery,
  useCreateCustomerMutation,
  useGetItemsQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
} = billingApi
