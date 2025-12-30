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
            select: { examId: true, timings: true },
          })
    const peerTimingsByExam = buildPeerTimingsByExam(otherAttempts)

    return res.json({
      tests: attempts.map((attempt) =>
        serializeAttempt(attempt, peerTimingsByExam.get(attempt.examId) ?? {}),
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
    return res.json({ test: serializeAttempt(attempt, peerTimings) })
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
    if (jsonEquals(parseStoredJson(examQuestion.keyUpdate), normalizedKey)) {
      return res.json({ test: serializeAttempt(attempt, peerTimings) })
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
    return res.json({ test: serializeAttempt(updated, updatedPeerTimings) })
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
      return res.json({ test: serializeAttempt(refreshed, peerTimings) })
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
    return res.json({ test: serializeAttempt(updated, peerTimings) })
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
    return res.json({ test: serializeAttempt(refreshed, peerTimings) })
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

