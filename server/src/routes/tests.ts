import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import type { ScrapeProgress } from '../scraper/types.js'
import { syncExternalAccount } from '../services/syncService.js'
import { decryptSecret } from '../utils/crypto.js'

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

const serializeJson = (value: unknown) => JSON.stringify(value ?? null)

const serializeAttempt = (
  attempt: {
    id: string
    userId: string
    answers: string
    timings: string
    bookmarks: string
    rank: number | null
    exam: {
      id: string
      externalExamId: string | null
      title: string
      examDate: string
      questions: Array<{
        id: string
        subject: string
        qtype: string
        correctAnswer: string
        keyUpdate: string | null
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
        lastKeyUpdateTime: Date | null
      }>
    }
  },
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

  return {
    id: attempt.id,
    userId: attempt.userId,
    externalExamId: attempt.exam.externalExamId ?? undefined,
    title: attempt.exam.title,
    examDate: attempt.exam.examDate,
    rank: attempt.rank ?? null,
    answers,
    timings,
    peerTimings,
    peerAnswerStats,
    bookmarks,
    questions: sortedQuestions.map((question) => ({
      id: question.id,
      subject: question.subject,
      qtype: question.qtype,
      correctAnswer: parseStoredJson(question.correctAnswer),
      keyUpdate: parseStoredJson(question.keyUpdate),
      questionContent: question.questionContent,
      optionContentA: question.optionContentA,
      optionContentB: question.optionContentB,
      optionContentC: question.optionContentC,
      optionContentD: question.optionContentD,
      hasPartial: question.hasPartial,
      correctMarking: question.correctMarking,
      incorrectMarking: question.incorrectMarking,
      unattemptedMarking: question.unattemptedMarking,
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
    Array<{ id: string; qtype: string; key: unknown }>
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
  questions: Array<{ id: string; qtype: string; key: unknown }>,
) => {
  const otherAttempts = await prisma.attempt.findMany({
    where: { examId, userId: { not: userId } },
    select: { answers: true },
  })
  const questionMap = new Map<
    string,
    Array<{ id: string; qtype: string; key: unknown }>
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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

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
    const correct = toFiniteNumber(raw.correct)
    const incorrect = toFiniteNumber(raw.incorrect)
    const unattempted = toFiniteNumber(raw.unattempted)
    if (correct === null || incorrect === null || unattempted === null) {
      continue
    }
    entries.set(key, { correct, incorrect, unattempted })
  }

  return entries
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
    const questionsByExam = new Map<
      string,
      Array<{ id: string; qtype: string; key: unknown }>
    >()
    attempts.forEach((attempt) => {
      questionsByExam.set(
        attempt.examId,
        attempt.exam.questions.map((question) => ({
          id: question.id,
          qtype: question.qtype,
          key: resolveQuestionKey(question),
        })),
      )
    })
    const peerAnswerStatsByExam = buildPeerAnswerStatsByExam(
      otherAttempts.map((attempt) => ({
        examId: attempt.examId,
        answers: attempt.answers,
      })),
      questionsByExam,
    )

    return res.json({
      tests: attempts.map((attempt) =>
        serializeAttempt(
          attempt,
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

    const attempt = await prisma.attempt.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
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
    const peerAnswerStats = await fetchPeerAnswerStatsForExam(
      attempt.examId,
      req.user.userId,
      attempt.exam.questions.map((question) => ({
        id: question.id,
        qtype: question.qtype,
        key: resolveQuestionKey(question),
      })),
    )
    return res.json({ test: serializeAttempt(attempt, peerTimings, peerAnswerStats) })
  } catch (error) {
    return next(error)
  }
})

router.post('/:id/answer-key', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const { questionId, newKey } = req.body as {
      questionId?: string
      newKey?: unknown
    }

    if (!isNonEmptyString(questionId)) {
      return res.status(400).json({ error: 'questionId is required.' })
    }

    const attempt = await prisma.attempt.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
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
    if (normalizedKey === undefined || normalizedKey === null) {
      return res.status(400).json({ error: 'newKey is required.' })
    }

    const peerTimings = await fetchPeerTimingsForExam(
      attempt.examId,
      req.user.userId,
    )
    const peerAnswerStats = await fetchPeerAnswerStatsForExam(
      attempt.examId,
      req.user.userId,
      attempt.exam.questions.map((question) => ({
        id: question.id,
        qtype: question.qtype,
        key: resolveQuestionKey(question),
      })),
    )
    if (jsonEquals(parseStoredJson(examQuestion.keyUpdate), normalizedKey)) {
      return res.json({ test: serializeAttempt(attempt, peerTimings, peerAnswerStats) })
    }

    await prisma.question.update({
      where: { id: examQuestion.id },
      data: {
        keyUpdate: serializeJson(normalizedKey),
        lastKeyUpdateTime: new Date(),
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
      req.user.userId,
    )
    const updatedPeerAnswerStats = await fetchPeerAnswerStatsForExam(
      updated.examId,
      req.user.userId,
      updated.exam.questions.map((question) => ({
        id: question.id,
        qtype: question.qtype,
        key: resolveQuestionKey(question),
      })),
    )
    return res.json({
      test: serializeAttempt(updated, updatedPeerTimings, updatedPeerAnswerStats),
    })
  } catch (error) {
    return next(error)
  }
})

router.patch(
  '/:id/questions/:questionId/bookmarks',
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized.' })
      }

      const { questionId } = req.params
      const bookmarked =
        typeof req.body?.bookmarked === 'boolean' ? req.body.bookmarked : undefined

      if (!isNonEmptyString(questionId)) {
        return res.status(400).json({ error: 'questionId is required.' })
      }

      const attempt = await prisma.attempt.findFirst({
        where: { id: req.params.id, userId: req.user.userId },
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
        })),
      )
      return res.json({ test: serializeAttempt(refreshed, peerTimings, peerAnswerStats) })
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

    const { scheme } = req.body as { scheme?: unknown }
    const updates = parseMarkingScheme(scheme)
    if (updates.size === 0) {
      return res.status(400).json({ error: 'scheme is required.' })
    }

    const attempt = await prisma.attempt.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
      include: {
        exam: { include: { questions: true } },
      },
    })

    if (!attempt) {
      return res.status(404).json({ error: 'Test not found.' })
    }

    await prisma.$transaction(
      Array.from(updates.entries()).map(([qtype, values]) =>
        prisma.question.updateMany({
          where: { examId: attempt.exam.id, qtype },
          data: {
            correctMarking: values.correct,
            incorrectMarking: values.incorrect,
            unattemptedMarking: values.unattempted,
          },
        }),
      ),
    )

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
      })),
    )
    return res.json({ test: serializeAttempt(updated, peerTimings, peerAnswerStats) })
  } catch (error) {
    return next(error)
  }
})

router.post('/:id/resync', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const attempt = await prisma.attempt.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
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
      })),
    )
    return res.json({ test: serializeAttempt(refreshed, peerTimings, peerAnswerStats) })
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

