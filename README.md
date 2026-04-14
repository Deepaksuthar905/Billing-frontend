# Billing Software – GST Invoicing & Accounting (Frontend)

A React-based billing software frontend inspired by [Vyapar](https://vyaparapp.in/), with dashboard, sales, purchase, inventory, customers, invoices, and reports.

## Features

- **Dashboard** – Overview with total sales, purchase, outstanding, invoices count; recent invoices and purchases
- **Sales** – Sales list, search/filter, quick actions (Create Invoice, POS)
- **Invoices** – Invoice list with status (Paid/Pending/Overdue), view/download actions
- **Purchase** – Purchase orders and vendors tabs with lists
- **Inventory** – Stock summary, low/out-of-stock alerts, item list with SKU and quantity
- **Customers** – Customer list with contact, GSTIN, outstanding, total orders
- **Reports** – Report categories (Sales, Purchase, GST, P&L, Stock) and sales overview chart

## Tech Stack

- React 19 + Vite
- Redux Toolkit + RTK Query (API + caching, minimum loading)
- React Router
- Lucide React (icons)
- Plain CSS (no UI library)

## Run locally

1. Ensure your backend is running at `http://127.0.0.1:8000` (e.g. Django).
2. `.env` already has `VITE_API_BASE_URL=http://127.0.0.1:8000/api` – all requests go to `http://127.0.0.1:8000/api/dashboard`, `/api/invoices`, etc.
3. Start the app:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). If you change `.env`, restart `npm run dev`.

## Build

```bash
npm run build
```

Output is in `dist/`.

## Project structure

```
src/
  store/          Redux store + RTK Query API (api.js)
  components/      Layout, Sidebar, Header
  pages/           Dashboard, Sales, Invoices, Purchase, Inventory, Customers, Reports
  utils/           formatCurrency, formatDate
  index.css        Global styles and variables
docs/
  API_CONTRACT.md  Backend API contract (URLs + request/response shape)
```

## Backend API & Redux

- **API contract:** `docs/API_CONTRACT.md` – exact endpoints and response shape jo frontend expect karta hai. Apni GET/POST APIs ko us format mein return karo.
- **Base URL:** Set `VITE_API_BASE_URL` in `.env` (e.g. `VITE_API_BASE_URL=https://your-api.com/api`). Agar set nahi hai to app **fallback/mock data** dikhata hai.
- **Minimum loading:** RTK Query use hota hai – same request **5 min cache**, tags se invalidation (e.g. invoice create pe Invoice + Dashboard refetch). First load pe hi API chalegi, baaki time cache se + optional background refetch.
