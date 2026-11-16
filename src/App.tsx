import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { useAuth } from './hooks/useAuth'
import Activity from './pages/Activity'
import Cashier from './pages/Cashier'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Home from './pages/Home'
import Login from './pages/Login'
import Products from './pages/Products'
import Settings from './pages/Settings'

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-deep text-gold">
      Loading...
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route element={session ? <AppLayout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Cashier />} />
        <Route path="/history" element={<History />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/status" element={<Home />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}