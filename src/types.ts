export type AnswerRange = {
  min: number
  max: number
}

export type BonusKey = {
  bonus: true
}

export type MtqRowKey = 'P' | 'Q' | 'R' | 'S'

export type MtqColKey = 'A' | 'B' | 'C' | 'D'

export type MtqAnswerValue = {
  A: MtqRowKey[]
  B: MtqRowKey[]
  C: MtqRowKey[]
  D: MtqRowKey[]
}

export type AnswerValue =
  | string
  | number
  | string[]
  | AnswerRange
  | MtqAnswerValue
  | BonusKey
  | null

export type Question = {
  id: string
  subject: 'PHYSICS' | 'CHEMISTRY' | 'MATHEMATICS' | string
  qtype: 'MCQ' | 'MAQ' | 'VMAQ' | 'NAT' | 'MTQ' | string
  correctAnswer: AnswerValue
  keyUpdate: AnswerValue
  sharedPassageContent: string | null
  questionContent: string
  solutionContent: string | null
  optionContentA: string | null
  optionContentB: string | null
  optionContentC: string | null
  optionContentD: string | null
  mtqStatementP: string | null
  mtqStatementQ: string | null
  mtqStatementR: string | null
  mtqStatementS: string | null
  hasPartial: boolean
  correctMarking: number
  incorrectMarking: number
  unattemptedMarking: number
  markingOverridden: boolean
  questionNumber: number
  lastKeyUpdateTime: string | null
}

export type TestAttempt = {
  id: string
  userId: string
  externalExamId?: string
  title: string
  examDate: string
  calculatedRank?: number | null
  markingScheme?: Record<
    string,
    { correct: number; incorrect: number; unattempted: number }
  > | null
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
  remoteDisplayName: string | null
  status: string
  syncStatus: string
  syncTotal: number
  syncCompleted: number
  syncStartedAt: string | null
  syncFinishedAt: string | null
  lastSyncAt: string | null
  statusMessage: string | null
}
