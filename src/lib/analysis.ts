import type {
  AnswerValue,
  BonusKey,
  MtqAnswerValue,
  MtqColKey,
  MtqRowKey,
  NumericRange,
  QuestionRecord,
  QuestionType,
  TestRecord,
} from './types'

const MTQ_COL_KEYS: MtqColKey[] = ['A', 'B', 'C', 'D']
const MTQ_ROW_KEYS: MtqRowKey[] = ['P', 'Q', 'R', 'S']

const round = (value: number, digits = 1) =>
  Number(value.toFixed(digits))

const getAccuracy = (correct: number, attempted: number) =>
  attempted === 0 ? 0 : round((correct / attempted) * 100, 1)

const getPercent = (value: number, total: number) =>
  total === 0 ? 0 : round((value / total) * 100, 1)

const getPercentile = (values: number[], percentile: number) => {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  )
  return sorted[index]
}

const isRangeValue = (value: unknown): value is NumericRange =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'min' in value &&
      'max' in value &&
      typeof (value as NumericRange).min === 'number' &&
      typeof (value as NumericRange).max === 'number',
  )

export const isBonusKey = (value: AnswerValue): value is BonusKey =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'bonus' in value &&
      (value as BonusKey).bonus === true,
  )

const normalizeNumericValue = (value: AnswerValue): number | NumericRange | null => {
  if (isBonusKey(value)) {
    return null
  }
  if (typeof value === 'number') {
    return value
  }
  if (isRangeValue(value)) {
    return value.min === value.max ? value.min : value
  }
  if (typeof value === 'string') {
    const trimmed = value.replace(/[---]/g, '-').trim()
    const rangeMatch = trimmed.match(
      /(-?\d+(?:\.\d+)?)\s*(?:to|-)\s*(-?\d+(?:\.\d+)?)/i,
    )
    if (rangeMatch) {
      const min = Number(rangeMatch[1])
      const max = Number(rangeMatch[2])
      if (!Number.isNaN(min) && !Number.isNaN(max)) {
        return min === max ? min : { min, max }
      }
    }
    const numeric = Number(trimmed)
    if (!Number.isNaN(numeric)) {
      return numeric
    }
  }
  return null
}

const splitByOr = (value: string) =>
  value
    .split(/\s+(?:OR)\s+|\s*\|\s*/i)
    .map((item) => item.trim())
    .filter(Boolean)

const toOptionArray = (value: AnswerValue | string): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toUpperCase()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return []
    }
    const normalized = trimmed.toUpperCase()
    if (normalized.includes(',')) {
      return normalized
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    }
    if (/^[A-Z]+$/.test(normalized)) {
      return normalized.split('')
    }
    return [normalized]
  }
  return []
}

const getKeyOptionGroups = (value: AnswerValue): string[][] => {
  if (Array.isArray(value)) {
    return [toOptionArray(value)]
  }
  if (typeof value === 'string') {
    const segments = splitByOr(value)
    if (segments.length === 0) {
      return []
    }
    return segments.map((segment) => toOptionArray(segment))
  }
  return []
}

const getKeyNumericAlternatives = (
  value: AnswerValue,
): Array<number | NumericRange> => {
  if (typeof value === 'string') {
    const segments = splitByOr(value)
    return segments
      .map((segment) => normalizeNumericValue(segment))
      .filter((item): item is number | NumericRange => item !== null)
  }
  const normalized = normalizeNumericValue(value)
  return normalized === null ? [] : [normalized]
}

const isMtqAnswerValue = (value: unknown): value is MtqAnswerValue =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      MTQ_COL_KEYS.every((key) => Array.isArray((value as Record<string, unknown>)[key])),
  )

const normalizeMtqAnswerValue = (value: AnswerValue): MtqAnswerValue | null => {
  if (isBonusKey(value) || !value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const root = value as Record<string, unknown>
  const normalized: MtqAnswerValue = {
    A: [],
    B: [],
    C: [],
    D: [],
  }
  let hasAny = false
  MTQ_COL_KEYS.forEach((colKey) => {
    const raw = root[colKey] ?? root[colKey.toLowerCase()]
    if (!Array.isArray(raw)) {
      return
    }
    normalized[colKey] = Array.from(
      new Set(
        raw
          .map((item) => String(item).trim().toUpperCase())
          .filter((item): item is MtqRowKey =>
            MTQ_ROW_KEYS.includes(item as MtqRowKey),
          ),
      ),
    ).sort((a, b) => MTQ_ROW_KEYS.indexOf(a) - MTQ_ROW_KEYS.indexOf(b))
    if (normalized[colKey].length > 0) {
      hasAny = true
    }
  })
  return hasAny ? normalized : null
}

const getNormalizedMtqValue = (value: AnswerValue) =>
  isMtqAnswerValue(value) ? value : normalizeMtqAnswerValue(value)

const isExactMtqRow = (
  key: MtqAnswerValue | null,
  selected: MtqAnswerValue | null,
  rowKey: MtqColKey,
) => {
  const keyRow = key?.[rowKey] ?? []
  const selectedRow = selected?.[rowKey] ?? []
  return (
    keyRow.length === selectedRow.length &&
    keyRow.every((value, index) => value === selectedRow[index])
  )
}

const scoreMtqQuestion = (
  question: QuestionRecord,
  selected: AnswerValue,
  key: AnswerValue,
) => {
  const normalizedKey = getNormalizedMtqValue(key)
  const normalizedSelected = getNormalizedMtqValue(selected)
  return MTQ_COL_KEYS.reduce((sum, rowKey) => {
    const selectedRow = normalizedSelected?.[rowKey] ?? []
    if (selectedRow.length === 0) {
      return sum + question.unattemptedMarking
    }
    return sum + (isExactMtqRow(normalizedKey, normalizedSelected, rowKey)
      ? question.correctMarking
      : question.incorrectMarking)
  }, 0)
}

export const getQuestionMaxMarks = (question: Pick<QuestionRecord, 'qtype' | 'correctMarking'>) =>
  question.qtype === 'MTQ'
    ? question.correctMarking * MTQ_COL_KEYS.length
    : question.correctMarking

export const getAnswerForQuestion = (
  test: TestRecord,
  question: QuestionRecord,
): AnswerValue => test.answers[question.id] ?? null

export const getTimeForQuestion = (
  test: TestRecord,
  question: QuestionRecord,
): number => test.timings[question.id] ?? 0

const isUnattempted = (value: AnswerValue, qtype: QuestionType) => {
  if (value === null || value === undefined) {
    return true
  }
  if (qtype === 'MAQ' && Array.isArray(value) && value.length === 0) {
    return true
  }
  if (qtype === 'MTQ') {
    const mtq = getNormalizedMtqValue(value)
    return !mtq || MTQ_COL_KEYS.every((rowKey) => mtq[rowKey].length === 0)
  }
  return false
}

const matchesKey = (payload: {
  selected: AnswerValue
  key: AnswerValue
  qtype: QuestionType
}) => {
  const { selected, key, qtype } = payload
  if (isBonusKey(key)) {
    return true
  }
  if (isUnattempted(selected, qtype)) {
    return false
  }

  if (qtype === 'NAT') {
    const selectedNumeric = normalizeNumericValue(selected)
    if (selectedNumeric === null || typeof selectedNumeric !== 'number') {
      return false
    }
    const keyAlternatives = getKeyNumericAlternatives(key)
    if (keyAlternatives.length === 0) {
      return false
    }
    return keyAlternatives.some((option) => {
      if (typeof option === 'number') {
        return selectedNumeric === option
      }
      return selectedNumeric >= option.min && selectedNumeric <= option.max
    })
  }

  if (qtype === 'MTQ') {
    const normalizedKey = getNormalizedMtqValue(key)
    const normalizedSelected = getNormalizedMtqValue(selected)
    if (!normalizedKey || !normalizedSelected) {
      return false
    }
    return MTQ_COL_KEYS.every((rowKey) =>
      isExactMtqRow(normalizedKey, normalizedSelected, rowKey),
    )
  }

  if (qtype === 'MAQ') {
    const selectedOptions = toOptionArray(selected)
    const keyGroups = getKeyOptionGroups(key)
    if (selectedOptions.length === 0 || keyGroups.length === 0) {
      return false
    }
    const selectedSet = new Set(selectedOptions)
    return keyGroups.some((group) => {
      const keySet = new Set(group)
      if (keySet.size === 0) {
        return false
      }
      if (keySet.size !== selectedSet.size) {
        return false
      }
      for (const option of selectedSet) {
        if (!keySet.has(option)) {
          return false
        }
      }
      return true
    })
  }

  const selectedOptions = toOptionArray(selected)
  const keyGroups = getKeyOptionGroups(key)
  if (selectedOptions.length === 0 || keyGroups.length === 0) {
    return false
  }
  return keyGroups.some((group) =>
    group.some((option) => selectedOptions.includes(option)),
  )
}

const computePartialScore = (
  question: QuestionRecord,
  selected: AnswerValue,
  key: AnswerValue,
) => {
  const selectedOptions = toOptionArray(selected)
  if (selectedOptions.length === 0) {
    return question.unattemptedMarking
  }
  const keyGroups = getKeyOptionGroups(key)
  if (keyGroups.length === 0) {
    return question.incorrectMarking
  }

  const selectedSet = new Set(selectedOptions)
  let bestScore = question.incorrectMarking

  keyGroups.forEach((group) => {
    const keyOptions = new Set(group)
    if (keyOptions.size === 0) {
      return
    }
    let hasIncorrect = false
    let correctCount = 0

    for (const option of selectedSet) {
      if (keyOptions.has(option)) {
        correctCount += 1
      } else {
        hasIncorrect = true
      }
    }

    let score = question.incorrectMarking
    if (!hasIncorrect && correctCount === keyOptions.size) {
      score = question.correctMarking
    } else if (!hasIncorrect) {
      score = correctCount
    }
    if (score > bestScore) {
      bestScore = score
    }
  })

  return bestScore
}

export const getQuestionMark = (
  test: TestRecord,
  question: QuestionRecord,
  useOriginalKey = false,
) => {
  const selected = getAnswerForQuestion(test, question)
  const key = useOriginalKey ? question.correctAnswer : question.keyUpdate
  if (isBonusKey(key)) {
    return getQuestionMaxMarks(question)
  }
  if (isUnattempted(selected, question.qtype)) {
    return question.qtype === 'MTQ'
      ? question.unattemptedMarking * MTQ_COL_KEYS.length
      : question.unattemptedMarking
  }

  if (question.qtype === 'MTQ') {
    return scoreMtqQuestion(question, selected, key)
  }

  if (question.qtype === 'MAQ') {
    return computePartialScore(question, selected, key)
  }

  return matchesKey({ selected, key, qtype: question.qtype })
    ? question.correctMarking
    : question.incorrectMarking
}

export const getQuestionStatus = (
  test: TestRecord,
  question: QuestionRecord,
) => {
  const selected = getAnswerForQuestion(test, question)
  if (isBonusKey(question.keyUpdate)) {
    return 'Correct'
  }
  if (isUnattempted(selected, question.qtype)) {
    return 'Unattempted'
  }

  const key = question.keyUpdate
  if (question.qtype === 'MTQ') {
    const normalizedKey = getNormalizedMtqValue(key)
    const normalizedSelected = getNormalizedMtqValue(selected)
    if (!normalizedSelected) {
      return 'Unattempted'
    }
    let exactRows = 0
    let attemptedRows = 0
    MTQ_COL_KEYS.forEach((rowKey) => {
      const row = normalizedSelected[rowKey]
      if (row.length === 0) {
        return
      }
      attemptedRows += 1
      if (isExactMtqRow(normalizedKey, normalizedSelected, rowKey)) {
        exactRows += 1
      }
    })
    if (attemptedRows === 0) {
      return 'Unattempted'
    }
    if (exactRows === MTQ_COL_KEYS.length) {
      return 'Correct'
    }
    if (exactRows > 0) {
      return 'Partial'
    }
    return 'Incorrect'
  }

  if (matchesKey({ selected, key, qtype: question.qtype })) {
    return 'Correct'
  }

  if (question.qtype === 'MAQ') {
    const partial = computePartialScore(question, selected, key)
    if (partial > question.unattemptedMarking && partial < question.correctMarking) {
      return 'Partial'
    }
  }

  return 'Incorrect'
}

export const formatAnswerValue = (value: AnswerValue) => {
  if (value === null || value === undefined) {
    return '-'
  }
  if (isBonusKey(value)) {
    return 'Bonus'
  }
  if (Array.isArray(value)) {
    return value.join(',') || '-'
  }
  if (isMtqAnswerValue(value)) {
    return MTQ_COL_KEYS.map((key) => `${key}:${value[key].join(',') || '-'}`).join(' | ')
  }
  if (isRangeValue(value)) {
    if (value.min === value.max) {
      return String(value.min)
    }
    return `${value.min}-${value.max}`
  }
  return String(value)
}

export const buildAnalysis = (test: TestRecord) => {
  const questions = [...test.questions].sort(
    (a, b) => a.questionNumber - b.questionNumber,
  )

  let attempted = 0
  let correct = 0
  let partial = 0
  let scoreCurrent = 0
  let scoreOriginal = 0
  let totalTime = 0
  let attemptedTime = 0

  const questionSnapshots = questions.map((question) => {
    const selected = getAnswerForQuestion(test, question)
    const status = getQuestionStatus(test, question)
    const timeSpent = getTimeForQuestion(test, question)
    const attemptedFlag =
      isBonusKey(question.keyUpdate) || !isUnattempted(selected, question.qtype)
    if (attemptedFlag) {
      attempted += 1
      attemptedTime += timeSpent
    }
    if (status === 'Correct') {
      correct += 1
    }
    if (status === 'Partial') {
      partial += 1
    }
    scoreCurrent += getQuestionMark(test, question)
    scoreOriginal += getQuestionMark(test, question, true)
    totalTime += timeSpent

    return {
      id: question.id,
      number: question.questionNumber,
      subject: question.subject,
      qtype: question.qtype,
      status,
      time: timeSpent,
      attempted: attemptedFlag,
    }
  })

  const total = questions.length
  const incorrect = Math.max(attempted - correct - partial, 0)
  const unattempted = total - attempted
  const avgTime = total === 0 ? 0 : totalTime / total
  const avgAttemptedTime = attempted === 0 ? 0 : attemptedTime / attempted
  const attemptRate = getPercent(attempted, total)

  const subjectMap = new Map<
    string,
    {
      total: number
      attempted: number
      correct: number
      partial: number
      score: number
      time: number
    }
  >()

  questions.forEach((question) => {
    const selected = getAnswerForQuestion(test, question)
    const status = getQuestionStatus(test, question)
    const entry = subjectMap.get(question.subject) ?? {
      total: 0,
      attempted: 0,
      correct: 0,
      partial: 0,
      score: 0,
      time: 0,
    }

    entry.total += 1
    entry.score += getQuestionMark(test, question)
    entry.time += getTimeForQuestion(test, question)

    if (isBonusKey(question.keyUpdate) || !isUnattempted(selected, question.qtype)) {
      entry.attempted += 1
    }
    if (status === 'Correct') {
      entry.correct += 1
    }
    if (status === 'Partial') {
      entry.partial += 1
    }

    subjectMap.set(question.subject, entry)
  })

  const perSection = Array.from(subjectMap.entries()).map(([subject, data]) => {
    const incorrectCount = Math.max(data.attempted - data.correct - data.partial, 0)
    return {
      id: subject,
      name: subject,
      total: data.total,
      attempted: data.attempted,
      correct: data.correct,
      partial: data.partial,
      accuracy: getAccuracy(data.correct, data.attempted),
      avgTime: round(data.total === 0 ? 0 : data.time / data.total, 1),
      score: data.score,
      unattempted: data.total - data.attempted,
      incorrect: incorrectCount,
    }
  })

  const typeMap = new Map<
    QuestionType,
    {
      total: number
      attempted: number
      correct: number
      partial: number
      time: number
    }
  >()

  questionSnapshots.forEach((item) => {
    const entry = typeMap.get(item.qtype) ?? {
      total: 0,
      attempted: 0,
      correct: 0,
      partial: 0,
      time: 0,
    }
    entry.total += 1
    entry.time += item.time
    if (item.attempted) {
      entry.attempted += 1
    }
    if (item.status === 'Correct') {
      entry.correct += 1
    }
    if (item.status === 'Partial') {
      entry.partial += 1
    }
    typeMap.set(item.qtype, entry)
  })

  const perType = Array.from(typeMap.entries()).map(([qtype, data]) => {
    const incorrectCount = Math.max(data.attempted - data.correct - data.partial, 0)
    return {
      id: qtype,
      name: qtype,
      total: data.total,
      attempted: data.attempted,
      correct: data.correct,
      partial: data.partial,
      accuracy: getAccuracy(data.correct, data.attempted),
      avgTime: round(data.total === 0 ? 0 : data.time / data.total, 1),
      incorrect: incorrectCount,
    }
  })

  const keyChanges = questions.filter(
    (question) => !jsonEquals(question.correctAnswer, question.keyUpdate),
  )
  const latestKeyUpdate = questions.reduce<string | null>((latest, question) => {
    if (!question.lastKeyUpdateTime) {
      return latest
    }
    if (!latest || question.lastKeyUpdateTime > latest) {
      return question.lastKeyUpdateTime
    }
    return latest
  }, null)

  const scoreDelta = scoreCurrent - scoreOriginal

  const baseTime = avgAttemptedTime || avgTime
  const speedThreshold = baseTime * 0.75
  const slowThreshold = baseTime * 1.35
  const fastWrong = questionSnapshots.filter(
    (item) => item.status === 'Incorrect' && item.time < speedThreshold,
  ).length
  const slowWrong = questionSnapshots.filter(
    (item) => item.status === 'Incorrect' && item.time > slowThreshold,
  ).length

  const attemptedSnapshots = questionSnapshots.filter((item) => item.attempted)
  const timeValues = attemptedSnapshots.map((item) => item.time)
  const timeMedian = round(getPercentile(timeValues, 50), 1)
  const timeP75 = round(getPercentile(timeValues, 75), 1)
  const timeMin = timeValues.length === 0 ? 0 : Math.min(...timeValues)
  const timeMax = timeValues.length === 0 ? 0 : Math.max(...timeValues)

  const timeBuckets = [
    { label: '<=30s', min: 0, max: 30 },
    { label: '31-60s', min: 31, max: 60 },
    { label: '1-2m', min: 61, max: 120 },
    { label: '2-3m', min: 121, max: 180 },
    { label: '>3m', min: 181, max: Number.POSITIVE_INFINITY },
  ].map((bucket) => {
    const count = timeValues.filter(
      (time) => time >= bucket.min && time <= bucket.max,
    ).length
    return {
      label: bucket.label,
      count,
      pct: getPercent(count, timeValues.length),
    }
  })

  let longestSuccess = 0
  let longestMiss = 0
  let currentSuccess = 0
  let currentMiss = 0
  questionSnapshots.forEach((item) => {
    const isSuccess = item.status === 'Correct' || item.status === 'Partial'
    if (isSuccess) {
      currentSuccess += 1
      longestSuccess = Math.max(longestSuccess, currentSuccess)
      currentMiss = 0
      return
    }
    currentMiss += 1
    longestMiss = Math.max(longestMiss, currentMiss)
    currentSuccess = 0
  })

  const slowestQuestions = [...attemptedSnapshots]
    .sort((a, b) => b.time - a.time)
    .slice(0, 5)
  const fastestQuestions = [...attemptedSnapshots]
    .sort((a, b) => a.time - b.time)
    .slice(0, 5)
  const fastestIncorrect = attemptedSnapshots
    .filter((item) => item.status === 'Incorrect')
    .sort((a, b) => a.time - b.time)
    .slice(0, 4)

  return {
    total,
    attempted,
    correct,
    partial,
    incorrect,
    unattempted,
    accuracy: getAccuracy(correct, attempted),
    attemptRate,
    avgTime: round(avgTime, 1),
    avgAttemptedTime: round(avgAttemptedTime, 1),
    totalTime,
    attemptedTime,
    perSection,
    perType,
    timeBuckets,
    timeMedian,
    timeP75,
    timeMin,
    timeMax,
    longestSuccess,
    longestMiss,
    slowestQuestions,
    fastestQuestions,
    fastestIncorrect,
    keyChanges,
    latestKeyUpdate,
    scoreOriginal,
    scoreCurrent,
    scoreDelta,
    fastWrong,
    slowWrong,
  }
}

const jsonEquals = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
