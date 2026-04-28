import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import {
  serializeAttempt,
  parseStoredJson,
  getQuestionMarkForAnswer,
  getQuestionMaxMarks,
  buildExternalParticipantNameMeta,
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

    const { title, description, examIds } = req.body as { title?: string, description?: string, examIds?: string[] }
    if (!isNonEmptyString(title)) {
      return res.status(400).json({ error: 'title is required' })
    }
    if (!Array.isArray(examIds) || examIds.length === 0) {
      return res.status(400).json({ error: 'examIds must be a non-empty array' })
    }

    const leaderboard = await prisma.customLeaderboard.create({
      data: {
        title,
        description,
        examIds: JSON.stringify(examIds)
      }
    })

    return res.json({ leaderboard })
  } catch (error) {
    return next(error)
  }
})

router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const adminCheck = await requireAdminUser(req)
    if (!adminCheck.ok) {
      return res.status(adminCheck.status).json({ error: adminCheck.error })
    }

    const leaderboardId = toSingleParam(req.params.id)
    if (!isNonEmptyString(leaderboardId)) {
      return res.status(400).json({ error: 'Invalid leaderboard id.' })
    }

    const { title, description, examIds } = req.body as {
      title?: string
      description?: string
      examIds?: string[]
    }

    const updateData: {
      title?: string
      description?: string | null
      examIds?: string
    } = {}

    if (title !== undefined) {
      if (!isNonEmptyString(title)) {
        return res.status(400).json({ error: 'title is required' })
      }
      updateData.title = title.trim()
    }

    if (description !== undefined) {
      updateData.description = description
    }

    if (examIds !== undefined) {
      if (!Array.isArray(examIds) || examIds.length === 0) {
        return res.status(400).json({ error: 'examIds must be a non-empty array' })
      }
      updateData.examIds = JSON.stringify(examIds)
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid leaderboard fields provided.' })
    }

    const leaderboard = await prisma.customLeaderboard.update({
      where: { id: leaderboardId },
      data: updateData
    })

    return res.json({ leaderboard })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const adminCheck = await requireAdminUser(req)
    if (!adminCheck.ok) {
      return res.status(adminCheck.status).json({ error: adminCheck.error })
    }

    const leaderboardId = toSingleParam(req.params.id)
    if (!isNonEmptyString(leaderboardId)) {
      return res.status(400).json({ error: 'Invalid leaderboard id.' })
    }

    await prisma.customLeaderboard.delete({
      where: { id: leaderboardId }
    })

    return res.json({ success: true })
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

    // Fetch exam titles
    const exams = examIds.length > 0 ? await prisma.exam.findMany({
      where: { id: { in: examIds } },
      select: { id: true, title: true }
    }) : []
    const examTitles = exams.map(e => e.title)

    if (examIds.length === 0) {
      return res.json({ leaderboard: [], title: customLeaderboard.title, description: customLeaderboard.description, examTitles: [] })
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
    const subjectScoresByAttemptId = new Map<string, Record<string, { score: number, total: number }>>()
    const totalScoreByExamId = new Map<string, number>()

    examAttempts.forEach((item) => {
      const parsed = parseStoredJson(item.answers)
      const answers = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
      
      const subjectMap: Record<string, { score: number, total: number }> = {}
      
      const score = item.exam.questions.reduce((sum, question) => {
        const selected = answers[question.id]
        const mark = getQuestionMarkForAnswer(question as any, selected)
        
        const subj = question.subject
        if (!subjectMap[subj]) subjectMap[subj] = { score: 0, total: 0 }
        subjectMap[subj].score += mark
        subjectMap[subj].total += getQuestionMaxMarks(question)
        
        return sum + mark
      }, 0)
      
      scoreByAttemptId.set(item.id, score)
      subjectScoresByAttemptId.set(item.id, subjectMap)

      if (!totalScoreByExamId.has(item.examId)) {
        const total = item.exam.questions.reduce((sum, q) => sum + getQuestionMaxMarks(q), 0)
        totalScoreByExamId.set(item.examId, total)
      }
    })

    // Group by participant and exam to get the best score and best attempt per exam
    const bestByParticipantAndExam = new Map<string, Map<string, { attemptId: string, score: number, subjectScores: Record<string, { score: number, total: number }> }>>()

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
        participantMap.set(item.examId, { 
          attemptId: item.id, 
          score, 
          subjectScores: subjectScoresByAttemptId.get(item.id) ?? {} 
        })
      }
    })

    // Calculate total score possible for the leaderboard
    const totalLeaderboardScore = Array.from(totalScoreByExamId.values()).reduce((sum, t) => sum + t, 0)

    const aggregated = new Map<string, {
      score: number,
      subjectScores: Record<string, { score: number, total: number }>,
      attemptCount: number // sum of attempts across exams
    }>()

    bestByParticipantAndExam.forEach((examMap, participantKey) => {
      let totalScore = 0
      const totalSubjectScores: Record<string, { score: number, total: number }> = {}
      let count = 0
      
      examMap.forEach(({ score, subjectScores }) => {
        totalScore += score
        count++
        Object.entries(subjectScores).forEach(([subj, data]) => {
          if (!totalSubjectScores[subj]) totalSubjectScores[subj] = { score: 0, total: 0 }
          totalSubjectScores[subj].score += data.score
          totalSubjectScores[subj].total += data.total
        })
      })

      aggregated.set(participantKey, {
        score: totalScore,
        subjectScores: totalSubjectScores,
        attemptCount: count,
      })
    })

    // Prepare Name resolution
    const currentParticipantKey = participantKeyByUserId.get(req.user.userId) ?? `user:${req.user.userId}`
    const nameMetaByParticipantKey = await buildExternalParticipantNameMeta(
      aggregated.keys(),
    )

    const sortedEntries = Array.from(aggregated.entries())
      .map(([participantKey, payload]) => {
        const externalUsername = participantKey.startsWith('external:test.z7i.in:')
          ? participantKey.replace('external:test.z7i.in:', '')
          : participantKey
        const labelMeta = nameMetaByParticipantKey.get(participantKey) ?? {
          displayName: externalUsername,
          akaNames: [],
          remoteDisplayName: null,
        }
        return {
          participantKey,
          externalUsername,
          displayName: labelMeta.displayName,
          akaNames: labelMeta.akaNames,
          remoteDisplayName: labelMeta.remoteDisplayName,
          score: payload.score,
          subjectScores: payload.subjectScores,
          totalScore: totalLeaderboardScore,
          attemptCount: payload.attemptCount,
          isCurrentUserParticipant: participantKey === currentParticipantKey,
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
      }
    })

    return res.json({ leaderboard, title: customLeaderboard.title, description: customLeaderboard.description, examTitles })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id/participant/:participantKey', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const leaderboardId = toSingleParam(req.params.id)
    const participantKey = toSingleParam(req.params.participantKey)
    
    if (!isNonEmptyString(leaderboardId) || !isNonEmptyString(participantKey)) {
      return res.status(400).json({ error: 'Invalid parameters.' })
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
      return res.json({ attempts: [] })
    }

    // Resolve userId if it's a local user key
    let userId: string | null = null
    if (participantKey.startsWith('user:')) {
      userId = participantKey.replace('user:', '')
    } else if (participantKey.startsWith('external:test.z7i.in:')) {
      const username = participantKey.replace('external:test.z7i.in:', '')
      const account = await prisma.externalAccount.findFirst({
        where: { provider: 'test.z7i.in', username }
      })
      // Even if not linked, we might have multiple attempts by this external username
      // We need to fetch all attempts for this participantKey
    }

    // A better way: fetch ALL attempts for these exams, then filter by participantKey
    const examAttempts = await prisma.attempt.findMany({
      where: { examId: { in: examIds } },
      include: {
        exam: { include: { questions: true } },
      },
    })

    const userIds = Array.from(new Set(examAttempts.map((item) => item.userId)))
    const participantKeyByUserId = await buildParticipantKeyByUserId(userIds)

    const filteredAttempts = examAttempts.filter(item => {
      const key = participantKeyByUserId.get(item.userId) ?? `user:${item.userId}`
      return key === participantKey
    })

    // For each exam, only take the best attempt
    const bestByExam = new Map<string, typeof examAttempts[0]>()
    const scoreByAttemptId = new Map<string, number>()

    filteredAttempts.forEach(item => {
      const parsed = parseStoredJson(item.answers)
      const answers = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
      const score = item.exam.questions.reduce((sum, question) => {
        const selected = answers[question.id]
        return sum + getQuestionMarkForAnswer(question as any, selected)
      }, 0)
      scoreByAttemptId.set(item.id, score)

      const currentBest = bestByExam.get(item.examId)
      if (!currentBest || score > (scoreByAttemptId.get(currentBest.id) ?? 0)) {
        bestByExam.set(item.examId, item)
      }
    })

    const result = Array.from(bestByExam.values()).map(a => serializeAttempt(a as any, 1, {}, {}))

    return res.json({ attempts: result })
  } catch (error) {
    return next(error)
  }
})

export default router
