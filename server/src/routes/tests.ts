import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import type { ScrapeProgress } from '../scraper/types.js'
import { syncExternalAccount } from '../services/syncService.js'
import { decryptSecret } from '../utils/crypto.js'
import {
  deleteTemporaryQuestionImages,
  finalizeQuestionContentAssets,
  hasVisibleHtmlContent,
  saveTemporaryQuestionImage,
} from '../utils/questionAssets.js'

const router = Router()

const parseStoredJson = (value: string | null) => {
  if (value === null) {
    return null
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

const resolveQuestionKey = (question: {
  keyUpdate: string | null
  correctAnswer: string
}) => {
  const updated = parseStoredJson(question.keyUpdate)
  return updated ?? parseStoredJson(question.correctAnswer)
}

const getKeyOptionGroups = (value: unknown): string[][] => {
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

const getQuestionMarkForAnswer = (
  question: {
    qtype: string
    correctAnswer: string
    keyUpdate: string | null
    correctMarking: number
    incorrectMarking: number
    unattemptedMarking: number
  },
  selected: unknown,
) => {
  const key = resolveQuestionKey(question)
  if (isBonusKey(key)) {
    return question.correctMarking
  }
  if (isUnattemptedAnswer(selected, question.qtype)) {
    return question.unattemptedMarking
  }

  if (question.qtype === 'NAT') {
    return isNumericCorrect(selected, key)
      ? question.correctMarking
      : question.incorrectMarking
  }

  if (question.qtype === 'MAQ') {
    const selectedOptions = toOptionArray(selected)
    if (selectedOptions.length === 0) {
      return question.unattemptedMarking
    }
    const selectedSet = new Set(selectedOptions)
    const keyGroups = getKeyOptionGroups(key)
    if (keyGroups.length === 0) {
      return question.incorrectMarking
    }
    let bestScore = question.incorrectMarking
    keyGroups.forEach((group) => {
      const keySet = new Set(group)
      if (keySet.size === 0) {
        return
      }
      let hasIncorrect = false
      let correctCount = 0
      for (const option of selectedSet) {
        if (keySet.has(option)) {
          correctCount += 1
        } else {
          hasIncorrect = true
        }
      }
      let score = question.incorrectMarking
      if (!hasIncorrect && correctCount === keySet.size) {
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

  const selectedOptions = toOptionArray(selected)
  if (selectedOptions.length === 0) {
    return question.unattemptedMarking
  }
  const keyGroups = getKeyOptionGroups(key)
  if (keyGroups.length === 0) {
    return question.incorrectMarking
  }
  const isCorrect = keyGroups.some((group) =>
    group.some((option) => selectedOptions.includes(option)),
  )
  return isCorrect ? question.correctMarking : question.incorrectMarking
}

const buildCalculatedRankByAttemptId = (
  attempts: Array<{
    id: string
    examId: string
    userId: string
    answers: string
  }>,
  questionsByExam: Map<
    string,
    Array<{
      qtype: string
      correctAnswer: string
      keyUpdate: string | null
      correctMarking: number
      incorrectMarking: number
      unattemptedMarking: number
      id: string
    }>
  >,
  participantKeyByUserId: Map<string, string>,
) => {
  const scoresByExam = new Map<
    string,
    Array<{ id: string; score: number; participantKey: string }>
  >()
  attempts.forEach((attempt) => {
    const questions = questionsByExam.get(attempt.examId) ?? []
    if (questions.length === 0) {
      return
    }
    const participantKey =
      participantKeyByUserId.get(attempt.userId) ?? `user:${attempt.userId}`
    const parsed = parseStoredJson(attempt.answers)
    const answers =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {}
    const score = questions.reduce((sum, question) => {
      const selected = answers[question.id]
      return sum + getQuestionMarkForAnswer(question, selected)
    }, 0)
    const current = scoresByExam.get(attempt.examId) ?? []
    current.push({ id: attempt.id, score, participantKey })
    scoresByExam.set(attempt.examId, current)
  })

  const rankByAttemptId = new Map<string, number>()
  scoresByExam.forEach((entries) => {
    const bestScoreByParticipant = new Map<string, number>()
    entries.forEach((entry) => {
      const current = bestScoreByParticipant.get(entry.participantKey)
      if (current === undefined || entry.score > current) {
        bestScoreByParticipant.set(entry.participantKey, entry.score)
      }
    })
    const participantScores = Array.from(bestScoreByParticipant.values()).sort(
      (a, b) => b - a,
    )
    const rankByScore = new Map<number, number>()
    participantScores.forEach((score, index) => {
      if (!rankByScore.has(score)) {
        // Competition ranking: ties share rank, and next rank skips positions.
        rankByScore.set(score, index + 1)
      }
    })
    entries.forEach((entry) => {
      const participantBest = bestScoreByParticipant.get(entry.participantKey) ?? entry.score
      rankByAttemptId.set(entry.id, rankByScore.get(participantBest) ?? 1)
    })
  })
  return rankByAttemptId
}

const serializeJson = (value: unknown) => JSON.stringify(value ?? null)

const normalizeTag = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const parseTagList = (value: unknown) => {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\s+/)
      : []
  const deduped = new Set<string>()
  raw.forEach((item) => {
    if (typeof item !== 'string') {
      return
    }
    const normalized = normalizeTag(item)
    if (!normalized) {
      return
    }
    deduped.add(normalized)
  })
  return Array.from(deduped)
}

const parseAttemptQuestionTags = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, string[]>
  }

  const result: Record<string, string[]> = {}
  Object.entries(value as Record<string, unknown>).forEach(([questionId, tags]) => {
    const normalized = parseTagList(tags)
    if (normalized.length > 0) {
      result[questionId] = normalized
    }
  })
  return result
}

const serializeAttempt = (
  attempt: {
    id: string
    userId: string
    answers: string
    timings: string
    bookmarks: string
    questionTags: string
    rank: number | null
    exam: {
      id: string
      externalExamId: string | null
      title: string
      examDate: string
      markingScheme: string | null
      questions: Array<{
        id: string
        sourceQtypeRaw: string | null
        subject: string
        globalTags: string
        qtype: string
        correctAnswer: string
        keyUpdate: string | null
        questionContent: string
        solutionContent?: string | null
        optionContentA: string | null
        optionContentB: string | null
        optionContentC: string | null
        optionContentD: string | null
        hasPartial: boolean
        correctMarking: number
        incorrectMarking: number
        unattemptedMarking: number
        markingOverridden: boolean
        questionNumber: number
        lastKeyUpdateTime: Date | null
      }>
    }
  },
  calculatedRank: number | null = null,
  peerTimings: Record<string, number> = {},
  peerAnswerStats: Record<
    string,
    {
      total: number
      unattempted: number
      correct: number
      incorrect: number
      options: Record<string, number>
    }
  > = {},
) => {
  const sortedQuestions = [...attempt.exam.questions].sort(
    (a, b) => a.questionNumber - b.questionNumber,
  )
  const answers = parseStoredJson(attempt.answers) ?? {}
  const timings = parseStoredJson(attempt.timings) ?? {}
  const rawBookmarks = parseStoredJson(attempt.bookmarks)
  const bookmarks =
    rawBookmarks && typeof rawBookmarks === 'object'
      ? (rawBookmarks as Record<string, boolean>)
      : {}
  const questionTags = parseAttemptQuestionTags(parseStoredJson(attempt.questionTags))
  const settings = parseExamSettings(parseStoredJson(attempt.exam.markingScheme))

  return {
    id: attempt.id,
    userId: attempt.userId,
    externalExamId: attempt.exam.externalExamId ?? undefined,
    title: attempt.exam.title,
    examDate: attempt.exam.examDate,
    rank: attempt.rank ?? null,
    calculatedRank,
    markingScheme: Object.fromEntries(settings.markingScheme.entries()),
    questionTypeMapping: settings.questionTypeMapping,
    answers,
    timings,
    peerTimings,
    peerAnswerStats,
    bookmarks,
    questions: sortedQuestions.map((question) => ({
      id: question.id,
      sourceQtypeRaw: question.sourceQtypeRaw,
      subject: question.subject,
      tags: questionTags[question.id] ?? [],
      lockedTags: parseTagList(parseStoredJson(question.globalTags)),
      qtype: question.qtype,
      correctAnswer: parseStoredJson(question.correctAnswer),
      keyUpdate: parseStoredJson(question.keyUpdate),
      questionContent: question.questionContent,
      solutionContent: question.solutionContent ?? null,
      optionContentA: question.optionContentA,
      optionContentB: question.optionContentB,
      optionContentC: question.optionContentC,
      optionContentD: question.optionContentD,
      hasPartial: question.hasPartial,
      correctMarking: question.correctMarking,
      incorrectMarking: question.incorrectMarking,
      unattemptedMarking: question.unattemptedMarking,
      markingOverridden: question.markingOverridden,
      questionNumber: question.questionNumber,
      lastKeyUpdateTime: question.lastKeyUpdateTime
        ? question.lastKeyUpdateTime.toISOString()
        : null,
    })),
  }
}

const buildPeerTimings = (attempts: Array<{ timings: string }>) => {
  const totals = new Map<string, { sum: number; count: number }>()
  attempts.forEach((attempt) => {
    const parsed = parseStoredJson(attempt.timings)
    if (!parsed || typeof parsed !== 'object') {
      return
    }
    Object.entries(parsed as Record<string, unknown>).forEach(([questionId, value]) => {
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0
      const current = totals.get(questionId) ?? { sum: 0, count: 0 }
      totals.set(questionId, {
        sum: current.sum + numeric,
        count: current.count + 1,
      })
    })
  })

  const result: Record<string, number> = {}
  totals.forEach((data, questionId) => {
    if (data.count > 0) {
      result[questionId] = Math.round(data.sum / data.count)
    }
  })
  return result
}

const splitByOr = (value: string) =>
  value
    .split(/\s+(?:OR)\s+|\s*\|\s*/i)
    .map((item) => item.trim())
    .filter(Boolean)

const isRangeValue = (value: unknown): value is { min: number; max: number } =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'min' in value &&
      'max' in value &&
      typeof (value as { min?: unknown }).min === 'number' &&
      typeof (value as { max?: unknown }).max === 'number',
  )

const normalizeNumericValue = (value: unknown): number | { min: number; max: number } | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (isRangeValue(value)) {
    return value.min === value.max ? value.min : value
  }
  if (typeof value === 'string') {
    const trimmed = value.replace(/[---]/g, '-').trim()
    if (!trimmed) {
      return null
    }
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

const getKeyNumericAlternatives = (value: unknown) => {
  if (typeof value === 'string') {
    const segments = splitByOr(value)
    return segments
      .map((segment) => normalizeNumericValue(segment))
      .filter((item): item is number | { min: number; max: number } => item !== null)
  }
  const normalized = normalizeNumericValue(value)
  return normalized === null ? [] : [normalized]
}

const toOptionArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toUpperCase()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const segments = splitByOr(value)
    if (segments.length === 0) {
      return []
    }
    return segments.flatMap((segment) => {
      const normalized = segment.trim().toUpperCase()
      if (!normalized) {
        return []
      }
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
    })
  }
  return []
}

const isBonusKey = (value: unknown) =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'bonus' in value &&
      (value as { bonus?: unknown }).bonus === true,
  )

const isNumericCorrect = (selected: unknown, key: unknown) => {
  if (isBonusKey(key)) {
    return true
  }
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

const isUnattemptedAnswer = (value: unknown, qtype: string) => {
  if (value === null || value === undefined) {
    return true
  }
  if (qtype === 'MAQ' && Array.isArray(value) && value.length === 0) {
    return true
  }
  return false
}

const buildPeerAnswerStatsByExam = (
  attempts: Array<{ examId: string; answers: string }>,
  questionsByExam: Map<
    string,
    Array<{
      id: string
      qtype: string
      key: unknown
      correctMarking: number
      incorrectMarking: number
      unattemptedMarking: number
    }>
  >,
) => {
  const attemptsByExam = new Map<string, Array<{ answers: string }>>()
  attempts.forEach((attempt) => {
    const current = attemptsByExam.get(attempt.examId) ?? []
    current.push({ answers: attempt.answers })
    attemptsByExam.set(attempt.examId, current)
  })

  const result = new Map<
    string,
    Record<
      string,
      {
        total: number
        unattempted: number
        correct: number
        incorrect: number
        options: Record<string, number>
      }
    >
  >()

  attemptsByExam.forEach((examAttempts, examId) => {
    const questions = questionsByExam.get(examId) ?? []
    if (questions.length === 0) {
      result.set(examId, {})
      return
    }

    const stats: Record<
      string,
      {
        total: number
        unattempted: number
        correct: number
        incorrect: number
        options: Record<string, number>
      }
    > = {}
    questions.forEach((question) => {
      stats[question.id] = {
        total: 0,
        unattempted: 0,
        correct: 0,
        incorrect: 0,
        options: {},
      }
    })

    examAttempts.forEach((attempt) => {
      const parsed = parseStoredJson(attempt.answers)
      const answers =
        parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>)
          : {}

      const totalScore = questions.reduce((sum, question) => {
        const selected = answers[question.id]
        return (
          sum +
          getQuestionMarkForAnswer(
            {
              qtype: question.qtype,
              correctAnswer: serializeJson(question.key),
              keyUpdate: null,
              correctMarking: question.correctMarking,
              incorrectMarking: question.incorrectMarking,
              unattemptedMarking: question.unattemptedMarking,
            },
            selected,
          )
        )
      }, 0)
      if (totalScore <= 0) {
        return
      }

      questions.forEach((question) => {
        const entry =
          stats[question.id] ?? {
            total: 0,
            unattempted: 0,
            correct: 0,
            incorrect: 0,
            options: {},
          }
        entry.total += 1
        const value = answers[question.id]
        if (isUnattemptedAnswer(value, question.qtype)) {
          entry.unattempted += 1
          stats[question.id] = entry
          return
        }
        const selections = toOptionArray(value)
        selections.forEach((option) => {
          entry.options[option] = (entry.options[option] ?? 0) + 1
        })
        if (question.qtype === 'NAT') {
          if (isNumericCorrect(value, question.key)) {
            entry.correct += 1
          } else {
            entry.incorrect += 1
          }
        }
        stats[question.id] = entry
      })
    })

    result.set(examId, stats)
  })

  return result
}

const buildPeerTimingsByExam = (
  attempts: Array<{ examId: string; timings: string }>,
) => {
  const totalsByExam = new Map<string, Map<string, { sum: number; count: number }>>()
  attempts.forEach((attempt) => {
    const parsed = parseStoredJson(attempt.timings)
    if (!parsed || typeof parsed !== 'object') {
      return
    }
    const examTotals =
      totalsByExam.get(attempt.examId) ?? new Map<string, { sum: number; count: number }>()
    Object.entries(parsed as Record<string, unknown>).forEach(([questionId, value]) => {
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0
      const current = examTotals.get(questionId) ?? { sum: 0, count: 0 }
      examTotals.set(questionId, {
        sum: current.sum + numeric,
        count: current.count + 1,
      })
    })
    totalsByExam.set(attempt.examId, examTotals)
  })

  const result = new Map<string, Record<string, number>>()
  totalsByExam.forEach((totals, examId) => {
    const averages: Record<string, number> = {}
    totals.forEach((data, questionId) => {
      if (data.count > 0) {
        averages[questionId] = Math.round(data.sum / data.count)
      }
    })
    result.set(examId, averages)
  })
  return result
}

const fetchPeerTimingsForExam = async (examId: string, userId: string) => {
  const otherAttempts = await prisma.attempt.findMany({
    where: { examId, userId: { not: userId } },
    select: { timings: true },
  })
  return buildPeerTimings(otherAttempts)
}

const fetchPeerAnswerStatsForExam = async (
  examId: string,
  userId: string,
  questions: Array<{
    id: string
    qtype: string
    key: unknown
    correctMarking: number
    incorrectMarking: number
    unattemptedMarking: number
  }>,
) => {
  const otherAttempts = await prisma.attempt.findMany({
    where: { examId, userId: { not: userId } },
    select: { answers: true },
  })
  const questionMap = new Map<
    string,
    Array<{
      id: string
      qtype: string
      key: unknown
      correctMarking: number
      incorrectMarking: number
      unattemptedMarking: number
    }>
  >([[examId, questions]])
  const statsByExam = buildPeerAnswerStatsByExam(
    otherAttempts.map((attempt) => ({
      examId,
      answers: attempt.answers,
    })),
    questionMap,
  )
  return statsByExam.get(examId) ?? {}
}

const buildParticipantKeyByUserId = async (userIds: string[]) => {
  if (userIds.length === 0) {
    return new Map<string, string>()
  }
  const linkedAccounts = await prisma.externalAccount.findMany({
    where: {
      provider: 'test.z7i.in',
      userId: { in: userIds },
    },
    select: { userId: true, username: true },
  })
  const participantKeyByUserId = new Map<string, string>()
  linkedAccounts.forEach((account) => {
    participantKeyByUserId.set(
      account.userId,
      `external:test.z7i.in:${account.username}`,
    )
  })
  return participantKeyByUserId
}

const fetchCalculatedRankForAttempt = async (
  payload: {
    attemptId: string
    examId: string
    questions: Array<{
      qtype: string
      correctAnswer: string
      keyUpdate: string | null
      correctMarking: number
      incorrectMarking: number
      unattemptedMarking: number
      id: string
    }>
  },
) => {
  const attemptsForRank = await prisma.attempt.findMany({
    where: { examId: payload.examId },
    select: { id: true, examId: true, userId: true, answers: true },
  })
  const userIds = Array.from(new Set(attemptsForRank.map((attempt) => attempt.userId)))
  const participantKeyByUserId = await buildParticipantKeyByUserId(userIds)
  const rankByAttemptId = buildCalculatedRankByAttemptId(
    attemptsForRank,
    new Map([[payload.examId, payload.questions]]),
    participantKeyByUserId,
  )
  return rankByAttemptId.get(payload.attemptId) ?? null
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const ADMIN_EMAILS = new Set([
  'spssabaris@gmail.com',
  'sbaniruddh1@gmail.com',
  'testing@gmail.com',
])

const toSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const isAdminRole = (role: unknown) =>
  typeof role === 'string' && role.trim().toLowerCase() === 'admin'

const getRequestBaseUrl = (req: AuthRequest) =>
  `${req.protocol}://${req.get('host')}`

const requireAdminUser = async (req: AuthRequest) => {
  if (!req.user) {
    return { ok: false as const, status: 401, error: 'Unauthorized.' }
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { email: true, role: true },
  })
  if (!user) {
    return { ok: false as const, status: 404, error: 'User not found.' }
  }

  if (isAdminRole(user.role) || ADMIN_EMAILS.has(user.email.toLowerCase())) {
    return { ok: true as const, user }
  }

  return { ok: false as const, status: 403, error: 'Admin access required.' }
}

const normalizeHtmlField = (value: unknown) => {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const toFiniteInteger = (value: unknown) => {
  const parsed = toFiniteNumber(value)
  if (parsed === null || !Number.isInteger(parsed)) {
    return null
  }
  return parsed
}

const QUESTION_TYPES = ['MCQ', 'MAQ', 'NAT', 'VMAQ'] as const

const isQuestionType = (value: unknown): value is (typeof QUESTION_TYPES)[number] =>
  typeof value === 'string' && QUESTION_TYPES.includes(value as (typeof QUESTION_TYPES)[number])

const getDefaultMarkingForType = (qtype: (typeof QUESTION_TYPES)[number]) => {
  switch (qtype) {
    case 'VMAQ':
      return { correct: 3, incorrect: -1, unattempted: 0 }
    case 'MAQ':
      return { correct: 4, incorrect: -2, unattempted: 0 }
    case 'NAT':
      return { correct: 4, incorrect: -1, unattempted: 0 }
    default:
      return { correct: 4, incorrect: -1, unattempted: 0 }
  }
}

const applyStoredQuestionTypeMapping = (
  sourceQtypeRaw: string | null | undefined,
  fallbackQtype: string,
  mapping: Record<string, string>,
) => {
  const normalizedSource =
    typeof sourceQtypeRaw === 'string' ? sourceQtypeRaw.trim().toUpperCase() : ''
  if (normalizedSource && mapping[normalizedSource] && isQuestionType(mapping[normalizedSource])) {
    return mapping[normalizedSource]
  }
  return isQuestionType(fallbackQtype) ? fallbackQtype : 'MCQ'
}

const parseQuestionTypeMapping = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return {} as Record<string, string>
  }

  const mapping: Record<string, string> = {}
  Object.entries(value as Record<string, unknown>).forEach(([key, rawValue]) => {
    const normalizedKey = key.trim().toUpperCase()
    if (!normalizedKey || !isQuestionType(rawValue)) {
      return
    }
    mapping[normalizedKey] = rawValue
  })
  return mapping
}

const parseMarkingScheme = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return new Map<string, { correct: number; incorrect: number; unattempted: number }>()
  }

  const entries = new Map<string, { correct: number; incorrect: number; unattempted: number }>()
  for (const [key, payload] of Object.entries(value as Record<string, unknown>)) {
    if (!payload || typeof payload !== 'object') {
      continue
    }
    const raw = payload as {
      correct?: unknown
      incorrect?: unknown
      unattempted?: unknown
    }
    const correct = toFiniteInteger(raw.correct)
    const incorrect = toFiniteInteger(raw.incorrect)
    const unattempted = toFiniteInteger(raw.unattempted)
    if (correct === null || incorrect === null || unattempted === null) {
      continue
    }
    entries.set(key, { correct, incorrect, unattempted })
  }

  return entries
}

const parseExamSettings = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return {
      markingScheme: new Map<
        string,
        { correct: number; incorrect: number; unattempted: number }
      >(),
      questionTypeMapping: {} as Record<string, string>,
    }
  }

  const root = value as Record<string, unknown>
  const hasNestedSettings =
    (root.markingScheme && typeof root.markingScheme === 'object') ||
    (root.questionTypeMapping && typeof root.questionTypeMapping === 'object')

  if (!hasNestedSettings) {
    return {
      markingScheme: parseMarkingScheme(value),
      questionTypeMapping: {} as Record<string, string>,
    }
  }

  return {
    markingScheme: parseMarkingScheme(root.markingScheme),
    questionTypeMapping: parseQuestionTypeMapping(root.questionTypeMapping),
  }
}

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const attempts = await prisma.attempt.findMany({
      where: { userId: req.user.userId },
      include: {
        exam: { include: { questions: true } },
      },
    })

    const examIds = Array.from(new Set(attempts.map((attempt) => attempt.examId)))
    const questionsByExam = new Map<
      string,
      Array<{
        qtype: string
        correctAnswer: string
        keyUpdate: string | null
        correctMarking: number
        incorrectMarking: number
        unattemptedMarking: number
        id: string
      }>
    >()
    attempts.forEach((attempt) => {
      questionsByExam.set(attempt.examId, attempt.exam.questions)
    })
    const attemptsForRank =
      examIds.length === 0
        ? []
        : await prisma.attempt.findMany({
            where: { examId: { in: examIds } },
            select: { id: true, examId: true, userId: true, answers: true },
          })
    const rankUserIds = Array.from(
      new Set(attemptsForRank.map((attempt) => attempt.userId)),
    )
    const participantKeyByUserId = await buildParticipantKeyByUserId(rankUserIds)
    const calculatedRankByAttemptId = buildCalculatedRankByAttemptId(
      attemptsForRank,
      questionsByExam,
      participantKeyByUserId,
    )
    const otherAttempts =
      examIds.length === 0
        ? []
        : await prisma.attempt.findMany({
            where: {
              examId: { in: examIds },
              userId: { not: req.user.userId },
            },
            select: { examId: true, timings: true, answers: true },
          })
    const peerTimingsByExam = buildPeerTimingsByExam(otherAttempts)
    const questionsForPeerByExam = new Map<
      string,
      Array<{
        id: string
        qtype: string
        key: unknown
        correctMarking: number
        incorrectMarking: number
        unattemptedMarking: number
      }>
    >()
    attempts.forEach((attempt) => {
      questionsForPeerByExam.set(
        attempt.examId,
        attempt.exam.questions.map((question) => ({
          id: question.id,
          qtype: question.qtype,
          key: resolveQuestionKey(question),
          correctMarking: question.correctMarking,
          incorrectMarking: question.incorrectMarking,
          unattemptedMarking: question.unattemptedMarking,
        })),
      )
    })
    const peerAnswerStatsByExam = buildPeerAnswerStatsByExam(
      otherAttempts.map((attempt) => ({
        examId: attempt.examId,
        answers: attempt.answers,
      })),
      questionsForPeerByExam,
    )

    return res.json({
      tests: attempts.map((attempt) =>
        serializeAttempt(
          attempt,
          calculatedRankByAttemptId.get(attempt.id) ?? null,
          peerTimingsByExam.get(attempt.examId) ?? {},
          peerAnswerStatsByExam.get(attempt.examId) ?? {},
        ),
      ),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }
    const attemptId = toSingleParam(req.params.id)
    if (!isNonEmptyString(attemptId)) {
      return res.status(400).json({ error: 'Invalid test id.' })
    }

    const attempt = await prisma.attempt.findFirst({
      where: { id: attemptId, userId: req.user.userId },
      include: {
        exam: { include: { questions: true } },
      },
    })

    if (!attempt) {
      return res.status(404).json({ error: 'Test not found.' })
    }

    const peerTimings = await fetchPeerTimingsForExam(
      attempt.examId,
      req.user.userId,
    )
    const calculatedRank = await fetchCalculatedRankForAttempt({
      attemptId: attempt.id,
      examId: attempt.examId,
      questions: attempt.exam.questions,
    })
    const peerAnswerStats = await fetchPeerAnswerStatsForExam(
      attempt.examId,
      req.user.userId,
      attempt.exam.questions.map((question) => ({
        id: question.id,
        qtype: question.qtype,
        key: resolveQuestionKey(question),
        correctMarking: question.correctMarking,
        incorrectMarking: question.incorrectMarking,
        unattemptedMarking: question.unattemptedMarking,
      })),
    )
    return res.json({
      test: serializeAttempt(
        attempt,
        calculatedRank,
        peerTimings,
        peerAnswerStats,
      ),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id/leaderboard', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }
    const attemptId = toSingleParam(req.params.id)
    if (!isNonEmptyString(attemptId)) {
      return res.status(400).json({ error: 'Invalid test id.' })
    }

    const attempt = await prisma.attempt.findFirst({
      where: { id: attemptId, userId: req.user.userId },
      include: {
        exam: { include: { questions: true } },
      },
    })
    if (!attempt) {
      return res.status(404).json({ error: 'Test not found.' })
    }

    const examAttempts = await prisma.attempt.findMany({
      where: { examId: attempt.examId },
      include: {
        exam: { include: { questions: true } },
      },
    })
    const userIds = Array.from(new Set(examAttempts.map((item) => item.userId)))
    const participantKeyByUserId = await buildParticipantKeyByUserId(userIds)
    const rankByAttemptId = buildCalculatedRankByAttemptId(
      examAttempts.map((item) => ({
        id: item.id,
        examId: item.examId,
        userId: item.userId,
        answers: item.answers,
      })),
      new Map([[attempt.examId, attempt.exam.questions]]),
      participantKeyByUserId,
    )

    const scoreByAttemptId = new Map<string, number>()
    const totalScore = attempt.exam.questions.reduce(
      (sum, question) => sum + question.correctMarking,
      0,
    )
    examAttempts.forEach((item) => {
      const parsed = parseStoredJson(item.answers)
      const answers =
        parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>)
          : {}
      const score = attempt.exam.questions.reduce((sum, question) => {
        const selected = answers[question.id]
        return sum + getQuestionMarkForAnswer(question, selected)
      }, 0)
      scoreByAttemptId.set(item.id, score)
    })

    const aggregated = new Map<
      string,
      {
        attempt: typeof examAttempts[number]
        score: number
        rank: number
        attemptCount: number
      }
    >()

    examAttempts.forEach((item) => {
      const participantKey =
        participantKeyByUserId.get(item.userId) ?? `user:${item.userId}`
      const score = scoreByAttemptId.get(item.id) ?? 0
      if (score <= 0) {
        return
      }
      const rank = rankByAttemptId.get(item.id) ?? 1
      const current = aggregated.get(participantKey)
      if (!current) {
        aggregated.set(participantKey, {
          attempt: item,
          score,
          rank,
          attemptCount: 1,
        })
        return
      }
      current.attemptCount += 1
      if (score > current.score) {
        aggregated.set(participantKey, {
          attempt: item,
          score,
          rank,
          attemptCount: current.attemptCount,
        })
      }
    })

    const currentParticipantKey =
      participantKeyByUserId.get(req.user.userId) ?? `user:${req.user.userId}`
    const externalUsernames = Array.from(aggregated.keys())
      .filter((key) => key.startsWith('external:test.z7i.in:'))
      .map((key) => key.replace('external:test.z7i.in:', ''))
    const linkedLocalAccounts =
      externalUsernames.length === 0
        ? []
        : await prisma.externalAccount.findMany({
            where: {
              provider: 'test.z7i.in',
              username: { in: externalUsernames },
            },
            select: {
              username: true,
              user: {
                select: {
                  name: true,
                  email: true,
                  createdAt: true,
                },
              },
            },
          })
    const nameMetaByParticipantKey = new Map<
      string,
      { displayName: string; akaNames: string[] }
    >()
    const localAccountsByUsername = new Map<
      string,
      Array<{ name: string; email: string; createdAt: Date }>
    >()
    linkedLocalAccounts.forEach((account) => {
      const current = localAccountsByUsername.get(account.username) ?? []
      current.push({
        name: account.user.name,
        email: account.user.email,
        createdAt: account.user.createdAt,
      })
      localAccountsByUsername.set(account.username, current)
    })
    localAccountsByUsername.forEach((accounts, username) => {
      const sorted = [...accounts].sort((a, b) => {
        if (a.createdAt.getTime() !== b.createdAt.getTime()) {
          return a.createdAt.getTime() - b.createdAt.getTime()
        }
        return a.email.localeCompare(b.email)
      })
      const normalizeIdentity = (payload: { name: string; email: string }) => {
        const base = payload.name.trim() || payload.email.trim()
        return base || username
      }
      const ordered = sorted.map((item) => normalizeIdentity(item))
      const dedupedOrdered: string[] = []
      ordered.forEach((item) => {
        if (!dedupedOrdered.includes(item)) {
          dedupedOrdered.push(item)
        }
      })
      nameMetaByParticipantKey.set(`external:test.z7i.in:${username}`, {
        displayName: dedupedOrdered[0] ?? username,
        akaNames: dedupedOrdered.slice(1),
      })
    })
    const leaderboard = Array.from(aggregated.entries())
      .map(([participantKey, payload]) => {
        const testPayload = serializeAttempt(
          payload.attempt,
          payload.rank,
          {},
          {},
        )
        const externalUsername = participantKey.startsWith('external:test.z7i.in:')
          ? participantKey.replace('external:test.z7i.in:', '')
          : participantKey
        const labelMeta = nameMetaByParticipantKey.get(participantKey) ?? {
          displayName: externalUsername,
          akaNames: [],
        }
        return {
          participantKey,
          externalUsername,
          displayName: labelMeta.displayName,
          akaNames: labelMeta.akaNames,
          rank: payload.rank,
          score: payload.score,
          totalScore,
          attemptCount: payload.attemptCount,
          isCurrentUserParticipant: participantKey === currentParticipantKey,
          test: testPayload,
        }
      })
      .sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank
        }
        if (a.score !== b.score) {
          return b.score - a.score
        }
        return a.externalUsername.localeCompare(b.externalUsername)
      })

    return res.json({ leaderboard })
  } catch (error) {
    return next(error)
  }
})

router.post(
  '/:id/questions/:questionId/content-images/temp',
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      const adminCheck = await requireAdminUser(req)
      if (!adminCheck.ok) {
        return res.status(adminCheck.status).json({ error: adminCheck.error })
      }

      const attemptId = toSingleParam(req.params.id)
      const questionId = toSingleParam(req.params.questionId)
      const dataUrl = req.body?.dataUrl

      if (!isNonEmptyString(attemptId)) {
        return res.status(400).json({ error: 'Invalid test id.' })
      }
      if (!isNonEmptyString(questionId)) {
        return res.status(400).json({ error: 'questionId is required.' })
      }
      if (!isNonEmptyString(dataUrl)) {
        return res.status(400).json({ error: 'dataUrl is required.' })
      }

      const attempt = await prisma.attempt.findFirst({
        where: { id: attemptId, userId: req.user?.userId },
        include: { exam: { select: { questions: { select: { id: true } } } } },
      })
      if (!attempt) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const hasQuestion = attempt.exam.questions.some((question) => question.id === questionId)
      if (!hasQuestion) {
        return res.status(404).json({ error: 'Question not found.' })
      }

      const image = await saveTemporaryQuestionImage({
        userId: req.user!.userId,
        dataUrl,
        baseUrl: getRequestBaseUrl(req),
      })

      return res.json({ url: image.url })
    } catch (error) {
      return next(error)
    }
  },
)

router.post(
  '/:id/questions/:questionId/content-images/temp/cleanup',
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      const adminCheck = await requireAdminUser(req)
      if (!adminCheck.ok) {
        return res.status(adminCheck.status).json({ error: adminCheck.error })
      }

      const attemptId = toSingleParam(req.params.id)
      const questionId = toSingleParam(req.params.questionId)
      const urls = Array.isArray(req.body?.urls) ? req.body.urls.filter(isNonEmptyString) : []

      if (!isNonEmptyString(attemptId)) {
        return res.status(400).json({ error: 'Invalid test id.' })
      }
      if (!isNonEmptyString(questionId)) {
        return res.status(400).json({ error: 'questionId is required.' })
      }

      const attempt = await prisma.attempt.findFirst({
        where: { id: attemptId, userId: req.user?.userId },
        include: { exam: { select: { questions: { select: { id: true } } } } },
      })
      if (!attempt) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const hasQuestion = attempt.exam.questions.some((question) => question.id === questionId)
      if (!hasQuestion) {
        return res.status(404).json({ error: 'Question not found.' })
      }

      await deleteTemporaryQuestionImages({
        userId: req.user!.userId,
        urls,
      })

      return res.json({ ok: true })
    } catch (error) {
      return next(error)
    }
  },
)

router.post(
  '/:id/questions/:questionId/content',
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      const adminCheck = await requireAdminUser(req)
      if (!adminCheck.ok) {
        return res.status(adminCheck.status).json({ error: adminCheck.error })
      }

      const attemptId = toSingleParam(req.params.id)
      const questionId = toSingleParam(req.params.questionId)

      if (!isNonEmptyString(attemptId)) {
        return res.status(400).json({ error: 'Invalid test id.' })
      }
      if (!isNonEmptyString(questionId)) {
        return res.status(400).json({ error: 'questionId is required.' })
      }

      const attempt = await prisma.attempt.findFirst({
        where: { id: attemptId, userId: req.user?.userId },
        include: {
          exam: { include: { questions: true } },
        },
      })

      if (!attempt) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const examQuestion = attempt.exam.questions.find(
        (item: { id: string }) => item.id === questionId,
      )
      if (!examQuestion) {
        return res.status(404).json({ error: 'Question not found.' })
      }

      const nextQuestionContent = normalizeHtmlField(req.body?.questionContent)
      if (!nextQuestionContent) {
        return res.status(400).json({ error: 'questionContent is required.' })
      }

      const finalized = await finalizeQuestionContentAssets({
        userId: req.user!.userId,
        questionId: examQuestion.id,
        baseUrl: getRequestBaseUrl(req),
        questionContent: nextQuestionContent,
        optionContentA: normalizeHtmlField(req.body?.optionContentA),
        optionContentB: normalizeHtmlField(req.body?.optionContentB),
        optionContentC: normalizeHtmlField(req.body?.optionContentC),
        optionContentD: normalizeHtmlField(req.body?.optionContentD),
        solutionContent: normalizeHtmlField(req.body?.solutionContent),
        previousHtmlValues: [
          examQuestion.questionContent,
          examQuestion.optionContentA,
          examQuestion.optionContentB,
          examQuestion.optionContentC,
          examQuestion.optionContentD,
          (examQuestion as { solutionContent?: string | null }).solutionContent ??
            null,
        ],
      })
      const nextSolutionContent = hasVisibleHtmlContent(finalized.solutionContent)
        ? finalized.solutionContent
        : null
      const currentSolutionContent =
        (examQuestion as { solutionContent?: string | null }).solutionContent ?? null

      const hasContentChanges =
        examQuestion.questionContent !== finalized.questionContent ||
        examQuestion.optionContentA !== finalized.optionContentA ||
        examQuestion.optionContentB !== finalized.optionContentB ||
        examQuestion.optionContentC !== finalized.optionContentC ||
        examQuestion.optionContentD !== finalized.optionContentD ||
        nextSolutionContent !== currentSolutionContent

      if (hasContentChanges) {
        await prisma.$executeRaw`
          UPDATE "Question"
          SET
            "questionContent" = ${finalized.questionContent},
            "optionContentA" = ${finalized.optionContentA},
            "optionContentB" = ${finalized.optionContentB},
            "optionContentC" = ${finalized.optionContentC},
            "optionContentD" = ${finalized.optionContentD},
            "solutionContent" = ${nextSolutionContent}
          WHERE "id" = ${examQuestion.id}
        `
      }

      const updated = await prisma.attempt.findFirst({
        where: { id: attempt.id },
        include: {
          exam: { include: { questions: true } },
        },
      })

      if (!updated) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const peerTimings = await fetchPeerTimingsForExam(updated.examId, req.user!.userId)
      const peerAnswerStats = await fetchPeerAnswerStatsForExam(
        updated.examId,
        req.user!.userId,
        updated.exam.questions.map((question) => ({
          id: question.id,
          qtype: question.qtype,
          key: resolveQuestionKey(question),
          correctMarking: question.correctMarking,
          incorrectMarking: question.incorrectMarking,
          unattemptedMarking: question.unattemptedMarking,
        })),
      )
      const calculatedRank = await fetchCalculatedRankForAttempt({
        attemptId: updated.id,
        examId: updated.examId,
        questions: updated.exam.questions,
      })

      return res.json({
        test: serializeAttempt(updated, calculatedRank, peerTimings, peerAnswerStats),
      })
    } catch (error) {
      return next(error)
    }
  },
)

router.post('/:id/answer-key', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const adminCheck = await requireAdminUser(req)
    if (!adminCheck.ok) {
      return res.status(adminCheck.status).json({ error: adminCheck.error })
    }
    const authUser = req.user!
    const attemptId = toSingleParam(req.params.id)
    if (!isNonEmptyString(attemptId)) {
      return res.status(400).json({ error: 'Invalid test id.' })
    }

    const { questionId, newKey, qtype, markingScheme } = req.body as {
      questionId?: string
      newKey?: unknown
      qtype?: unknown
      markingScheme?: {
        correct?: unknown
        incorrect?: unknown
        unattempted?: unknown
      }
    }

    if (!isNonEmptyString(questionId)) {
      return res.status(400).json({ error: 'questionId is required.' })
    }

    const attempt = await prisma.attempt.findFirst({
      where: { id: attemptId, userId: authUser.userId },
      include: {
        exam: { include: { questions: true } },
      },
    })

    if (!attempt) {
      return res.status(404).json({ error: 'Test not found.' })
    }

    const examQuestion = attempt.exam.questions.find(
      (item: { id: string }) => item.id === questionId,
    )
    if (!examQuestion) {
      return res.status(404).json({ error: 'Question not found.' })
    }

    const normalizedKey =
      typeof newKey === 'string' ? newKey.trim().toUpperCase() : newKey
    const nextQtype = isQuestionType(qtype) ? qtype : null
    const hasKeyUpdate = normalizedKey !== undefined && normalizedKey !== null
    const hasQtypeUpdate = nextQtype !== null
    const nextCorrect = toFiniteInteger(markingScheme?.correct)
    const nextIncorrect = toFiniteInteger(markingScheme?.incorrect)
    const nextUnattempted = toFiniteInteger(markingScheme?.unattempted)
    const hasMarkingUpdate =
      nextCorrect !== null &&
      nextIncorrect !== null &&
      nextUnattempted !== null

    if (!hasKeyUpdate && !hasMarkingUpdate && !hasQtypeUpdate) {
      return res.status(400).json({
        error: 'newKey, qtype, or markingScheme is required.',
      })
    }

    const peerTimings = await fetchPeerTimingsForExam(
      attempt.examId,
      authUser.userId,
    )
    const peerAnswerStats = await fetchPeerAnswerStatsForExam(
      attempt.examId,
      authUser.userId,
      attempt.exam.questions.map((question) => ({
        id: question.id,
        qtype: question.qtype,
        key: resolveQuestionKey(question),
        correctMarking: question.correctMarking,
        incorrectMarking: question.incorrectMarking,
        unattemptedMarking: question.unattemptedMarking,
      })),
    )
    const keyChanged = hasKeyUpdate
      ? !jsonEquals(parseStoredJson(examQuestion.keyUpdate), normalizedKey)
      : false
    const qtypeChanged = hasQtypeUpdate ? examQuestion.qtype !== nextQtype : false
    const markingChanged = hasMarkingUpdate
      ? examQuestion.correctMarking !== nextCorrect ||
        examQuestion.incorrectMarking !== nextIncorrect ||
        examQuestion.unattemptedMarking !== nextUnattempted
      : false

    if (!keyChanged && !markingChanged && !qtypeChanged) {
      const calculatedRank = await fetchCalculatedRankForAttempt({
        attemptId: attempt.id,
        examId: attempt.examId,
        questions: attempt.exam.questions,
      })
      return res.json({
        test: serializeAttempt(attempt, calculatedRank, peerTimings, peerAnswerStats),
      })
    }

    await prisma.question.update({
      where: { id: examQuestion.id },
      data: {
        ...(keyChanged
          ? {
              keyUpdate: serializeJson(normalizedKey),
              lastKeyUpdateTime: new Date(),
            }
          : {}),
        ...(qtypeChanged && nextQtype
          ? {
              qtype: nextQtype,
              hasPartial: nextQtype === 'MAQ',
              ...(!hasMarkingUpdate ? getDefaultMarkingForType(nextQtype) : {}),
            }
          : {}),
        ...(hasMarkingUpdate
          ? {
              correctMarking: nextCorrect,
              incorrectMarking: nextIncorrect,
              unattemptedMarking: nextUnattempted,
              markingOverridden: true,
            }
          : {}),
      },
    })

    const updated = await prisma.attempt.findFirst({
      where: { id: attempt.id },
      include: {
        exam: { include: { questions: true } },
      },
    })

    if (!updated) {
      return res.status(404).json({ error: 'Test not found.' })
    }

    const updatedPeerTimings = await fetchPeerTimingsForExam(
      updated.examId,
      authUser.userId,
    )
    const updatedPeerAnswerStats = await fetchPeerAnswerStatsForExam(
      updated.examId,
      authUser.userId,
      updated.exam.questions.map((question) => ({
        id: question.id,
        qtype: question.qtype,
        key: resolveQuestionKey(question),
        correctMarking: question.correctMarking,
        incorrectMarking: question.incorrectMarking,
        unattemptedMarking: question.unattemptedMarking,
      })),
    )
    const updatedCalculatedRank = await fetchCalculatedRankForAttempt({
      attemptId: updated.id,
      examId: updated.examId,
      questions: updated.exam.questions,
    })
    return res.json({
      test: serializeAttempt(
        updated,
        updatedCalculatedRank,
        updatedPeerTimings,
        updatedPeerAnswerStats,
      ),
    })
  } catch (error) {
    return next(error)
  }
})

router.patch(
  '/:id/questions/:questionId/tags',
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized.' })
      }

      const attemptId = toSingleParam(req.params.id)
      const questionId = toSingleParam(req.params.questionId)
      const tags = parseTagList(req.body?.tags)

      if (!isNonEmptyString(attemptId)) {
        return res.status(400).json({ error: 'Invalid test id.' })
      }
      if (!isNonEmptyString(questionId)) {
        return res.status(400).json({ error: 'questionId is required.' })
      }

      const attempt = await prisma.attempt.findFirst({
        where: { id: attemptId, userId: req.user.userId },
        include: {
          exam: { include: { questions: true } },
        },
      })

      if (!attempt) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const examQuestion = attempt.exam.questions.find(
        (item: { id: string }) => item.id === questionId,
      )
      if (!examQuestion) {
        return res.status(404).json({ error: 'Question not found.' })
      }

      const questionTagMap = parseAttemptQuestionTags(parseStoredJson(attempt.questionTags))
      if (tags.length > 0) {
        questionTagMap[questionId] = tags
      } else {
        delete questionTagMap[questionId]
      }

      await prisma.attempt.update({
        where: { id: attempt.id },
        data: { questionTags: serializeJson(questionTagMap) },
      })

      const refreshed = await prisma.attempt.findFirst({
        where: { id: attempt.id, userId: req.user.userId },
        include: {
          exam: { include: { questions: true } },
        },
      })

      if (!refreshed) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const peerTimings = await fetchPeerTimingsForExam(
        refreshed.examId,
        req.user.userId,
      )
      const peerAnswerStats = await fetchPeerAnswerStatsForExam(
        refreshed.examId,
        req.user.userId,
        refreshed.exam.questions.map((question) => ({
          id: question.id,
          qtype: question.qtype,
          key: resolveQuestionKey(question),
          correctMarking: question.correctMarking,
          incorrectMarking: question.incorrectMarking,
          unattemptedMarking: question.unattemptedMarking,
        })),
      )
      const calculatedRank = await fetchCalculatedRankForAttempt({
        attemptId: refreshed.id,
        examId: refreshed.examId,
        questions: refreshed.exam.questions,
      })
      return res.json({
        test: serializeAttempt(refreshed, calculatedRank, peerTimings, peerAnswerStats),
      })
    } catch (error) {
      return next(error)
    }
  },
)

router.patch(
  '/:id/questions/:questionId/global-tags',
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      const adminCheck = await requireAdminUser(req)
      if (!adminCheck.ok) {
        return res.status(adminCheck.status).json({ error: adminCheck.error })
      }

      const attemptId = toSingleParam(req.params.id)
      const questionId = toSingleParam(req.params.questionId)
      const tags = parseTagList(req.body?.tags)

      if (!isNonEmptyString(attemptId)) {
        return res.status(400).json({ error: 'Invalid test id.' })
      }
      if (!isNonEmptyString(questionId)) {
        return res.status(400).json({ error: 'questionId is required.' })
      }

      const attempt = await prisma.attempt.findFirst({
        where: { id: attemptId, userId: req.user?.userId },
        include: {
          exam: { include: { questions: true } },
        },
      })

      if (!attempt) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const examQuestion = attempt.exam.questions.find(
        (item: { id: string }) => item.id === questionId,
      )
      if (!examQuestion) {
        return res.status(404).json({ error: 'Question not found.' })
      }

      await prisma.question.update({
        where: { id: examQuestion.id },
        data: { globalTags: serializeJson(tags) },
      })

      const refreshed = await prisma.attempt.findFirst({
        where: { id: attempt.id, userId: req.user?.userId },
        include: {
          exam: { include: { questions: true } },
        },
      })

      if (!refreshed) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const peerTimings = await fetchPeerTimingsForExam(
        refreshed.examId,
        req.user!.userId,
      )
      const peerAnswerStats = await fetchPeerAnswerStatsForExam(
        refreshed.examId,
        req.user!.userId,
        refreshed.exam.questions.map((question) => ({
          id: question.id,
          qtype: question.qtype,
          key: resolveQuestionKey(question),
          correctMarking: question.correctMarking,
          incorrectMarking: question.incorrectMarking,
          unattemptedMarking: question.unattemptedMarking,
        })),
      )
      const calculatedRank = await fetchCalculatedRankForAttempt({
        attemptId: refreshed.id,
        examId: refreshed.examId,
        questions: refreshed.exam.questions,
      })
      return res.json({
        test: serializeAttempt(refreshed, calculatedRank, peerTimings, peerAnswerStats),
      })
    } catch (error) {
      return next(error)
    }
  },
)

router.patch(
  '/:id/questions/:questionId/bookmarks',
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized.' })
      }

      const attemptId = toSingleParam(req.params.id)
      const questionId = toSingleParam(req.params.questionId)
      const bookmarked =
        typeof req.body?.bookmarked === 'boolean' ? req.body.bookmarked : undefined

      if (!isNonEmptyString(attemptId)) {
        return res.status(400).json({ error: 'Invalid test id.' })
      }
      if (!isNonEmptyString(questionId)) {
        return res.status(400).json({ error: 'questionId is required.' })
      }

      const attempt = await prisma.attempt.findFirst({
        where: { id: attemptId, userId: req.user.userId },
        include: {
          exam: { include: { questions: true } },
        },
      })

      if (!attempt) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const examQuestion = attempt.exam.questions.find(
        (item: { id: string }) => item.id === questionId,
      )
      if (!examQuestion) {
        return res.status(404).json({ error: 'Question not found.' })
      }

      const rawBookmarks = parseStoredJson(attempt.bookmarks)
      const bookmarkMap =
        rawBookmarks && typeof rawBookmarks === 'object'
          ? { ...(rawBookmarks as Record<string, boolean>) }
          : {}
      const isBookmarked = Boolean(bookmarkMap[questionId])
      const nextValue = bookmarked ?? !isBookmarked
      if (nextValue) {
        bookmarkMap[questionId] = true
      } else {
        delete bookmarkMap[questionId]
      }

      await prisma.attempt.update({
        where: { id: attempt.id },
        data: { bookmarks: serializeJson(bookmarkMap) },
      })

      const refreshed = await prisma.attempt.findFirst({
        where: { id: attempt.id, userId: req.user.userId },
        include: {
          exam: { include: { questions: true } },
        },
      })

      if (!refreshed) {
        return res.status(404).json({ error: 'Test not found.' })
      }

      const peerTimings = await fetchPeerTimingsForExam(
        refreshed.examId,
        req.user.userId,
      )
      const peerAnswerStats = await fetchPeerAnswerStatsForExam(
        refreshed.examId,
        req.user.userId,
        refreshed.exam.questions.map((question) => ({
          id: question.id,
          qtype: question.qtype,
          key: resolveQuestionKey(question),
          correctMarking: question.correctMarking,
          incorrectMarking: question.incorrectMarking,
          unattemptedMarking: question.unattemptedMarking,
        })),
      )
      const calculatedRank = await fetchCalculatedRankForAttempt({
        attemptId: refreshed.id,
        examId: refreshed.examId,
        questions: refreshed.exam.questions,
      })
      return res.json({
        test: serializeAttempt(refreshed, calculatedRank, peerTimings, peerAnswerStats),
      })
    } catch (error) {
      return next(error)
    }
  },
)

router.post('/:id/marking-scheme', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }
    const attemptId = toSingleParam(req.params.id)
    if (!isNonEmptyString(attemptId)) {
      return res.status(400).json({ error: 'Invalid test id.' })
    }

    const { scheme, questionTypeMapping } = req.body as {
      scheme?: unknown
      questionTypeMapping?: unknown
    }
    const updates = parseMarkingScheme(scheme)
    const nextTypeMapping = parseQuestionTypeMapping(questionTypeMapping)
    if (updates.size === 0 && Object.keys(nextTypeMapping).length === 0) {
      return res
        .status(400)
        .json({ error: 'scheme or questionTypeMapping is required.' })
    }

    const attempt = await prisma.attempt.findFirst({
      where: { id: attemptId, userId: req.user.userId },
      include: {
        exam: { include: { questions: true } },
      },
    })

    if (!attempt) {
      return res.status(404).json({ error: 'Test not found.' })
    }

    const currentSettings = parseExamSettings(parseStoredJson(attempt.exam.markingScheme))
    const mappingChanged = !jsonEquals(
      currentSettings.questionTypeMapping,
      nextTypeMapping,
    )
    const mergedMarkingScheme = {
      ...Object.fromEntries(currentSettings.markingScheme.entries()),
      ...Object.fromEntries(updates.entries()),
    }

    const qtypes = Array.from(updates.keys())
    const existing = await prisma.question.findMany({
      where: {
        examId: attempt.exam.id,
        ...(mappingChanged ? {} : { qtype: { in: qtypes } }),
      },
      select: {
        id: true,
        sourceQtypeRaw: true,
        qtype: true,
        correctMarking: true,
        incorrectMarking: true,
        unattemptedMarking: true,
        markingOverridden: true,
      },
    })

    const markOverrideOps: Array<ReturnType<typeof prisma.question.updateMany>> = []
    qtypes.forEach((qtype) => {
      const items = existing.filter((question) => question.qtype === qtype)
      const candidates = items.filter((question) => !question.markingOverridden)
      if (candidates.length <= 1) {
        return
      }

      const frequency = new Map<string, number>()
      candidates.forEach((question) => {
        const key = `${question.correctMarking}|${question.incorrectMarking}|${question.unattemptedMarking}`
        frequency.set(key, (frequency.get(key) ?? 0) + 1)
      })

      let baseline = ''
      let baselineCount = -1
      frequency.forEach((count, key) => {
        if (count > baselineCount) {
          baseline = key
          baselineCount = count
        }
      })
      if (!baseline) {
        return
      }

      const overrideIds = candidates
        .filter((question) => {
          const key = `${question.correctMarking}|${question.incorrectMarking}|${question.unattemptedMarking}`
          return key !== baseline
        })
        .map((question) => question.id)

      if (overrideIds.length > 0) {
        markOverrideOps.push(
          prisma.question.updateMany({
            where: { id: { in: overrideIds } },
            data: { markingOverridden: true },
          }),
        )
      }
    })

    await prisma.$transaction(
      [
        ...markOverrideOps,
        prisma.exam.update({
          where: { id: attempt.exam.id },
          data: {
            markingScheme: serializeJson({
              markingScheme: {
                ...mergedMarkingScheme,
              },
              questionTypeMapping: nextTypeMapping,
            }),
          },
        }),
        ...Array.from(updates.entries()).map(([qtype, values]) =>
          prisma.question.updateMany({
            where: {
              examId: attempt.exam.id,
              qtype,
              markingOverridden: false,
            },
            data: {
              correctMarking: values.correct,
              incorrectMarking: values.incorrect,
              unattemptedMarking: values.unattempted,
            },
          }),
        ),
      ],
    )

    let resyncMessage: string | null = null
    if (mappingChanged) {
      const remapUpdates = existing.map((question) => {
        const nextQtype = applyStoredQuestionTypeMapping(
          question.sourceQtypeRaw,
          question.qtype,
          nextTypeMapping,
        )
        return prisma.question.update({
          where: { id: question.id },
          data: {
            qtype: nextQtype,
            hasPartial: nextQtype === 'MAQ',
            ...(!question.markingOverridden
              ? (mergedMarkingScheme[nextQtype] ?? getDefaultMarkingForType(nextQtype))
              : {}),
          },
        })
      })

      if (remapUpdates.length > 0) {
        await prisma.$transaction(remapUpdates)
      }

      const missingCount = existing.filter((question) => !question.sourceQtypeRaw).length
      if (missingCount > 0) {
        resyncMessage =
          'Question type mapping saved. Some older questions still need one resync to capture source type data before they can be remapped.'
      }
    }

    const updated = await prisma.attempt.findFirst({
      where: { id: attempt.id },
      include: {
        exam: { include: { questions: true } },
      },
    })

    if (!updated) {
      return res.status(404).json({ error: 'Test not found.' })
    }

    const peerTimings = await fetchPeerTimingsForExam(
      updated.examId,
      req.user.userId,
    )
    const peerAnswerStats = await fetchPeerAnswerStatsForExam(
      updated.examId,
      req.user.userId,
      updated.exam.questions.map((question) => ({
        id: question.id,
        qtype: question.qtype,
        key: resolveQuestionKey(question),
        correctMarking: question.correctMarking,
        incorrectMarking: question.incorrectMarking,
        unattemptedMarking: question.unattemptedMarking,
      })),
    )
    const calculatedRank = await fetchCalculatedRankForAttempt({
      attemptId: updated.id,
      examId: updated.examId,
      questions: updated.exam.questions,
    })
    return res.json({
      test: serializeAttempt(updated, calculatedRank, peerTimings, peerAnswerStats),
      message: resyncMessage,
    })
  } catch (error) {
    return next(error)
  }
})

router.post('/:id/resync', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }
    const attemptId = toSingleParam(req.params.id)
    if (!isNonEmptyString(attemptId)) {
      return res.status(400).json({ error: 'Invalid test id.' })
    }

    const attempt = await prisma.attempt.findFirst({
      where: { id: attemptId, userId: req.user.userId },
      include: { exam: true },
    })

    if (!attempt) {
      return res.status(404).json({ error: 'Test not found.' })
    }

    const externalExamId = attempt.exam.externalExamId
    if (!externalExamId) {
      return res.status(400).json({ error: 'External exam id missing.' })
    }

    const account = await prisma.externalAccount.findUnique({
      where: {
        userId_provider: { userId: req.user.userId, provider: 'test.z7i.in' },
      },
      include: { credential: true },
    })

    if (!account || !account.credential) {
      return res.status(404).json({ error: 'External account not connected.' })
    }

    if (account.syncStatus === 'SYNCING') {
      return res.status(409).json({ error: 'Sync already in progress.' })
    }

    const syncStartedAt = new Date()
    await prisma.externalAccount.update({
      where: { id: account.id },
      data: {
        status: 'CONNECTED',
        statusMessage: null,
        syncStatus: 'SYNCING',
        syncTotal: 0,
        syncCompleted: 0,
        syncStartedAt,
        syncFinishedAt: null,
      },
    })

    const password = decryptSecret({
      encrypted: account.credential.encryptedPassword,
      iv: account.credential.iv,
      tag: account.credential.tag,
    })

    await syncExternalAccount({
      userId: req.user.userId,
      provider: account.provider,
      username: account.username,
      password,
      onlyExamIds: [externalExamId],
      forceAttemptExamIds: [externalExamId],
      onProgress: async (progress: ScrapeProgress) => {
        try {
          await prisma.externalAccount.update({
            where: { id: account.id },
            data: {
              syncTotal: progress.total,
              syncCompleted: progress.completed,
            },
          })
        } catch (progressError) {
          console.error(progressError)
        }
      },
    })

    const now = new Date()
    await prisma.externalAccount.update({
      where: { id: account.id },
      data: {
        status: 'CONNECTED',
        statusMessage: null,
        lastSyncAt: now,
        syncStatus: 'IDLE',
        syncFinishedAt: now,
      },
    })

    const refreshed = await prisma.attempt.findFirst({
      where: { userId: req.user.userId, examId: attempt.examId },
      include: {
        exam: { include: { questions: true } },
      },
    })

    if (!refreshed) {
      return res.status(404).json({ error: 'Test not found.' })
    }

    const peerTimings = await fetchPeerTimingsForExam(
      refreshed.examId,
      req.user.userId,
    )
    const peerAnswerStats = await fetchPeerAnswerStatsForExam(
      refreshed.examId,
      req.user.userId,
      refreshed.exam.questions.map((question) => ({
        id: question.id,
        qtype: question.qtype,
        key: resolveQuestionKey(question),
        correctMarking: question.correctMarking,
        incorrectMarking: question.incorrectMarking,
        unattemptedMarking: question.unattemptedMarking,
      })),
    )
    const calculatedRank = await fetchCalculatedRankForAttempt({
      attemptId: refreshed.id,
      examId: refreshed.examId,
      questions: refreshed.exam.questions,
    })
    return res.json({
      test: serializeAttempt(refreshed, calculatedRank, peerTimings, peerAnswerStats),
    })
  } catch (error) {
    if (req.user) {
      await prisma.externalAccount.updateMany({
        where: { userId: req.user.userId, provider: 'test.z7i.in' },
        data: {
          status: 'ERROR',
          statusMessage:
            error instanceof Error ? error.message : 'Resync failed. Check logs.',
          syncStatus: 'ERROR',
          syncFinishedAt: new Date(),
        },
      })
    }
    return next(error)
  }
})

const jsonEquals = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export default router

