export type UserRole = 'user' | 'admin'

export type ThemeName = 'ember' | 'ocean' | 'forest' | 'slate'

export type ColorMode = 'light' | 'dark' | 'system'

export type UserPreferences = {
  theme: ThemeName
  mode: ColorMode
  fontScale: number
  acknowledgedKeyUpdates: Record<string, string>
}

export type User = {
  id: string
  name: string
  email: string
  role: UserRole
  preferences: UserPreferences
}

export type ExternalAccountStatus = 'connected' | 'error' | 'disconnected'
export type ExternalAccountSyncStatus = 'idle' | 'syncing' | 'error'

export type ExternalAccount = {
  id: string
  userId: string
  provider: 'test.z7i.in'
  username: string
  status: ExternalAccountStatus
  syncStatus: ExternalAccountSyncStatus
  syncTotal: number
  syncCompleted: number
  syncStartedAt: string | null
  syncFinishedAt: string | null
  lastSyncAt: string | null
  statusMessage?: string
}

export type Subject = 'PHYSICS' | 'CHEMISTRY' | 'MATHEMATICS'

export type QuestionType = 'MCQ' | 'MAQ' | 'VMAQ' | 'NAT'

export type NumericRange = {
  min: number
  max: number
}

export type BonusKey = {
  bonus: true
}

export type AnswerValue =
  | string
  | number
  | NumericRange
  | string[]
  | BonusKey
  | null

export type QuestionRecord = {
  id: string
  subject: Subject
  qtype: QuestionType
  correctAnswer: AnswerValue
  keyUpdate: AnswerValue
  questionContent: string
  optionContentA: string | null
  optionContentB: string | null
  optionContentC: string | null
  optionContentD: string | null
  hasPartial: boolean
  correctMarking: number
  incorrectMarking: number
  unattemptedMarking: number
  questionNumber: number
  lastKeyUpdateTime: string | null
}

export type TestRecord = {
  id: string
  userId: string
  externalExamId?: string
  title: string
  examDate: string
  answers: Record<string, AnswerValue>
  timings: Record<string, number>
  bookmarks: Record<string, boolean>
  questions: QuestionRecord[]
}

export type AppState = {
  externalAccounts: ExternalAccount[]
  tests: TestRecord[]
  ui: {
    theme: ThemeName
    mode: ColorMode
    fontScale: number
  }
}
