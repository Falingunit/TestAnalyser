import { prisma } from '../db.js'
import { scrapeTestZ7iV2 } from '../scraper/testZ7iScraperV2.js'
import type {
  ScrapeProgress,
  ScrapedAnswer,
  ScrapedQuestion,
  ScrapedQuestionType,
  ScrapedReport,
} from '../scraper/types.js'

type ExistingQuestion = {
  id: string
  questionNumber: number
  correctAnswer: string | null
  keyUpdate: string | null
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
    questions: report.questions ?? [],
    answers: report.answers ?? [],
  }
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

  const questionBySourceNumber = new Map<
    number,
    { id: string; qtype: ScrapedQuestionType; keyUpdate: unknown }
  >()
  const questionByNumber = new Map<
    number,
    { id: string; qtype: ScrapedQuestionType; keyUpdate: unknown }
  >()

  for (const question of numberedQuestions) {
    const fallbackCorrectAnswer =
      question.correctAnswerRaw ??
      answerKeyBySourceNumber.get(question.sourceNumber) ??
      null
    const parsedCorrectAnswer = parseAnswerValue(
      fallbackCorrectAnswer,
      question.qtype,
    )
    const ensuredCorrectAnswer = ensureAnswerValue(
      parsedCorrectAnswer,
      question.qtype,
    )
    const existing = existingByNumber.get(question.questionNumber)

    if (!existing) {
      const storedAnswer = serializeJson(ensuredCorrectAnswer)
      const storedKeyUpdate = serializeJson(ensuredCorrectAnswer)
      const created = await prisma.question.create({
        data: {
          examId: exam.id,
          subject: question.subject,
          qtype: question.qtype,
          correctAnswer: storedAnswer,
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
          keyUpdate: storedKeyUpdate,
          lastKeyUpdateTime: null,
        },
      })

      questionBySourceNumber.set(question.sourceNumber, {
        id: created.id,
        qtype: question.qtype,
        keyUpdate: parseStoredJson(created.keyUpdate),
      })
      questionByNumber.set(question.questionNumber, {
        id: created.id,
        qtype: question.qtype,
        keyUpdate: parseStoredJson(created.keyUpdate),
      })
      continue
    }

    const existingCorrectAnswer = parseStoredJson(existing.correctAnswer)
    const shouldSetKeyUpdate = existing.keyUpdate === null
    const nextCorrectAnswer = existingCorrectAnswer ?? ensuredCorrectAnswer

    const updated = await prisma.question.update({
      where: { id: existing.id },
      data: {
        subject: question.subject,
        qtype: question.qtype,
        correctAnswer: serializeJson(nextCorrectAnswer),
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
        ...(shouldSetKeyUpdate
          ? { keyUpdate: serializeJson(nextCorrectAnswer) }
          : {}),
      },
    })

    questionBySourceNumber.set(question.sourceNumber, {
      id: updated.id,
      qtype: question.qtype,
      keyUpdate: parseStoredJson(updated.keyUpdate),
    })
    questionByNumber.set(question.questionNumber, {
      id: updated.id,
      qtype: question.qtype,
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
    },
    create: {
      userId: payload.userId,
      examId: payload.examId,
      answers: serializeJson(answerByQuestionId),
      timings: serializeJson(timingByQuestionId),
      bookmarks: serializeJson({}),
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
    })

    saved.push({ id: attempt.id, title: normalized.title })
  }

  return {
    count: saved.length,
    attempts: saved,
    warnings,
  }
}

