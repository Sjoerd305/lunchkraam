import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { AlertDialogProvider } from './components/AlertDialogProvider'
import { AppShell } from './components/AppShell'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminRequestsPage } from './pages/admin/AdminRequestsPage'
import { BuyPage } from './pages/BuyPage'
import { CardsPage } from './pages/CardsPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Laden…</p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <AlertDialogProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/cards" element={<CardsPage />} />
              <Route path="/buy" element={<BuyPage />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="requests" element={<AdminRequestsPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AlertDialogProvider>
    </AuthProvider>
  )
}
