import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { chromium, type Page } from 'playwright'
import { env } from '../config.js'
import type {
  ScrapeProgress,
  ScrapeResult,
  ScrapedAnswer,
  ScrapedQuestion,
  ScrapedQuestionType,
  ScrapedReport,
  ScrapedScoreOverview,
  ScrapedSubject,
} from './types.js'

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

const normalizeDateFromValue = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    return normalizeDate(trimmed)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000
    const parsed = new Date(ms)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }
  return null
}

const ensureDebugDir = async () => {
  if (!env.scraperDebugDir) {
    return null
  }
  await mkdir(env.scraperDebugDir, { recursive: true })
  return env.scraperDebugDir
}

const saveDebugHtml = async (name: string, html: string) => {
  const dir = await ensureDebugDir()
  if (!dir) {
    return
  }
  const filePath = join(dir, `${name}.html`)
  await writeFile(filePath, html, 'utf8')
}

const saveDebugJson = async (name: string, payload: unknown) => {
  const dir = await ensureDebugDir()
  if (!dir) {
    return
  }
  const filePath = join(dir, `${name}.json`)
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

const saveDebugText = async (name: string, text: string) => {
  const dir = await ensureDebugDir()
  if (!dir) {
    return
  }
  const filePath = join(dir, `${name}.txt`)
  await writeFile(filePath, text, 'utf8')
}

const tryParseJsonPayload = (text: string) => {
  const trimmed = text.trim()
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return null
  }
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

const collapseText = (value: string) => value.replace(/\s+/g, ' ').trim()

const extractOid = (value: unknown): string | null => {
  if (!value) {
    return null
  }
  if (typeof value === 'string') {
    return value
  }
  if (
    typeof value === 'object' &&
    '$oid' in value &&
    typeof (value as { $oid?: unknown }).$oid === 'string'
  ) {
    return (value as { $oid: string }).$oid
  }
  return null
}

const toInteger = (value: unknown) => {
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

const normalizeSubject = (value: string): ScrapedSubject | null => {
  const trimmed = collapseText(value).toUpperCase()
  if (trimmed.startsWith('PHY')) {
    return 'PHYSICS'
  }
  if (trimmed.startsWith('CHEM')) {
    return 'CHEMISTRY'
  }
  if (trimmed.startsWith('MAT')) {
    return 'MATHEMATICS'
  }
  return null
}

const normalizeQuestionType = (value: unknown): ScrapedQuestionType | null => {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim().toUpperCase()
  if (!trimmed) {
    return null
  }
  if (trimmed.includes('VMAQ')) {
    return 'VMAQ'
  }
  if (trimmed.includes('MAQ') || trimmed.includes('MSQ') || trimmed.includes('MULT')) {
    return 'MAQ'
  }
  if (trimmed.includes('NAT') || trimmed.includes('NUM') || trimmed.includes('INT')) {
    return 'NAT'
  }
  if (trimmed.includes('MCQ') || trimmed.includes('SCQ') || trimmed.includes('SINGLE')) {
    return 'MCQ'
  }
  return null
}

const normalizeAnswer = (value: string | null) => {
  if (!value) {
    return null
  }
  let trimmed = collapseText(value)
  if (!trimmed) {
    return null
  }
  trimmed = trimmed.replace(
    /^(?:(?:YOUR\s+ANSWER|ANSWER|ANS|CORRECT\s+ANS(?:WER)?)\s*[:.-]?\s*)+/i,
    '',
  )
  trimmed = collapseText(trimmed)
  if (!trimmed) {
    return null
  }
  const normalized = trimmed.toUpperCase()
  if (['-', 'NA', 'N/A', 'NOT ATTEMPTED'].includes(normalized)) {
    return null
  }
  const tokens = normalized.match(/\b[A-D]\b/g)
  if (tokens && tokens.length > 0) {
    const unique = Array.from(new Set(tokens)).sort()
    return unique.join(',')
  }
  if (/^[A-D]+$/.test(normalized)) {
    const unique = Array.from(new Set(normalized.split(''))).sort()
    return unique.join(',')
  }
  return trimmed
}

const isNumericAnswer = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }
  return (
    /^-?\d+(\.\d+)?$/.test(trimmed) ||
    /^-?\d+(\.\d+)?\s*(to|-)\s*-?\d+(\.\d+)?$/.test(trimmed)
  )
}

const inferQuestionType = (payload: {
  metaTypeText: string | null
  hasOptions: boolean
  correctAnswerRaw: string | null
}): ScrapedQuestionType => {
  const meta = payload.metaTypeText?.toLowerCase() ?? ''
  if (meta.includes('vmaq')) {
    return 'VMAQ'
  }
  if (meta.includes('maq') || meta.includes('multiple')) {
    return 'MAQ'
  }
  if (meta.includes('nat') || meta.includes('numerical') || meta.includes('integer')) {
    return 'NAT'
  }
  if (meta.includes('mcq') || meta.includes('single')) {
    return 'MCQ'
  }
  if (!payload.hasOptions) {
    return 'NAT'
  }
  if (payload.correctAnswerRaw && payload.correctAnswerRaw.includes(',')) {
    return 'MAQ'
  }
  if (payload.correctAnswerRaw && isNumericAnswer(payload.correctAnswerRaw)) {
    return 'NAT'
  }
  return 'MCQ'
}

const getMarkingForType = (qtype: ScrapedQuestionType) => {
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

const parseQuestionwisePayload = (
  payload: unknown,
  includeCorrectAnswer: boolean,
) => {
  const warnings: string[] = []
  if (!payload || typeof payload !== 'object') {
    return { questions: [], answers: [], warnings }
  }

  const payloadObj = payload as {
    data?: unknown[]
    subject?: unknown[]
    subjectmap?: Record<string, unknown>
    status?: boolean
  }

  const subjectById = new Map<string, string>()
  if (Array.isArray(payloadObj.subject)) {
    for (const entry of payloadObj.subject) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const id = extractOid((entry as { _id?: unknown })._id)
      const title =
        typeof (entry as { title?: unknown }).title === 'string'
          ? (entry as { title: string }).title
          : typeof (entry as { name?: unknown }).name === 'string'
            ? (entry as { name: string }).name
            : null
      if (id && title) {
        subjectById.set(id, title)
      }
    }
  }

  const subjectMap =
    payloadObj.subjectmap && typeof payloadObj.subjectmap === 'object'
      ? (payloadObj.subjectmap as Record<string, unknown>)
      : {}

  const questions: ScrapedQuestion[] = []
  const answers: ScrapedAnswer[] = []
  const data = Array.isArray(payloadObj.data) ? payloadObj.data : []

  for (const entry of data) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const row = entry as Record<string, unknown>
    const orderValue = row.__order
    const sourceNumber =
      typeof orderValue === 'number' && Number.isFinite(orderValue)
        ? orderValue + 1
        : Number.parseInt(String(row.question_no ?? row.question_number ?? ''), 10)
    if (!Number.isFinite(sourceNumber)) {
      warnings.push('Skipping question with missing order.')
      continue
    }

    const questionId =
      extractOid(row._id ?? row.id ?? row.question_id) ?? String(sourceNumber)
    const subjectId =
      extractOid(row.subject) ?? extractOid(subjectMap[questionId]) ?? null
    const subjectTitle =
      (subjectId && subjectById.get(subjectId)) ||
      (typeof row.subject_title === 'string' ? row.subject_title : null) ||
      (typeof row.subject_name === 'string' ? row.subject_name : null)
    const subject = subjectTitle ? normalizeSubject(subjectTitle) : null
    if (!subject) {
      warnings.push(`Unknown subject for question ${sourceNumber}.`)
      continue
    }

    const rawQtype = normalizeQuestionType(row.question_type)
    const correctAnswerRaw = includeCorrectAnswer
      ? normalizeAnswer(
          typeof row.ans === 'string'
            ? row.ans
            : typeof row.ans === 'number'
              ? String(row.ans)
              : null,
        )
      : null
    const optionA = typeof row.opt1 === 'string' ? row.opt1 : null
    const optionB = typeof row.opt2 === 'string' ? row.opt2 : null
    const optionC = typeof row.opt3 === 'string' ? row.opt3 : null
    const optionD = typeof row.opt4 === 'string' ? row.opt4 : null
    const hasOptions = Boolean(optionA || optionB || optionC || optionD)
    const qtype =
      rawQtype ??
      inferQuestionType({
        metaTypeText: typeof row.question_type === 'string' ? row.question_type : null,
        hasOptions,
        correctAnswerRaw,
      })

    const marking = getMarkingForType(qtype)
    const useOptions =
      qtype === 'NAT' ? [null, null, null, null] : [optionA, optionB, optionC, optionD]
    const questionContent = typeof row.question === 'string' ? row.question : ''

    questions.push({
      sourceNumber,
      subject,
      qtype,
      correctAnswerRaw,
      questionContent,
      optionContentA: useOptions[0],
      optionContentB: useOptions[1],
      optionContentC: useOptions[2],
      optionContentD: useOptions[3],
      hasPartial: qtype === 'MAQ',
      correctMarking: marking.correct,
      incorrectMarking: marking.incorrect,
      unattemptedMarking: marking.unattempted,
    })

    const ansStatus = typeof row.ans_status === 'string' ? row.ans_status : ''
    const isUnattempted = ansStatus.toLowerCase().includes('unattempt')
    const studentAnswerRaw = isUnattempted
      ? null
      : normalizeAnswer(
          typeof row.std_ans === 'string'
            ? row.std_ans
            : typeof row.std_ans === 'number'
              ? String(row.std_ans)
              : null,
        )
    const timeTaken = Number.parseInt(String(row.time_taken ?? ''), 10)

    answers.push({
      sourceNumber,
      selectedAnswerRaw: studentAnswerRaw,
      correctAnswerRaw,
      timeSpentSec: Number.isNaN(timeTaken) ? 0 : timeTaken,
    })
  }

  return { questions, answers, warnings }
}

const extractExamDateFromQuestionwise = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const root = payload as Record<string, unknown>
  const direct = normalizeDateFromValue(
    root.created ??
      root.created_at ??
      root.test_date ??
      root.exam_date ??
      root.examDate,
  )
  if (direct) {
    return direct
  }

  const data = Array.isArray(root.data) ? root.data : []
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const row = entry as Record<string, unknown>
    const candidate = normalizeDateFromValue(
      row.created ?? row.created_at ?? row.test_date ?? row.exam_date ?? row.examDate,
    )
    if (candidate) {
      return candidate
    }
  }

  return null
}

const extractPackageIdFromHtml = (html: string) => {
  const match = html.match(/get-mypackage-details\/([a-f0-9]{24})/i)
  return match?.[1] ?? null
}

const extractPackageIdFromUrl = (url: string) => {
  const match = url.match(/get-mypackage-details\/([a-f0-9]{24})/i)
  return match?.[1] ?? null
}

const extractTestsList = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  const root = payload as Record<string, unknown>
  const data = (root.data ?? root) as Record<string, unknown>
  const seriesRaw = data.test_series ?? data.testSeries ?? null
  if (Array.isArray(seriesRaw)) {
    const seriesEntries = seriesRaw as Array<Record<string, unknown>>
    const all = seriesEntries.flatMap((entry) => {
      const list = entry.all_tests ?? entry.tests ?? entry.allTests
      return Array.isArray(list) ? list : []
    })
    if (all.length > 0) {
      return all
    }
  }

  const candidates = [
    data.all_tests,
    data.allTests,
    data.tests,
    root.all_tests,
    root.allTests,
    root.tests,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  return []
}

const extractScoreOverviewFromJson = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const root = payload as Record<string, unknown>
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root

  if (!data || typeof data !== 'object') {
    return null
  }

  const testEntry = Array.isArray(data.test) ? data.test[0] : null
  const title =
    testEntry && typeof (testEntry as { test_name?: unknown }).test_name === 'string'
      ? ((testEntry as { test_name: string }).test_name || '').trim()
      : null

  const rank = toInteger(data.rank ?? data.rank_no ?? data.rankNo)
  const overview: ScrapedScoreOverview | null =
    rank === null ? null : { rank }

  return { title, overview }
}

const parseTestEntry = (entry: Record<string, unknown>, index: number) => {
  const title =
    (typeof entry.test_name === 'string' && entry.test_name.trim()) ||
    (typeof entry.title === 'string' && entry.title.trim()) ||
    (typeof entry.name === 'string' && entry.name.trim()) ||
    `Test ${index + 1}`
  const id =
    extractOid(entry._id ?? entry.id ?? entry.test_id ?? entry.testId) ?? ''
  const examDate =
    normalizeDateFromValue(
      entry.test_date ??
        entry.exam_date ??
        entry.examDate ??
        entry.date ??
        entry.created_at ??
        entry.created ??
        entry.start_date ??
        entry.startDate,
    ) ?? normalizeDate(new Date().toISOString())
  return { title, reportId: id, examDate }
}

const completeVerification = async (page: Page, verificationCode?: string) => {
  const verifyModal = page.locator('#verify-modal')
  if (!(await verifyModal.isVisible())) {
    return
  }

  if (!verificationCode) {
    throw new Error('Verification code required. Provide an OTP to continue.')
  }

  await verifyModal.locator('input[ng-model="verify.code"]').fill(verificationCode)
  await verifyModal.locator('button.log-in').first().click()
}

type LoginOutcome =
  | { type: 'success' }
  | { type: 'error'; message: string }
  | { type: 'verify' }
  | { type: 'timeout' }

const waitForLoginOutcome = async (
  page: Page,
  loginModal: ReturnType<Page['locator']>,
  timeoutMs: number,
): Promise<LoginOutcome> => {
  const errorLocator = loginModal.locator('.err.text-left').first()
  const verifyModal = page.locator('#verify-modal')

  const waitForUrl = page
    .waitForURL(/\/student\//i, { timeout: timeoutMs })
    .then(() => ({ type: 'success' as const }))
    .catch(() => ({ type: 'timeout' as const }))
  const waitForError = errorLocator
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(async () => {
      const text = await errorLocator.textContent()
      return {
        type: 'error' as const,
        message: text?.trim() || 'Login failed.',
      }
    })
    .catch(() => null)
  const waitForVerify = verifyModal
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => ({ type: 'verify' as const }))
    .catch(() => null)

  const outcome = await Promise.race([waitForUrl, waitForError, waitForVerify])
  return outcome ?? { type: 'timeout' }
}

const login = async (
  page: Page,
  payload: { username: string; password: string; verificationCode?: string; timeoutMs?: number },
) => {
  const timeoutMs = payload.timeoutMs ?? env.scraperTimeoutMs

  await page.goto(env.scraperBaseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  })

  if (page.url().includes('/student/')) {
    return
  }

  await page.getByRole('link', { name: 'Login' }).click()
  const loginModal = page.locator('#login-modal')
  await loginModal.waitFor({ state: 'visible', timeout: timeoutMs })

  await loginModal
    .getByPlaceholder('Username or Email ID')
    .fill(payload.username)
  await loginModal.locator('#login_password').fill(payload.password)
  await page
    .locator('form')
    .filter({ hasText: 'Login Type your username and' })
    .locator('button')
    .click()

  const outcome = await waitForLoginOutcome(page, loginModal, timeoutMs)
  if (outcome.type === 'success') {
    return
  }
  if (outcome.type === 'error') {
    throw new Error(outcome.message)
  }
  if (outcome.type === 'verify') {
    await completeVerification(page, payload.verificationCode)
    const afterVerify = await waitForLoginOutcome(page, loginModal, timeoutMs)
    if (afterVerify.type === 'success') {
      return
    }
    if (afterVerify.type === 'error') {
      throw new Error(afterVerify.message)
    }
    throw new Error('Verification failed. Please try again.')
  }

  throw new Error('Login timed out. Please try again.')
}

export const verifyTestZ7iLogin = async (payload: {
  username: string
  password: string
  verificationCode?: string
}) => {
  const browser = await chromium.launch({ headless: env.scraperHeadless })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await login(page, {
      ...payload,
      timeoutMs: Math.min(env.scraperTimeoutMs, 12000),
    })
  } finally {
    await context.close()
    await browser.close()
  }
}

export const scrapeTestZ7iV2 = async (payload: {
  username: string
  password: string
  verificationCode?: string
  existingExamIds?: string[]
  forceFullExamIds?: string[]
  skipExamIds?: string[]
  onlyExamIds?: string[]
  onProgress?: (progress: ScrapeProgress) => Promise<void> | void
}): Promise<ScrapeResult> => {
  const baseUrl = env.scraperBaseUrl
  const warnings: string[] = []
  const skipExamIds = new Set(payload.skipExamIds ?? [])

  const browser = await chromium.launch({ headless: env.scraperHeadless })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await login(page, payload)
    const packageIdFromNetwork = page
      .waitForResponse(
        (response) =>
          response.url().includes('/student/tests/get-mypackage-details/'),
        { timeout: env.scraperTimeoutMs },
      )
      .then((response) => extractPackageIdFromUrl(response.url()))
      .catch(() => null)

    await page.goto(`${baseUrl}/student/tests`, {
      waitUntil: 'domcontentloaded',
      timeout: env.scraperTimeoutMs,
    })
    const testsHtml = await page.content()
    await saveDebugHtml('tests', testsHtml)

    const packageId =
      env.scraperPackageId ||
      (await packageIdFromNetwork) ||
      extractPackageIdFromHtml(testsHtml)
    if (!packageId) {
      throw new Error(
        'Unable to resolve package id. Set SCRAPER_PACKAGE_ID or verify the tests page HTML.',
      )
    }

    const response = await context.request.get(
      `${baseUrl}/student/tests/get-mypackage-details/${packageId}`,
      { timeout: env.scraperTimeoutMs },
    )
    const body = await response.text()
    const parsed = tryParseJsonPayload(body)
    if (!response.ok() || !parsed) {
      await saveDebugText('package-details', body)
      throw new Error('Failed to load tests list from package details.')
    }
    await saveDebugJson('package-details', parsed)

    const tests = extractTestsList(parsed)
      .map((entry, index) => parseTestEntry(entry as Record<string, unknown>, index))
      .filter((entry) => entry.reportId)
    if (tests.length === 0) {
      throw new Error('No tests found in package details response.')
    }

    const onlyExamIds = new Set(payload.onlyExamIds ?? [])
    const filteredTests =
      onlyExamIds.size > 0
        ? tests.filter((test) => onlyExamIds.has(test.reportId))
        : tests
    if (filteredTests.length === 0) {
      throw new Error('No tests matched the requested filters.')
    }

    await payload.onProgress?.({ completed: 0, total: filteredTests.length })
    const reports: ScrapedReport[] = []
    let completed = 0

    for (const test of filteredTests) {
      if (skipExamIds.has(test.reportId)) {
        warnings.push(`Skipping ${test.title} (already synced for this user).`)
        completed += 1
        await payload.onProgress?.({
          completed,
          total: filteredTests.length,
          currentTitle: test.title,
        })
        continue
      }

      let questions: ScrapedQuestion[] = []
      let answers: ScrapedAnswer[] = []
      let examDate = test.examDate
      let title = test.title
      let scoreOverview: ScrapedScoreOverview | undefined

      try {
        const response = await context.request.get(
          `${baseUrl}/student/reports/get-score-overview/${test.reportId}`,
          { timeout: env.scraperTimeoutMs },
        )
        const body = await response.text()
        const parsed = tryParseJsonPayload(body)
        if (response.ok() && parsed) {
          await saveDebugJson(`score-overview-${test.reportId}`, parsed)
          const extracted = extractScoreOverviewFromJson(parsed)
          if (extracted) {
            if (extracted.title) {
              title = extracted.title
            }
            scoreOverview = extracted.overview ?? undefined
          }
        } else if (response.ok()) {
          await saveDebugText(`score-overview-${test.reportId}`, body)
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : 'Unknown error'
        warnings.push(`Score overview fetch failed for ${test.title}: ${err}`)
      }

      try {
        const questionResponse = await context.request.get(
          `${baseUrl}/student/reports/questionwise/${test.reportId}`,
          { timeout: env.scraperTimeoutMs },
        )
        const questionBody = await questionResponse.text()
        const questionPayload = tryParseJsonPayload(questionBody)
        if (questionResponse.ok() && questionPayload) {
          await saveDebugJson(`question-wise-${test.reportId}`, questionPayload)
          const derivedDate = extractExamDateFromQuestionwise(questionPayload)
          if (derivedDate) {
            examDate = derivedDate
          }
          const parsedQuestions = parseQuestionwisePayload(questionPayload, true)
          if (parsedQuestions.warnings.length > 0) {
            warnings.push(...parsedQuestions.warnings)
          }
          questions = parsedQuestions.questions
          answers = parsedQuestions.answers
        } else {
          await saveDebugText(`question-wise-${test.reportId}`, questionBody)
          warnings.push(`Questionwise response malformed for ${test.title}.`)
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : 'Unknown error'
        warnings.push(`Questionwise fetch failed for ${test.title}: ${err}`)
      }

      if (questions.length === 0) {
        warnings.push(`No questions parsed for ${test.title}.`)
      }
      if (answers.length === 0) {
        warnings.push(`No answers parsed for ${test.title}.`)
      }

      reports.push({
        externalExamId: test.reportId,
        title,
        examDate,
        scoreOverview,
        questions,
        answers,
      })

      completed += 1
      await payload.onProgress?.({
        completed,
        total: filteredTests.length,
        currentTitle: test.title,
      })
    }

    return { reports, warnings }
  } finally {
    await context.close()
    await browser.close()
  }
}
