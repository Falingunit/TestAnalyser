import { prisma } from '../db.js'
import { scrapeTestZ7iV2 } from '../scraper/testZ7iScraperV2.js'
import type {
  ScrapeProgress,
  ScrapedAnswer,
  ScrapedQuestion,
  ScrapedQuestionType,
  ScrapedReport,
  ScrapedScoreOverview,
} from '../scraper/types.js'

type ExistingQuestion = {
  id: string
  questionNumber: number
  subject: string
  qtype: string
  questionContent: string
  optionContentA: string | null
  optionContentB: string | null
  optionContentC: string | null
  optionContentD: string | null
  correctAnswer: string | null
  keyUpdate: string | null
  markingOverridden?: boolean
}

const normalizeDate = (value: string) => {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

const normalizeReport = (report: ScrapedReport) => {
  return {
    externalExamId: report.externalExamId?.trim() ?? '',
    title: report.title.trim(),
    examDate: normalizeDate(report.examDate),
    scoreOverview: report.scoreOverview ?? null,
    questions: report.questions ?? [],
    answers: report.answers ?? [],
  }
}

const toOptionalInt = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? Math.round(parsed) : null
  }
  return null
}

const buildAttemptOverviewUpdate = (overview?: ScrapedScoreOverview | null) => {
  const rank = toOptionalInt(overview?.rank)
  if (rank === null) {
    return {}
  }
  return { rank }
}

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

const QUESTION_TYPES: ScrapedQuestionType[] = ['MCQ', 'MAQ', 'NAT', 'VMAQ']

const isQuestionType = (value: unknown): value is ScrapedQuestionType =>
  typeof value === 'string' && QUESTION_TYPES.includes(value as ScrapedQuestionType)

const parseQuestionTypeMapping = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return {} as Record<string, ScrapedQuestionType>
  }

  const mapping: Record<string, ScrapedQuestionType> = {}
  Object.entries(value as Record<string, unknown>).forEach(([key, rawValue]) => {
    const source = key.trim().toUpperCase()
    if (!source || !isQuestionType(rawValue)) {
      return
    }
    mapping[source] = rawValue
  })
  return mapping
}

const parseMarkingSchemeSettings = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return {
      questionTypeMapping: {} as Record<string, ScrapedQuestionType>,
      markingScheme: {} as Record<
        string,
        { correct: number; incorrect: number; unattempted: number }
      >,
    }
  }

  const root = value as Record<string, unknown>
  const hasNestedSettings =
    (root.markingScheme && typeof root.markingScheme === 'object') ||
    (root.questionTypeMapping && typeof root.questionTypeMapping === 'object')

  if (!hasNestedSettings) {
    return {
      questionTypeMapping: {} as Record<string, ScrapedQuestionType>,
      markingScheme: root as Record<
        string,
        { correct: number; incorrect: number; unattempted: number }
      >,
    }
  }

  return {
    questionTypeMapping: parseQuestionTypeMapping(root.questionTypeMapping),
    markingScheme:
      root.markingScheme && typeof root.markingScheme === 'object'
        ? (root.markingScheme as Record<
            string,
            { correct: number; incorrect: number; unattempted: number }
          >)
        : {},
  }
}

const getDefaultMarkingForType = (qtype: ScrapedQuestionType) => {
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

const applyQuestionTypeMapping = (
  sourceQtypeRaw: string | null | undefined,
  fallbackQtype: ScrapedQuestionType,
  mapping: Record<string, ScrapedQuestionType>,
) => {
  const normalizedSource =
    typeof sourceQtypeRaw === 'string' ? sourceQtypeRaw.trim().toUpperCase() : ''
  if (normalizedSource && mapping[normalizedSource]) {
    return mapping[normalizedSource]
  }
  return fallbackQtype
}

const parseOptionTokens = (value: string) =>
  value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)

const parseNumericValue = (value: string) => {
  const normalized = value.replace(/[−–—]/g, '-')
  const trimmed = normalized.trim()
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

  const numericMatch = trimmed.match(/-?\d+(?:\.\d+)?/)
  if (!numericMatch) {
    return null
  }
  const numeric = Number(numericMatch[0])
  return Number.isNaN(numeric) ? null : numeric
}

const parseAnswerValue = (
  value: string | null,
  qtype: ScrapedQuestionType,
) => {
  if (!value) {
    return null
  }

  if (qtype === 'NAT') {
    return parseNumericValue(value)
  }

  const tokens = parseOptionTokens(value)
  if (tokens.length === 0) {
    return null
  }

  if (qtype === 'MAQ') {
    return Array.from(new Set(tokens)).sort()
  }

  return tokens[0]
}

const ensureAnswerValue = (
  value: unknown | null,
  qtype: ScrapedQuestionType,
) => {
  if (value !== null && value !== undefined) {
    return value
  }
  if (qtype === 'MAQ') {
    return []
  }
  if (qtype === 'NAT') {
    return 0
  }
  return ''
}

const assignQuestionNumbers = (questions: ScrapedQuestion[]) => {
  const ordered = [...questions].sort(
    (a, b) => a.sourceNumber - b.sourceNumber,
  )
  let fallbackNumber = 1
  return ordered.map((question) => {
    const derived =
      Number.isFinite(question.sourceNumber) && question.sourceNumber > 0
        ? question.sourceNumber
        : fallbackNumber
    fallbackNumber += 1
    return { ...question, questionNumber: derived }
  })
}

const normalizeSignatureText = (value: string | null | undefined) =>
  (value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const buildQuestionSignature = (payload: {
  subject: string
  qtype: string
  questionContent: string
  optionContentA?: string | null
  optionContentB?: string | null
  optionContentC?: string | null
  optionContentD?: string | null
}) =>
  [
    payload.subject,
    payload.qtype,
    normalizeSignatureText(payload.questionContent),
    normalizeSignatureText(payload.optionContentA),
    normalizeSignatureText(payload.optionContentB),
    normalizeSignatureText(payload.optionContentC),
    normalizeSignatureText(payload.optionContentD),
  ].join('|')

const upsertExam = async (report: ScrapedReport) => {
  const normalized = normalizeReport(report)
  if (!normalized.externalExamId) {
    throw new Error('Missing external exam id.')
  }
  const answerKeyBySourceNumber = new Map<number, string | null>()
  for (const answer of normalized.answers) {
    if (answer.correctAnswerRaw) {
      answerKeyBySourceNumber.set(answer.sourceNumber, answer.correctAnswerRaw)
    }
  }

  const exam = await prisma.exam.upsert({
    where: { externalExamId: normalized.externalExamId },
    update: {
      title: normalized.title,
      examDate: normalized.examDate,
    },
    create: {
      externalExamId: normalized.externalExamId,
      title: normalized.title,
      examDate: normalized.examDate,
    },
  })
  const examSettings = parseMarkingSchemeSettings(parseStoredJson(exam.markingScheme))

  const numberedQuestions = assignQuestionNumbers(normalized.questions)
  const existingQuestions = await prisma.question.findMany({
    where: { examId: exam.id },
  })
  const existingByNumber = new Map<number, ExistingQuestion>(
    existingQuestions.map((question: ExistingQuestion) => [
      question.questionNumber,
      question,
    ]),
  )
  const existingBySignature = new Map<string, ExistingQuestion[]>()
  existingQuestions.forEach((question: ExistingQuestion) => {
    const signature = buildQuestionSignature({
      subject: question.subject,
      qtype: question.qtype,
      questionContent: question.questionContent,
      optionContentA: question.optionContentA,
      optionContentB: question.optionContentB,
      optionContentC: question.optionContentC,
      optionContentD: question.optionContentD,
    })
    const current = existingBySignature.get(signature) ?? []
    current.push(question)
    existingBySignature.set(signature, current)
  })
  const usedExistingIds = new Set<string>()

  const questionBySourceNumber = new Map<
    number,
    { id: string; qtype: ScrapedQuestionType; keyUpdate: unknown }
  >()
  const questionByNumber = new Map<
    number,
    { id: string; qtype: ScrapedQuestionType; keyUpdate: unknown }
  >()

  for (const question of numberedQuestions) {
    const storedQtype = applyQuestionTypeMapping(
      question.sourceQtypeRaw,
      question.qtype,
      examSettings.questionTypeMapping,
    )
    const storedOptions =
      storedQtype === 'NAT'
        ? {
            optionContentA: null,
            optionContentB: null,
            optionContentC: null,
            optionContentD: null,
          }
        : {
            optionContentA: question.optionContentA,
            optionContentB: question.optionContentB,
            optionContentC: question.optionContentC,
            optionContentD: question.optionContentD,
          }
    const typeMarking =
      examSettings.markingScheme[storedQtype] ?? getDefaultMarkingForType(storedQtype)
    const fallbackCorrectAnswer =
      question.correctAnswerRaw ??
      answerKeyBySourceNumber.get(question.sourceNumber) ??
      null
    const parsedCorrectAnswer = parseAnswerValue(
      fallbackCorrectAnswer,
      storedQtype,
    )
    const ensuredCorrectAnswer = ensureAnswerValue(
      parsedCorrectAnswer,
      storedQtype,
    )
    let existing = existingByNumber.get(question.questionNumber)
    let matchedBySignature = false
    if (existing && usedExistingIds.has(existing.id)) {
      existing = undefined
    }
    if (!existing) {
      const signature = buildQuestionSignature({
        subject: question.subject,
        qtype: storedQtype,
        questionContent: question.questionContent,
        optionContentA: question.optionContentA,
        optionContentB: question.optionContentB,
        optionContentC: question.optionContentC,
        optionContentD: question.optionContentD,
      })
      const candidates = existingBySignature.get(signature) ?? []
      const candidate = candidates.find((item) => !usedExistingIds.has(item.id))
      if (candidate) {
        existing = candidate
        matchedBySignature = true
      }
    }

    if (!existing) {
      const storedAnswer = serializeJson(ensuredCorrectAnswer)
      const storedKeyUpdate = serializeJson(ensuredCorrectAnswer)
      const created = await prisma.question.create({
        data: {
          examId: exam.id,
          subject: question.subject,
          qtype: storedQtype,
          correctAnswer: storedAnswer,
          questionContent: question.questionContent,
          ...storedOptions,
          hasPartial: storedQtype === 'MAQ',
          correctMarking: typeMarking.correct,
          incorrectMarking: typeMarking.incorrect,
          unattemptedMarking: typeMarking.unattempted,
          questionNumber: question.questionNumber,
          keyUpdate: storedKeyUpdate,
          lastKeyUpdateTime: null,
        },
      })

      questionBySourceNumber.set(question.sourceNumber, {
        id: created.id,
        qtype: storedQtype,
        keyUpdate: parseStoredJson(created.keyUpdate),
      })
      questionByNumber.set(question.questionNumber, {
        id: created.id,
        qtype: storedQtype,
        keyUpdate: parseStoredJson(created.keyUpdate),
      })
      continue
    }
    usedExistingIds.add(existing.id)

    const existingCorrectAnswer = parseStoredJson(existing.correctAnswer)
    const shouldSetKeyUpdate = existing.keyUpdate === null
    const nextCorrectAnswer = existingCorrectAnswer ?? ensuredCorrectAnswer

    const updated = await prisma.question.update({
      where: { id: existing.id },
      data: {
        subject: question.subject,
        qtype: storedQtype,
        correctAnswer: serializeJson(nextCorrectAnswer),
        questionContent: question.questionContent,
        ...storedOptions,
        hasPartial: storedQtype === 'MAQ',
        ...(!existing.markingOverridden
          ? {
              correctMarking: typeMarking.correct,
              incorrectMarking: typeMarking.incorrect,
              unattemptedMarking: typeMarking.unattempted,
            }
          : {}),
        ...(matchedBySignature ? {} : { questionNumber: question.questionNumber }),
        ...(shouldSetKeyUpdate
          ? { keyUpdate: serializeJson(nextCorrectAnswer) }
          : {}),
      },
    })

    questionBySourceNumber.set(question.sourceNumber, {
      id: updated.id,
      qtype: storedQtype,
      keyUpdate: parseStoredJson(updated.keyUpdate),
    })
    questionByNumber.set(question.questionNumber, {
      id: updated.id,
      qtype: storedQtype,
      keyUpdate: parseStoredJson(updated.keyUpdate),
    })
  }

  return { examId: exam.id, questionBySourceNumber, questionByNumber }
}

const ensureQuestionMap = async (examId: string) => {
  const questions = await prisma.question.findMany({
    where: { examId },
  })
  const map = new Map<
    number,
    { id: string; qtype: ScrapedQuestionType; keyUpdate: unknown }
  >()
  for (const question of questions) {
    map.set(question.questionNumber, {
      id: question.id,
      qtype: question.qtype as ScrapedQuestionType,
      keyUpdate: parseStoredJson(question.keyUpdate),
    })
  }
  return map
}

const upsertAttempt = async (payload: {
  userId: string
  examId: string
  questionByNumber: Map<number, { id: string; qtype: ScrapedQuestionType; keyUpdate: unknown }>
  fallbackByNumber?: Map<number, { id: string; qtype: ScrapedQuestionType; keyUpdate: unknown }>
  answers: ScrapedAnswer[]
  scoreOverview?: ScrapedScoreOverview | null
}) => {
  const answerByQuestionId: Record<string, unknown> = {}
  const timingByQuestionId: Record<string, number> = {}

  for (const entry of payload.questionByNumber.values()) {
    answerByQuestionId[entry.id] = null
    timingByQuestionId[entry.id] = 0
  }
  if (payload.fallbackByNumber) {
    for (const entry of payload.fallbackByNumber.values()) {
      answerByQuestionId[entry.id] = null
      timingByQuestionId[entry.id] = 0
    }
  }

  for (const answer of payload.answers) {
    const question =
      payload.questionByNumber.get(answer.sourceNumber) ??
      payload.fallbackByNumber?.get(answer.sourceNumber)
    if (!question) {
      continue
    }

    answerByQuestionId[question.id] = parseAnswerValue(
      answer.selectedAnswerRaw,
      question.qtype,
    )
    timingByQuestionId[question.id] = answer.timeSpentSec ?? 0

  }

  const overview = buildAttemptOverviewUpdate(payload.scoreOverview)
  const attempt = await prisma.attempt.upsert({
    where: {
      userId_examId: {
        userId: payload.userId,
        examId: payload.examId,
      },
    },
    update: {
      answers: serializeJson(answerByQuestionId),
      timings: serializeJson(timingByQuestionId),
      ...overview,
    },
    create: {
      userId: payload.userId,
      examId: payload.examId,
      answers: serializeJson(answerByQuestionId),
      timings: serializeJson(timingByQuestionId),
      bookmarks: serializeJson({}),
      ...overview,
    },
  })

  return attempt
}

export const syncExternalAccount = async (payload: {
  userId: string
  provider: string
  username: string
  password: string
  verificationCode?: string
  onlyExamIds?: string[]
  forceAttemptExamIds?: string[]
  attemptsOnly?: boolean
  onProgress?: (progress: ScrapeProgress) => Promise<void> | void
}) => {
  if (payload.provider !== 'test.z7i.in') {
    throw new Error(`Unsupported provider: ${payload.provider}`)
  }

  const existingAttempts = await prisma.attempt.findMany({
    where: { userId: payload.userId },
    select: { exam: { select: { externalExamId: true } } },
  })
  const attemptedExamIds = new Set(
    existingAttempts
      .map((attempt: { exam: { externalExamId: string | null } }) =>
        attempt.exam.externalExamId,
      )
      .filter(Boolean) as string[],
  )
  const forceAttemptExamIds = new Set(payload.forceAttemptExamIds ?? [])
  forceAttemptExamIds.forEach((examId) => {
    attemptedExamIds.delete(examId)
  })

  const existingExams = await prisma.exam.findMany({
    select: {
      externalExamId: true,
      questions: { select: { id: true }, take: 1 },
    },
  })
  const existingIds = new Set(
    existingExams
      .map((exam: { externalExamId: string | null }) => exam.externalExamId)
      .filter(Boolean) as string[],
  )
  const forceFullIds = new Set(
    existingExams
      .filter(
        (exam: { externalExamId: string | null; questions: Array<{ id: string }> }) =>
          exam.externalExamId && exam.questions.length === 0,
      )
      .map((exam: { externalExamId: string | null }) => exam.externalExamId as string),
  )

  const result = await scrapeTestZ7iV2({
    username: payload.username,
    password: payload.password,
    verificationCode: payload.verificationCode,
    existingExamIds: Array.from(existingIds),
    forceFullExamIds: Array.from(forceFullIds),
    skipExamIds: Array.from(attemptedExamIds),
    onlyExamIds: payload.onlyExamIds,
    onProgress: payload.onProgress,
  })

  const saved = [] as Array<{ id: string; title: string }>
  const warnings = [...result.warnings]

  for (const report of result.reports) {
    const normalized = normalizeReport(report)
    if (!normalized.externalExamId) {
      warnings.push('Skipping report with missing exam id.')
      continue
    }

    const useQuestions = payload.attemptsOnly ? [] : normalized.questions
    let examId = ''
    let questionByNumber = new Map<
      number,
      { id: string; qtype: ScrapedQuestionType; keyUpdate: unknown }
    >()
    let fallbackByNumber:
      | Map<number, { id: string; qtype: ScrapedQuestionType; keyUpdate: unknown }>
      | undefined

    if (useQuestions.length > 0) {
      const created = await upsertExam({
        externalExamId: normalized.externalExamId,
        title: normalized.title,
        examDate: normalized.examDate,
        questions: useQuestions,
        answers: normalized.answers,
      })
      examId = created.examId
      questionByNumber = created.questionBySourceNumber
      fallbackByNumber = created.questionByNumber
    } else {
      const exam = await prisma.exam.findUnique({
        where: { externalExamId: normalized.externalExamId },
      })
      if (!exam) {
        warnings.push(`Exam not found for report ${normalized.title}.`)
        continue
      }
      examId = exam.id
      await prisma.exam.update({
        where: { id: exam.id },
        data: { title: normalized.title, examDate: normalized.examDate },
      })
      questionByNumber = await ensureQuestionMap(exam.id)
    }

    const attempt = await upsertAttempt({
      userId: payload.userId,
      examId,
      questionByNumber,
      fallbackByNumber,
      answers: normalized.answers,
      scoreOverview: normalized.scoreOverview,
    })

    saved.push({ id: attempt.id, title: normalized.title })
  }

  return {
    count: saved.length,
    attempts: saved,
    warnings,
  }
}

