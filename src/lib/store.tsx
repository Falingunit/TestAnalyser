/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, requestJson } from './api'
import type {
  AppState,
  ColorMode,
  ExternalAccount,
  ThemeName,
  User,
  UserPreferences,
  TestRecord,
} from './types'

const TOKEN_KEY = 'testanalyser-token'
const USER_KEY = 'testanalyser-user'
const UI_KEY = 'testanalyser-ui'
const ADMIN_OVERRIDE_KEY = 'testanalyser-admin-override'

type AuthResult = { ok: boolean; message?: string }

type Store = {
  state: AppState
  currentUser: User | null
  isAdmin: boolean
  adminOverride: boolean
  fontScale: number
  setAdminOverride: (enabled: boolean) => void
  setFontScale: (scale: number) => void
  isBootstrapped: boolean
  register: (payload: {
    name: string
    email: string
    password: string
  }) => Promise<AuthResult>
  login: (payload: { email: string; password: string }) => Promise<AuthResult>
  updateProfile: (payload: { name: string; email: string }) => Promise<AuthResult>
  updatePassword: (payload: {
    currentPassword: string
    nextPassword: string
  }) => Promise<AuthResult>
  logout: () => void
  connectExternalAccount: (payload: {
    username: string
    password: string
  }) => Promise<void>
  syncExternalAccount: () => Promise<void>
  updateAnswerKey: (payload: {
    testId: string
    questionId: string
    newKey: unknown
  }) => Promise<void>
  updateMarkingScheme: (payload: {
    testId: string
    scheme: Record<
      string,
      { correct: number; incorrect: number; unattempted: number }
    >
  }) => Promise<void>
  setTheme: (theme: ThemeName) => void
  setMode: (mode: ColorMode) => void
  acknowledgeKeyUpdates: (testId: string) => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

const themeOptions: ThemeName[] = ['ember', 'ocean', 'forest', 'slate']

const isTheme = (value: unknown): value is ThemeName =>
  typeof value === 'string' && themeOptions.includes(value as ThemeName)

const isMode = (value: unknown): value is ColorMode =>
  value === 'light' || value === 'dark' || value === 'system'

const clampFontScale = (value: number) => Math.min(1.3, Math.max(0.9, value))

const normalizeFontScale = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? clampFontScale(value)
    : fallback

const defaultUi = {
  theme: 'ember' as ThemeName,
  mode: 'system' as ColorMode,
  fontScale: 1,
}

const loadUi = (): AppState['ui'] => {
  const raw = localStorage.getItem(UI_KEY)
  if (!raw) {
    return defaultUi
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppState['ui']>
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : defaultUi.theme,
      mode: isMode(parsed.mode) ? parsed.mode : defaultUi.mode,
      fontScale: normalizeFontScale(parsed.fontScale, defaultUi.fontScale),
    }
  } catch {
    return defaultUi
  }
}

const saveUi = (ui: AppState['ui']) => {
  localStorage.setItem(UI_KEY, JSON.stringify(ui))
}

const loadAdminOverride = () => {
  const raw = localStorage.getItem(ADMIN_OVERRIDE_KEY)
  if (raw === null) {
    return true
  }
  return raw === 'true'
}

const saveAdminOverride = (enabled: boolean) => {
  localStorage.setItem(ADMIN_OVERRIDE_KEY, String(enabled))
}

const loadToken = () => localStorage.getItem(TOKEN_KEY)

const saveToken = (token: string | null) => {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY)
    return
  }
  localStorage.setItem(TOKEN_KEY, token)
}

const normalizePreferences = (
  value: unknown,
  fallbackUi: AppState['ui'],
): UserPreferences => {
  if (!value || typeof value !== 'object') {
    return {
      theme: fallbackUi.theme,
      mode: fallbackUi.mode,
      fontScale: fallbackUi.fontScale,
      acknowledgedKeyUpdates: {},
    }
  }

  const prefs = value as Partial<UserPreferences>
  const theme = isTheme(prefs.theme) ? prefs.theme : fallbackUi.theme
  const mode = isMode(prefs.mode) ? prefs.mode : fallbackUi.mode
  const fontScale = normalizeFontScale(prefs.fontScale, fallbackUi.fontScale)
  const acknowledgedKeyUpdates =
    prefs.acknowledgedKeyUpdates && typeof prefs.acknowledgedKeyUpdates === 'object'
      ? (prefs.acknowledgedKeyUpdates as Record<string, string>)
      : {}

  return {
    theme,
    mode,
    fontScale,
    acknowledgedKeyUpdates,
  }
}

const normalizeUserRole = (role: unknown): User['role'] =>
  typeof role === 'string' && role.toLowerCase() === 'admin' ? 'admin' : 'user'

const normalizeUser = (
  value: {
    id: string
    name: string
    email: string
    role: string
    preferences?: unknown
  },
  fallbackUi: AppState['ui'] = defaultUi,
): User => ({
  id: value.id,
  name: value.name,
  email: value.email,
  role: normalizeUserRole(value.role),
  preferences: normalizePreferences(value.preferences, fallbackUi),
})

const saveUser = (user: User | null) => {
  if (!user) {
    localStorage.removeItem(USER_KEY)
    return
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

const loadUser = (): User | null => {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as User
    return {
      ...parsed,
      role: normalizeUserRole(parsed.role),
      preferences: normalizePreferences(parsed.preferences, defaultUi),
    }
  } catch {
    return null
  }
}

const normalizeAccountStatus = (value: unknown): ExternalAccount['status'] => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  if (normalized === 'connected' || normalized === 'error' || normalized === 'disconnected') {
    return normalized
  }
  return 'disconnected'
}

const normalizeSyncStatus = (value: unknown): ExternalAccount['syncStatus'] => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : ''
  if (normalized === 'syncing' || normalized === 'idle' || normalized === 'error') {
    return normalized
  }
  return 'idle'
}

const normalizeAccount = (account: {
  id: string
  userId: string
  provider: string
  username: string
  status: string
  syncStatus?: string
  syncTotal?: number
  syncCompleted?: number
  syncStartedAt?: string | null
  syncFinishedAt?: string | null
  lastSyncAt: string | null
  statusMessage?: string | null
}): ExternalAccount => ({
  id: account.id,
  userId: account.userId,
  provider: 'test.z7i.in',
  username: account.username,
  status: normalizeAccountStatus(account.status),
  syncStatus: normalizeSyncStatus(account.syncStatus),
  syncTotal: typeof account.syncTotal === 'number' ? account.syncTotal : 0,
  syncCompleted:
    typeof account.syncCompleted === 'number' ? account.syncCompleted : 0,
  syncStartedAt: account.syncStartedAt ?? null,
  syncFinishedAt: account.syncFinishedAt ?? null,
  lastSyncAt: account.lastSyncAt ?? null,
  statusMessage: account.statusMessage ?? undefined,
})

const replaceTest = (tests: TestRecord[], updated: TestRecord) =>
  tests.map((test) => (test.id === updated.id ? updated : test))

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const AppStoreProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>(() => ({
    externalAccounts: [],
    tests: [],
    ui: loadUi(),
  }))
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadUser())
  const [adminOverride, setAdminOverrideState] = useState(loadAdminOverride)
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const uiSnapshot = useRef(state.ui)

  useEffect(() => {
    saveUi(state.ui)
    uiSnapshot.current = state.ui
  }, [state.ui])

  useEffect(() => {
    const theme = currentUser?.preferences.theme ?? state.ui.theme
    const mode = currentUser?.preferences.mode ?? state.ui.mode
    const fontScale = currentUser?.preferences.fontScale ?? state.ui.fontScale
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.setProperty('--reader-font-scale', String(fontScale))

    const media =
      typeof window !== 'undefined' && 'matchMedia' in window
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
    const applyMode = () => {
      const resolved =
        mode === 'system'
          ? media?.matches
            ? 'dark'
            : 'light'
          : mode
      root.classList.toggle('dark', resolved === 'dark')
    }

    applyMode()
    if (mode === 'system' && media) {
      media.addEventListener('change', applyMode)
      return () => media.removeEventListener('change', applyMode)
    }
  }, [currentUser, state.ui.fontScale, state.ui.mode, state.ui.theme])

  const clearSession = () => {
    saveToken(null)
    saveUser(null)
    setCurrentUser(null)
    setState((prev) => ({
      ...prev,
      externalAccounts: [],
      tests: [],
    }))
  }

  const refreshAccounts = async (token: string) => {
    const data = await requestJson<{ accounts: ExternalAccount[] }>('/api/external', {
      token,
    })
    const normalized = data.accounts.map(normalizeAccount)
    setState((prev) => ({
      ...prev,
      externalAccounts: normalized,
    }))
    return normalized
  }

  const refreshTests = async (token: string) => {
    const data = await requestJson<{ tests: TestRecord[] }>('/api/tests', {
      token,
    })
    setState((prev) => ({
      ...prev,
      tests: data.tests,
    }))
  }

  useEffect(() => {
    const bootstrap = async () => {
      const token = loadToken()
      if (!token) {
        setIsBootstrapped(true)
        return
      }

      try {
        const me = await requestJson<{
          user: { id: string; name: string; email: string; role: string; preferences?: unknown }
        }>('/api/auth/me', { token })
        const normalized = normalizeUser(me.user, uiSnapshot.current)
        setCurrentUser(normalized)
        saveUser(normalized)
        setState((prev) => ({
          ...prev,
          ui: {
            theme: normalized.preferences.theme,
            mode: normalized.preferences.mode,
          },
        }))
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSession()
          setIsBootstrapped(true)
          return
        }
        console.error(error)
      }

      try {
        await Promise.all([refreshAccounts(token), refreshTests(token)])
      } catch (error) {
        console.error(error)
      } finally {
        setIsBootstrapped(true)
      }
    }

    void bootstrap()
  }, [])

  const register: Store['register'] = async ({ name, email, password }) => {
    try {
      const data = await requestJson<{
        user: { id: string; name: string; email: string; role: string; preferences?: unknown }
        token: string
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      })
      const normalized = normalizeUser(data.user, state.ui)
      saveToken(data.token)
      saveUser(normalized)
      setCurrentUser(normalized)
      setState((prev) => ({
        ...prev,
        ui: {
          theme: normalized.preferences.theme,
          mode: normalized.preferences.mode,
          fontScale: normalized.preferences.fontScale,
        },
      }))
      await Promise.all([refreshAccounts(data.token), refreshTests(data.token)])
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unable to register.',
      }
    }
  }

  const login: Store['login'] = async ({ email, password }) => {
    try {
      const data = await requestJson<{
        user: { id: string; name: string; email: string; role: string; preferences?: unknown }
        token: string
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      const normalized = normalizeUser(data.user, state.ui)
      saveToken(data.token)
      saveUser(normalized)
      setCurrentUser(normalized)
      setState((prev) => ({
        ...prev,
        ui: {
          theme: normalized.preferences.theme,
          mode: normalized.preferences.mode,
          fontScale: normalized.preferences.fontScale,
        },
      }))
      await Promise.all([refreshAccounts(data.token), refreshTests(data.token)])
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unable to sign in.',
      }
    }
  }

  const logout = () => {
    clearSession()
  }

  const updateProfile: Store['updateProfile'] = async ({ name, email }) => {
    if (!currentUser) {
      return { ok: false, message: 'Not signed in.' }
    }
    const token = loadToken()
    if (!token) {
      return { ok: false, message: 'Missing session token.' }
    }

    try {
      const data = await requestJson<{
        user: { id: string; name: string; email: string; role: string; preferences?: unknown }
      }>('/api/auth/profile', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ name, email }),
      })
      const normalized = normalizeUser(data.user, state.ui)
      setCurrentUser(normalized)
      saveUser(normalized)
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unable to update profile.',
      }
    }
  }

  const updatePassword: Store['updatePassword'] = async ({
    currentPassword,
    nextPassword,
  }) => {
    if (!currentUser) {
      return { ok: false, message: 'Not signed in.' }
    }
    const token = loadToken()
    if (!token) {
      return { ok: false, message: 'Missing session token.' }
    }

    try {
      await requestJson<{ ok: true }>('/api/auth/password', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ currentPassword, nextPassword }),
      })
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unable to update password.',
      }
    }
  }

  const upsertAccount = (next: ExternalAccount) => {
    setState((prev) => ({
      ...prev,
      externalAccounts: prev.externalAccounts.some((item) => item.id === next.id)
        ? prev.externalAccounts.map((item) => (item.id === next.id ? next : item))
        : [...prev.externalAccounts, next],
    }))
  }

  const connectExternalAccount: Store['connectExternalAccount'] = async (payload) => {
    if (!currentUser) {
      return
    }
    const token = loadToken()
    if (!token) {
      return
    }

    try {
      const data = await requestJson<{ account: ExternalAccount }>(
        '/api/external/connect',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            username: payload.username,
            password: payload.password,
            provider: 'test.z7i.in',
          }),
        },
      )
      upsertAccount(normalizeAccount(data.account))
    } catch (error) {
      console.error(error)
    }
  }

  const syncExternalAccount: Store['syncExternalAccount'] = async () => {
    if (!currentUser) {
      return
    }
    const token = loadToken()
    if (!token) {
      return
    }

    const account = state.externalAccounts.find(
      (item) => item.userId === currentUser.id && item.provider === 'test.z7i.in',
    )
    if (!account || account.syncStatus === 'syncing') {
      return
    }

    const optimistic: ExternalAccount = {
      ...account,
      syncStatus: 'syncing',
      syncTotal: 0,
      syncCompleted: 0,
      syncStartedAt: new Date().toISOString(),
      syncFinishedAt: null,
    }
    upsertAccount(optimistic)

    let keepPolling = true
    const pollSync = async () => {
      while (keepPolling) {
        await wait(1500)
        try {
          const accounts = await refreshAccounts(token)
          const refreshed = accounts.find((item) => item.id === account.id)
          if (!refreshed || refreshed.syncStatus !== 'syncing') {
            break
          }
        } catch (error) {
          console.error(error)
          break
        }
      }
    }

    const pollTask = pollSync()
    let syncSucceeded = false
    let stopPollingEarly = true
    try {
      const data = await requestJson<{
        account: ExternalAccount
      }>('/api/external/sync', {
        method: 'POST',
        token,
        body: JSON.stringify({ provider: 'test.z7i.in' }),
      })
      syncSucceeded = true
      upsertAccount(normalizeAccount(data.account))
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        stopPollingEarly = false
      } else {
        console.error(error)
      }
    } finally {
      if (stopPollingEarly) {
        keepPolling = false
      }
      await pollTask
      await refreshAccounts(token)
      if (syncSucceeded) {
        await refreshTests(token)
      }
    }
  }

  const updateAnswerKey: Store['updateAnswerKey'] = async ({
    testId,
    questionId,
    newKey,
  }) => {
    const token = loadToken()
    if (!token) {
      return
    }

    try {
      const data = await requestJson<{ test: TestRecord }>(
        `/api/tests/${testId}/answer-key`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({ questionId, newKey }),
        },
      )
      setState((prev) => ({
        ...prev,
        tests: replaceTest(prev.tests, data.test),
      }))
    } catch (error) {
      console.error(error)
    }
  }

  const updateMarkingScheme: Store['updateMarkingScheme'] = async ({
    testId,
    scheme,
  }) => {
    const token = loadToken()
    if (!token) {
      return
    }

    try {
      const data = await requestJson<{ test: TestRecord }>(
        `/api/tests/${testId}/marking-scheme`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({ scheme }),
        },
      )
      setState((prev) => ({
        ...prev,
        tests: replaceTest(prev.tests, data.test),
      }))
    } catch (error) {
      console.error(error)
    }
  }

  const savePreferences = async (preferences: UserPreferences) => {
    if (!currentUser) {
      return
    }
    const token = loadToken()
    if (!token) {
      return
    }

    const optimistic = { ...currentUser, preferences }
    setCurrentUser(optimistic)
    saveUser(optimistic)
    setState((prev) => ({
      ...prev,
      ui: {
        theme: preferences.theme,
        mode: preferences.mode,
        fontScale: preferences.fontScale,
      },
    }))

    try {
      const data = await requestJson<{
        user: { id: string; name: string; email: string; role: string; preferences?: unknown }
      }>('/api/auth/preferences', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ preferences }),
      })
      const normalized = normalizeUser(data.user, state.ui)
      setCurrentUser(normalized)
      saveUser(normalized)
    } catch (error) {
      console.error(error)
    }
  }

  const setTheme: Store['setTheme'] = (theme) => {
    if (currentUser) {
      void savePreferences({ ...currentUser.preferences, theme })
      return
    }
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, theme },
    }))
  }

  const setMode: Store['setMode'] = (mode) => {
    if (currentUser) {
      void savePreferences({ ...currentUser.preferences, mode })
      return
    }
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, mode },
    }))
  }

  const setFontScale: Store['setFontScale'] = (scale) => {
    const nextScale = clampFontScale(scale)
    if (currentUser) {
      void savePreferences({ ...currentUser.preferences, fontScale: nextScale })
      return
    }
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, fontScale: nextScale },
    }))
  }

  const setAdminOverride: Store['setAdminOverride'] = (enabled) => {
    setAdminOverrideState(enabled)
    saveAdminOverride(enabled)
  }

  const acknowledgeKeyUpdates: Store['acknowledgeKeyUpdates'] = async (testId) => {
    if (!currentUser) {
      return
    }
    const test = state.tests.find((item) => item.id === testId)
    if (!test) {
      return
    }
    const latestKeyUpdate = test.questions.reduce<string | null>((latest, question) => {
      if (!question.lastKeyUpdateTime) {
        return latest
      }
      if (!latest || question.lastKeyUpdateTime > latest) {
        return question.lastKeyUpdateTime
      }
      return latest
    }, null)
    if (!latestKeyUpdate) {
      return
    }

    const updated = {
      ...currentUser.preferences,
      acknowledgedKeyUpdates: {
        ...currentUser.preferences.acknowledgedKeyUpdates,
        [testId]: latestKeyUpdate,
      },
    }
    await savePreferences(updated)
  }

  const isAdmin = adminOverride || currentUser?.role === 'admin'
  const fontScale = currentUser?.preferences.fontScale ?? state.ui.fontScale

  const value = {
    state,
    currentUser,
    isAdmin,
    adminOverride,
    fontScale,
    setAdminOverride,
    setFontScale,
    isBootstrapped,
    register,
    login,
    updateProfile,
    updatePassword,
    logout,
    connectExternalAccount,
    syncExternalAccount,
    updateAnswerKey,
    updateMarkingScheme,
    setTheme,
    setMode,
    acknowledgeKeyUpdates,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useAppStore = () => {
  const ctx = useContext(StoreContext)
  if (!ctx) {
    throw new Error('useAppStore must be used within AppStoreProvider')
  }
  return ctx
}
