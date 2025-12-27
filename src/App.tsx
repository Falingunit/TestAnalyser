import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { useAppStore } from '@/lib/store'
import { AdminPanel } from '@/pages/AdminPanel'
import { Auth } from '@/pages/Auth'
import { Dashboard } from '@/pages/Dashboard'
import { NotFound } from '@/pages/NotFound'
import { Profile } from '@/pages/Profile'
import { QuestionDetail } from '@/pages/QuestionDetail'
import { TestDetail } from '@/pages/TestDetail'
import { Tests } from '@/pages/Tests'

const ProtectedLayout = () => {
  const { currentUser, isBootstrapped } = useAppStore()
  if (!isBootstrapped) {
    return null
  }
  if (!currentUser) {
    return <Navigate to="/auth" replace />
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

const AdminGate = () => {
  const { currentUser, isBootstrapped, isAdmin } = useAppStore()
  if (!isBootstrapped) {
    return null
  }
  if (!currentUser || !isAdmin) {
    return <Navigate to="/app" replace />
  }

  return <AdminPanel />
}

export const App = () => {
  const { currentUser, isBootstrapped } = useAppStore()
  if (!isBootstrapped) {
    return null
  }
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={currentUser ? '/app' : '/auth'} replace />}
      />
      <Route path="/auth" element={<Auth />} />
      <Route path="/app" element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="tests" element={<Tests />} />
        <Route path="tests/:testId" element={<TestDetail />} />
        <Route
          path="questions/:testId/:questionId"
          element={<QuestionDetail />}
        />
        <Route path="profile" element={<Profile />} />
        <Route path="admin" element={<AdminGate />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
