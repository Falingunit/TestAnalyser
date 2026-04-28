export type ScrapedSubject = 'PHYSICS' | 'CHEMISTRY' | 'MATHEMATICS'

export type ScrapedQuestionType = 'MCQ' | 'MAQ' | 'VMAQ' | 'NAT' | 'MTQ'

export type ScrapedQuestion = {
  sourceNumber: number
  sourceQtypeRaw: string | null
  subject: ScrapedSubject
  qtype: ScrapedQuestionType
  correctAnswerRaw: unknown | null
  sharedPassageContent: string | null
  questionContent: string
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
}

export type ScrapedAnswer = {
  sourceNumber: number
  selectedAnswerRaw: unknown | null
  correctAnswerRaw: unknown | null
  timeSpentSec?: number
}

export type ScrapedScoreOverview = {
  rank?: number | null
}

export type ScrapedReport = {
  externalExamId: string
  title: string
  examDate: string
  scoreOverview?: ScrapedScoreOverview
  questions?: ScrapedQuestion[]
  answers?: ScrapedAnswer[]
}

export type ScrapeResult = {
  reports: ScrapedReport[]
  warnings: string[]
  remoteDisplayName?: string | null
}

export type ScrapeProgress = {
  completed: number
  total: number
  currentTitle?: string
}
