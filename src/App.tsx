import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { useAppStore } from '@/lib/store'
import { Auth } from '@/pages/Auth'
import { Bookmarks } from '@/pages/Bookmarks'
import { Dashboard } from '@/pages/Dashboard'
import { NotFound } from '@/pages/NotFound'
import { Profile } from '@/pages/Profile'
import { QuestionDetail } from '@/pages/QuestionDetail'
import { TestDetail } from '@/pages/TestDetail'
import { Tests } from '@/pages/Tests'
import { LeaderboardsList } from '@/pages/LeaderboardsList'
import { CustomLeaderboardDetail } from '@/pages/CustomLeaderboardDetail'

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

export const App = () => {
  const { currentUser, isBootstrapped } = useAppStore()

  useEffect(() => {
    const chatStoragePrefix = 'testanalyser-question-chat-'

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(chatStoragePrefix)) {
        localStorage.removeItem(key)
      }
    }
  }, [])

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
        <Route path="bookmarks" element={<Bookmarks />} />
        <Route path="tests/:testId" element={<TestDetail />} />
        <Route
          path="questions/:testId/:questionId"
          element={<QuestionDetail />}
        />
        <Route path="leaderboards" element={<LeaderboardsList />} />
        <Route path="leaderboards/:id" element={<CustomLeaderboardDetail />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
