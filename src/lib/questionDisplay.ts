import type { QuestionRecord, Subject } from './types'

export const subjectDisplayOrder: Subject[] = [
  'PHYSICS',
  'CHEMISTRY',
  'MATHEMATICS',
]

const getSubjectRank = (subject: string) => {
  const idx = subjectDisplayOrder.indexOf(subject as Subject)
  return idx === -1 ? subjectDisplayOrder.length : idx
}

export type DisplayQuestion = {
  question: QuestionRecord
  displayNumber: number
}

export const buildDisplayQuestions = (questions: QuestionRecord[]) => {
  const sorted = [...questions].sort((a, b) => {
    const rankA = getSubjectRank(a.subject)
    const rankB = getSubjectRank(b.subject)
    if (rankA !== rankB) {
      return rankA - rankB
    }
    if (rankA === subjectDisplayOrder.length) {
      const byName = a.subject.localeCompare(b.subject)
      if (byName !== 0) {
        return byName
      }
    }
    return a.questionNumber - b.questionNumber
  })

  return sorted.map((question, index) => ({
    question,
    displayNumber: index + 1,
  }))
}
