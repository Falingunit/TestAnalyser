import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import {
  serializeAttempt,
  parseStoredJson,
  getQuestionMarkForAnswer,
  buildParticipantKeyByUserId,
} from './tests.js'

const router = Router()

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const toSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const ADMIN_EMAILS = new Set([
  'spssabaris@gmail.com',
  'sbaniruddh1@gmail.com',
  'testing@gmail.com',
])

const isAdminRole = (role: unknown) =>
  typeof role === 'string' && role.trim().toLowerCase() === 'admin'

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

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const leaderboards = await prisma.customLeaderboard.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return res.json({ leaderboards })
  } catch (error) {
    return next(error)
  }
})

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const adminCheck = await requireAdminUser(req)
    if (!adminCheck.ok) {
      return res.status(adminCheck.status).json({ error: adminCheck.error })
    }

    const { title, examIds } = req.body as { title?: string, examIds?: string[] }
    if (!isNonEmptyString(title)) {
      return res.status(400).json({ error: 'title is required' })
    }
    if (!Array.isArray(examIds) || examIds.length === 0) {
      return res.status(400).json({ error: 'examIds must be a non-empty array' })
    }

    const leaderboard = await prisma.customLeaderboard.create({
      data: {
        title,
        examIds: JSON.stringify(examIds)
      }
    })

    return res.json({ leaderboard })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }
    const leaderboardId = toSingleParam(req.params.id)
    if (!isNonEmptyString(leaderboardId)) {
      return res.status(400).json({ error: 'Invalid leaderboard id.' })
    }

    const customLeaderboard = await prisma.customLeaderboard.findUnique({
      where: { id: leaderboardId }
    })

    if (!customLeaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found.' })
    }

    let examIds: string[] = []
    try {
      examIds = JSON.parse(customLeaderboard.examIds)
    } catch {
      // ignore
    }

    if (examIds.length === 0) {
      return res.json({ leaderboard: [], title: customLeaderboard.title })
    }

    // Fetch all attempts for these exams
    const examAttempts = await prisma.attempt.findMany({
      where: { examId: { in: examIds } },
      include: {
        exam: { include: { questions: true } },
      },
    })

    const userIds = Array.from(new Set(examAttempts.map((item) => item.userId)))
    const participantKeyByUserId = await buildParticipantKeyByUserId(userIds)

    // Calculate score for each attempt
    const scoreByAttemptId = new Map<string, number>()
    const totalScoreByExamId = new Map<string, number>()

    examAttempts.forEach((item) => {
      const parsed = parseStoredJson(item.answers)
      const answers = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
      const score = item.exam.questions.reduce((sum, question) => {
        const selected = answers[question.id]
        return sum + getQuestionMarkForAnswer(question as any, selected)
      }, 0)
      scoreByAttemptId.set(item.id, score)

      if (!totalScoreByExamId.has(item.examId)) {
        const total = item.exam.questions.reduce((sum, q) => sum + q.correctMarking, 0)
        totalScoreByExamId.set(item.examId, total)
      }
    })

    // Group by participant and exam to get the best score and best attempt per exam
    const bestByParticipantAndExam = new Map<string, Map<string, { attempt: typeof examAttempts[0], score: number }>>()

    examAttempts.forEach((item) => {
      const participantKey = participantKeyByUserId.get(item.userId) ?? `user:${item.userId}`
      const score = scoreByAttemptId.get(item.id) ?? 0
      if (score <= 0) return

      let participantMap = bestByParticipantAndExam.get(participantKey)
      if (!participantMap) {
        participantMap = new Map()
        bestByParticipantAndExam.set(participantKey, participantMap)
      }

      const currentBest = participantMap.get(item.examId)
      if (!currentBest || score > currentBest.score) {
        participantMap.set(item.examId, { attempt: item, score })
      }
    })

    // Calculate total score possible for the leaderboard
    const totalLeaderboardScore = Array.from(totalScoreByExamId.values()).reduce((sum, t) => sum + t, 0)

    const aggregated = new Map<string, {
      score: number,
      attempts: typeof examAttempts,
      attemptCount: number // sum of attempts across exams
    }>()

    bestByParticipantAndExam.forEach((examMap, participantKey) => {
      let totalScore = 0
      const bestAttempts: typeof examAttempts = []
      examMap.forEach(({ attempt, score }) => {
        totalScore += score
        bestAttempts.push(attempt)
      })

      aggregated.set(participantKey, {
        score: totalScore,
        attempts: bestAttempts,
        attemptCount: bestAttempts.length, // taking 1 per exam
      })
    })

    // Prepare Name resolution
    const currentParticipantKey = participantKeyByUserId.get(req.user.userId) ?? `user:${req.user.userId}`
    const externalUsernames = Array.from(aggregated.keys())
      .filter((key) => key.startsWith('external:test.z7i.in:'))
      .map((key) => key.replace('external:test.z7i.in:', ''))

    const linkedLocalAccounts = externalUsernames.length === 0 ? [] : await prisma.externalAccount.findMany({
      where: { provider: 'test.z7i.in', username: { in: externalUsernames } },
      select: { username: true, user: { select: { name: true, email: true, createdAt: true } } }
    })

    const nameMetaByParticipantKey = new Map<string, { displayName: string; akaNames: string[] }>()
    const localAccountsByUsername = new Map<string, Array<{ name: string; email: string; createdAt: Date }>>()

    linkedLocalAccounts.forEach((account) => {
      const current = localAccountsByUsername.get(account.username) ?? []
      current.push({ name: account.user.name, email: account.user.email, createdAt: account.user.createdAt })
      localAccountsByUsername.set(account.username, current)
    })

    localAccountsByUsername.forEach((accounts, username) => {
      const sorted = [...accounts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.email.localeCompare(b.email))
      const normalizeIdentity = (payload: { name: string; email: string }) => {
        const base = payload.name.trim() || payload.email.trim()
        return base || username
      }
      const ordered = sorted.map((item) => normalizeIdentity(item))
      const dedupedOrdered: string[] = []
      ordered.forEach((item) => {
        if (!dedupedOrdered.includes(item)) dedupedOrdered.push(item)
      })
      nameMetaByParticipantKey.set(`external:test.z7i.in:${username}`, {
        displayName: dedupedOrdered[0] ?? username,
        akaNames: dedupedOrdered.slice(1),
      })
    })

    const sortedEntries = Array.from(aggregated.entries())
      .map(([participantKey, payload]) => {
        const externalUsername = participantKey.startsWith('external:test.z7i.in:')
          ? participantKey.replace('external:test.z7i.in:', '')
          : participantKey
        const labelMeta = nameMetaByParticipantKey.get(participantKey) ?? { displayName: externalUsername, akaNames: [] }
        return {
          participantKey,
          externalUsername,
          displayName: labelMeta.displayName,
          akaNames: labelMeta.akaNames,
          score: payload.score,
          totalScore: totalLeaderboardScore,
          attemptCount: payload.attemptCount,
          isCurrentUserParticipant: participantKey === currentParticipantKey,
          attemptsData: payload.attempts.map(a => serializeAttempt(a as any, 1, {}, {}))
        }
      })
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        return a.externalUsername.localeCompare(b.externalUsername)
      })

    // Assign rank based on score
    let currentRank = 1
    let previousScore: number | null = null

    const leaderboard = sortedEntries.map((entry, index) => {
      if (previousScore !== null && entry.score < previousScore) {
        currentRank = index + 1
      }
      previousScore = entry.score
      return {
        ...entry,
        rank: currentRank,
        attempts: entry.attemptsData
      }
    })

    return res.json({ leaderboard, title: customLeaderboard.title })
  } catch (error) {
    return next(error)
  }
})

export default router
