export type ScrapedSubject = 'PHYSICS' | 'CHEMISTRY' | 'MATHEMATICS'

export type ScrapedQuestionType = 'MCQ' | 'MAQ' | 'VMAQ' | 'NAT'

export type ScrapedQuestion = {
  sourceNumber: number
  subject: ScrapedSubject
  qtype: ScrapedQuestionType
  correctAnswerRaw: string | null
  questionContent: string
  optionContentA: string | null
  optionContentB: string | null
  optionContentC: string | null
  optionContentD: string | null
  hasPartial: boolean
  correctMarking: number
  incorrectMarking: number
  unattemptedMarking: number
}

export type ScrapedAnswer = {
  sourceNumber: number
  selectedAnswerRaw: string | null
  correctAnswerRaw: string | null
  timeSpentSec?: number
}

export type ScrapedReport = {
  externalExamId: string
  title: string
  examDate: string
  questions?: ScrapedQuestion[]
  answers?: ScrapedAnswer[]
}

export type ScrapeResult = {
  reports: ScrapedReport[]
  warnings: string[]
}

export type ScrapeProgress = {
  completed: number
  total: number
  currentTitle?: string
}
