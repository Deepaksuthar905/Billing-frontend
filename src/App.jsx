import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Purchase from './pages/Purchase'
import PurchaseNew from './pages/PurchaseNew'
import Inventory from './pages/Inventory'
import Customers from './pages/Customers'
import Reports from './pages/Reports'
import Invoices from './pages/Invoices'
import InvoiceNew from './pages/InvoiceNew'
import InvoiceDueList from './pages/InvoiceDueList'
import InvoicePayInList from './pages/InvoicePayInList'
import Expenses from './pages/Expenses'
import ExpenseNew from './pages/ExpenseNew'
import ExpenseGeneralEntry from './pages/ExpenseGeneralEntry'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="purchase" element={<Purchase />} />
        <Route path="purchase/new" element={<PurchaseNew />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="customers" element={<Customers />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/due" element={<InvoiceDueList />} />
        <Route path="invoices/pay-in" element={<InvoicePayInList />} />
        <Route path="invoices/new" element={<InvoiceNew />} />
        <Route path="invoices/:id/edit" element={<InvoiceNew />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="expenses/general-entry" element={<ExpenseGeneralEntry />} />
        <Route path="expenses/new" element={<ExpenseNew />} />
        <Route path="reports" element={<Reports />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
