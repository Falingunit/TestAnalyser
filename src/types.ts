export type AnswerRange = {
  min: number
  max: number
}

export type BonusKey = {
  bonus: true
}

export type AnswerValue =
  | string
  | number
  | string[]
  | AnswerRange
  | BonusKey
  | null

export type Question = {
  id: string
  subject: 'PHYSICS' | 'CHEMISTRY' | 'MATHEMATICS' | string
  qtype: 'MCQ' | 'MAQ' | 'VMAQ' | 'NAT' | string
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

export type TestAttempt = {
  id: string
  userId: string
  externalExamId?: string
  title: string
  examDate: string
  answers: Record<string, AnswerValue>
  timings: Record<string, number>
  questions: Question[]
}

export type User = {
  id: string
  name: string
  email: string
  role: string
  preferences: Record<string, unknown>
}

export type ExternalAccount = {
  id: string
  userId: string
  provider: string
  username: string
  status: string
  syncStatus: string
  syncTotal: number
  syncCompleted: number
  syncStartedAt: string | null
  syncFinishedAt: string | null
  lastSyncAt: string | null
  statusMessage: string | null
}
