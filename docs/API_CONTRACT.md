# API Contract – Billing Frontend

Yeh document batata hai ki frontend **kis URL** se aur **kaunsi shape** ki data expect karta hai. Apni backend APIs ko isi format mein return karo taaki Redux/RTK Query sahi se kaam kare aur **loading minimum** rahe (caching + tags).

---

## Base URL

- **Environment variable:** `VITE_API_BASE_URL`
- Example: `https://your-api.com/api` ya `http://localhost:3000/api`
- Agar set nahi hai to app mock/fallback data use karega (development).
- **Vite proxy (optional):** Agar backend alag port pe hai (e.g. `localhost:4000`) to `vite.config.js` mein proxy set karo:
  ```js
  export default defineConfig({
    server: { proxy: { '/api': 'http://localhost:4000' } }
  })
  ```
  Aur frontend se call karo `VITE_API_BASE_URL=http://localhost:5173` (ya empty) taaki same origin se `/api/...` proxy ho jaye.

---

## 1. Dashboard (ek hi call – minimum loading)

**Endpoint:** `GET /dashboard`  
(ya `GET /api/dashboard` agar base URL mein `/api` nahi hai)

**Response shape:**

```json
{
  "totalSales": 245680,
  "totalPurchase": 182400,
  "outstanding": 45200,
  "invoiceCount": 48,
  "salesChangePercent": 12.5,
  "purchaseChangePercent": 8.2,
  "outstandingChangePercent": -3.1,
  "recentInvoices": [
    {
      "id": "INV-001",
      "customer": "ABC Traders",
      "amount": 12500,
      "date": "2025-03-16",
      "status": "Paid"
    }
  ],
  "recentPurchases": [
    {
      "id": "PO-101",
      "vendor": "Supplier A",
      "amount": 32000,
      "date": "2025-03-15"
    }
  ]
}
```

- `amount` values number (rupees) bhejo, frontend `₹` format karega.
- `date` ISO string (`YYYY-MM-DD`) ya same format.
- `status`: `"Paid"` | `"Pending"` | `"Overdue"`.

---

## 2. Invoices

**List:** `GET /invoices`  
Optional query: `?status=Paid` | `?search=xyz`

**Response:**

```json
{
  "data": [
    {
      "id": "INV-001",
      "date": "2025-03-16",
      "customer": "ABC Traders",
      "customerId": "cust-1",
      "amount": 12500,
      "gst": 2250,
      "status": "Paid"
    }
  ]
}
```

**Single:** `GET /invoices/:id`

**Create:** `POST /invoices`  
Body:

```json
{
  "customerId": "cust-1",
  "items": [{ "itemId": "ITM-001", "qty": 2, "rate": 500 }],
  "dueDate": "2025-04-16"
}
```

---

## 3. Sales

**List:** `GET /sales`  
Optional: `?search=abc`

**Response:**

```json
{
  "data": [
    {
      "id": "SAL-001",
      "date": "2025-03-16",
      "customer": "ABC Traders",
      "customerId": "cust-1",
      "items": 5,
      "total": 12500,
      "status": "Completed"
    }
  ]
}
```

**Create:** `POST /sales`  
Body: same as invoice create jaise (customerId, items, etc.)

- `status`: `"Completed"` | `"Pending"`.

---

## 4. Purchase Orders

**List:** `GET /purchase-orders` (ya `GET /purchases`)  
Optional: `?search=xyz`

**Response:**

```json
{
  "data": [
    {
      "id": "PO-101",
      "date": "2025-03-15",
      "vendor": "Supplier A",
      "vendorId": "vendor-1",
      "items": 8,
      "total": 32000,
      "status": "Received"
    }
  ]
}
```

**Create:** `POST /purchase-orders`  
Body: `vendorId`, `items[]`, `expectedDate`, etc.

- `status`: `"Received"` | `"Pending"` | `"Partial"`.

---

## 5. Vendors

**List:** `GET /vendors`  
Optional: `?search=abc`

**Response:**

```json
{
  "data": [
    {
      "id": "vendor-1",
      "name": "Supplier A",
      "contact": "9876543210",
      "balance": 0,
      "lastOrder": "2025-03-15"
    }
  ]
}
```

- `balance` number (rupees), `lastOrder` string date.

---

## 6. Customers

**List:** `GET /customers`  
Optional: `?search=xyz`

**Response:**

```json
{
  "data": [
    {
      "id": "cust-1",
      "name": "ABC Traders",
      "phone": "9876543210",
      "email": "abc@example.com",
      "gstin": "29AABCU9603R1ZM",
      "balance": 0,
      "totalOrders": 24
    }
  ]
}
```

**Create:** `POST /customers`  
Body: `name`, `phone`, `email`, `gstin` (optional).

---

## 7. Inventory / Items

**List:** `GET /items` (ya `GET /inventory`)  
Optional: `?search=abc` | `?status=LowStock`

**Response:**

```json
{
  "data": [
    {
      "id": "ITM-001",
      "name": "Product A",
      "sku": "SKU-A001",
      "qty": 120,
      "unit": "pcs",
      "lowStock": 20,
      "status": "In Stock"
    }
  ],
  "summary": {
    "totalItems": 156,
    "lowStockCount": 2,
    "outOfStockCount": 1
  }
}
```

- `status`: `"In Stock"` | `"Low Stock"` | `"Out of Stock"`.
- Agar `summary` nahi bhejoge to frontend list se calculate karega.

**Create:** `POST /items`  
Body: `name`, `sku`, `qty`, `unit`, `lowStock` (number).

---

## Summary – Kaunsi API chahiye

| Feature    | GET (list/single)     | POST (create)   |
|-----------|------------------------|-----------------|
| Dashboard | `GET /dashboard`       | —               |
| Invoices  | `GET /invoices`        | `POST /invoices` |
| Sales     | `GET /sales`           | `POST /sales`   |
| Purchase  | `GET /purchase-orders` | `POST /purchase-orders` |
| Vendors   | `GET /vendors`         | (optional)      |
| Customers | `GET /customers`       | `POST /customers` |
| Items     | `GET /items`           | `POST /items`   |

---

## CORS & Headers

- Backend pe CORS allow karo frontend origin ke liye.
- Response header: `Content-Type: application/json`.
- Agar auth use karte ho to: `Authorization: Bearer <token>` frontend bhejega (future).

---

## Minimum loading kaise hoga

- **RTK Query** same request ko **cache** karega (default ~5 min).
- Dashboard / list pe first time load pe hi API chalegi; dubara same page pe jao to cache se dikhega, background me refetch ho sakta hai.
- Jab **POST** (invoice/sale/customer create) karo to usi resource ke **tags invalidate** honge, jisse related lists automatically refetch ho jayengi.
- Backend **fast** response do (list pe pagination use karo agar data zyada ho) taaki loading time kam rahe.

Apni existing GET/POST APIs ko is response shape ke hisaab se adjust karo; endpoint path alag ho to frontend me `baseQuery` ya endpoint path change kar dena.
