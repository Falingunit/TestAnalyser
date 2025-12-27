import type { AnswerRange, AnswerValue, BonusKey, Question, TestAttempt } from './types'

export type AnswerStatus = 'correct' | 'incorrect' | 'partial' | 'unattempted'

const toUpper = (value: string) => value.trim().toUpperCase()

const normalizeArray = (value: string[]) =>
  Array.from(new Set(value.map(toUpper))).sort()

const isAnswerRange = (value: AnswerValue): value is AnswerRange =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof (value as AnswerRange).min === 'number' &&
  typeof (value as AnswerRange).max === 'number'

const isBonusKey = (value: AnswerValue): value is BonusKey =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'bonus' in value &&
      (value as BonusKey).bonus === true,
  )

const isExactMatch = (selected: AnswerValue, correct: AnswerValue) => {
  if (selected === null || correct === null) {
    return selected === correct
  }

  if (typeof selected === 'number' && typeof correct === 'number') {
    return selected === correct
  }

  if (typeof selected === 'string' && typeof correct === 'string') {
    return toUpper(selected) === toUpper(correct)
  }

  if (Array.isArray(selected) && Array.isArray(correct)) {
    const left = normalizeArray(selected)
    const right = normalizeArray(correct)
    return left.length === right.length && left.every((item, idx) => item === right[idx])
  }

  if (isAnswerRange(selected) && isAnswerRange(correct)) {
    return selected.min === correct.min && selected.max === correct.max
  }

  return false
}

const rangeContains = (range: AnswerRange, value: number) =>
  value >= range.min && value <= range.max

const isPartialMatch = (
  selected: AnswerValue,
  correct: AnswerValue,
  question: Question,
) => {
  if (!question.hasPartial) {
    return false
  }
  if (!Array.isArray(selected) || !Array.isArray(correct)) {
    return false
  }
  const selectedSet = new Set(normalizeArray(selected))
  const correctSet = new Set(normalizeArray(correct))
  if (selectedSet.size === 0 || selectedSet.size >= correctSet.size) {
    return false
  }
  for (const item of selectedSet) {
    if (!correctSet.has(item)) {
      return false
    }
  }
  return true
}

export const getAnswerStatus = (
  question: Question,
  selected: AnswerValue,
) => {
  const correct = question.keyUpdate ?? question.correctAnswer
  if (isBonusKey(correct)) {
    return 'correct' satisfies AnswerStatus
  }
  if (selected === null || selected === undefined) {
    return 'unattempted' satisfies AnswerStatus
  }

  if (isAnswerRange(correct)) {
    if (typeof selected === 'number') {
      return rangeContains(correct, selected) ? 'correct' : 'incorrect'
    }
    if (isAnswerRange(selected)) {
      return isExactMatch(selected, correct) ? 'correct' : 'incorrect'
    }
    return 'incorrect'
  }

  if (isAnswerRange(selected) && typeof correct === 'number') {
    return rangeContains(selected, correct) ? 'correct' : 'incorrect'
  }

  if (isExactMatch(selected, correct)) {
    return 'correct' satisfies AnswerStatus
  }

  if (isPartialMatch(selected, correct, question)) {
    return 'partial' satisfies AnswerStatus
  }

  return 'incorrect' satisfies AnswerStatus
}

export const formatAnswer = (value: AnswerValue) => {
  if (value === null || value === undefined) {
    return 'Unattempted'
  }
  if (isBonusKey(value)) {
    return 'Bonus'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'string') {
    return value.trim() || 'Unattempted'
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? normalizeArray(value).join(', ') : 'Unattempted'
  }
  if (isAnswerRange(value)) {
    return value.min === value.max ? String(value.min) : `${value.min} to ${value.max}`
  }
  return 'Unattempted'
}

export const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s'
  }
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins <= 0) {
    return `${secs}s`
  }
  return `${mins}m ${secs}s`
}

export const formatDate = (value: string) => {
  if (!value) {
    return 'Unknown date'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const summarizeTest = (test: TestAttempt) => {
  let correct = 0
  let incorrect = 0
  let partial = 0
  let unattempted = 0
  let score = 0
  let totalTime = 0

  for (const question of test.questions) {
    const selected = test.answers[question.id] ?? null
    const status = getAnswerStatus(question, selected)
    totalTime += test.timings[question.id] ?? 0

    if (status === 'correct') {
      correct += 1
      score += question.correctMarking
      continue
    }
    if (status === 'partial') {
      partial += 1
      continue
    }
    if (status === 'incorrect') {
      incorrect += 1
      score += question.incorrectMarking
      continue
    }
    unattempted += 1
  }

  const total = test.questions.length
  const attempted = total - unattempted
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0
  const avgTime = total > 0 ? Math.round(totalTime / total) : 0

  return {
    total,
    attempted,
    correct,
    incorrect,
    partial,
    unattempted,
    score,
    accuracy,
    avgTime,
  }
}

export const subjectBreakdown = (test: TestAttempt) => {
  const bySubject = new Map<
    string,
    {
      total: number
      attempted: number
      correct: number
      incorrect: number
      partial: number
      time: number
    }
  >()

  for (const question of test.questions) {
    const entry =
      bySubject.get(question.subject) ??
      {
        total: 0,
        attempted: 0,
        correct: 0,
        incorrect: 0,
        partial: 0,
        time: 0,
      }
    const selected = test.answers[question.id] ?? null
    const status = getAnswerStatus(question, selected)

    entry.total += 1
    entry.time += test.timings[question.id] ?? 0
    if (status !== 'unattempted') {
      entry.attempted += 1
    }
    if (status === 'correct') {
      entry.correct += 1
    } else if (status === 'partial') {
      entry.partial += 1
    } else if (status === 'incorrect') {
      entry.incorrect += 1
    }

    bySubject.set(question.subject, entry)
  }

  return Array.from(bySubject.entries()).map(([subject, stats]) => {
    const accuracy =
      stats.attempted > 0
        ? Math.round((stats.correct / stats.attempted) * 100)
        : 0
    return { subject, ...stats, accuracy }
  })
}
