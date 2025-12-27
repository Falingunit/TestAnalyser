import { load, type Cheerio, type Element } from 'cheerio'
import { chromium, type Page } from 'playwright'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { env } from '../config'
import type {
  ScrapeProgress,
  ScrapeResult,
  ScrapedAnswer,
  ScrapedQuestion,
  ScrapedReport,
  ScrapedQuestionType,
  ScrapedSubject,
} from './types'

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

const toAbsoluteUrl = (baseUrl: string, href: string) =>
  href.startsWith('http') ? href : new URL(href, baseUrl).toString()

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

const saveDebugText = async (name: string, text: string) => {
  const dir = await ensureDebugDir()
  if (!dir) {
    return
  }
  const filePath = join(dir, `${name}.txt`)
  await writeFile(filePath, text, 'utf8')
}

const saveDebugJson = async (name: string, payload: unknown) => {
  const dir = await ensureDebugDir()
  if (!dir) {
    return
  }
  const filePath = join(dir, `${name}.json`)
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
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

const extractHtmlOrText = ($el: Cheerio<Element>) => {
  const html = $el.html()
  if (html && html.trim()) {
    return html.trim()
  }
  const text = $el.text().trim()
  return text
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

const subjectOrder: ScrapedSubject[] = [
  'PHYSICS',
  'CHEMISTRY',
  'MATHEMATICS',
]

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

const extractMetaValue = ($row: Cheerio<Element>, labels: string[]) => {
  const normalizedLabels = labels.map((label) =>
    collapseText(label).toLowerCase().replace(/:$/, ''),
  )
  const labelSpan = $row
    .find('p span')
    .filter((_, el) => {
      const text = collapseText(el.textContent ?? '')
        .toLowerCase()
        .replace(/:$/, '')
      return normalizedLabels.includes(text)
    })
    .first()
  if (!labelSpan.length) {
    return null
  }
  const valueSpan = labelSpan.next('span')
  return valueSpan.length ? collapseText(valueSpan.text()) : null
}

const extractQuestionNumber = ($row: Cheerio<Element>) => {
  const candidates = [
    collapseText($row.find('.col-xs-2').first().text()),
    collapseText(
      $row.find('.qno, .q-no, .question-no, .qnum').first().text(),
    ),
    $row.attr('data-qno') ?? '',
    $row.attr('data-question-number') ?? '',
  ]

  for (const candidate of candidates) {
    const match = candidate.match(/(\d+)/)
    if (!match) {
      continue
    }
    const number = Number.parseInt(match[1], 10)
    if (Number.isFinite(number)) {
      return number
    }
  }

  return null
}

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

const parseResultsPage = (baseUrl: string, html: string) => {
  const $ = load(html)
  const panel = $('div.panel-heading')
    .filter((_, el) => collapseText($(el).text()) === 'Test wise Performance Summary')
    .closest('.panel')
  const table = panel.find('table').first()
  const results: Array<{
    title: string
    correct: number
    incorrect: number
    maxScore: number
    score: number
    percent: string
    reportUrl: string
  }> = []

  table.find('tbody tr').each((_index, row) => {
    const $row = $(row)
    const title = collapseText($row.find('td').eq(1).text())
    const reportHref = $row.find('a[href*="/view-report/"]').attr('href')
    if (!title || !reportHref) {
      return
    }
    const correct = Number.parseInt(collapseText($row.find('td').eq(2).text()), 10)
    const incorrect = Number.parseInt(collapseText($row.find('td').eq(3).text()), 10)
    const maxScore = Number.parseInt(collapseText($row.find('td').eq(4).text()), 10)
    const score = Number.parseInt(collapseText($row.find('td').eq(5).text()), 10)
    const percent = collapseText($row.find('td').eq(7).text())

    results.push({
      title,
      correct: Number.isNaN(correct) ? 0 : correct,
      incorrect: Number.isNaN(incorrect) ? 0 : incorrect,
      maxScore: Number.isNaN(maxScore) ? 0 : maxScore,
      score: Number.isNaN(score) ? 0 : score,
      percent,
      reportUrl: toAbsoluteUrl(baseUrl, reportHref),
    })
  })

  return results
}

const parseScoreOverview = (html: string) => {
  const $ = load(html)
  const heading = $('h3, h4')
    .filter((_, el) => collapseText($(el).text()).includes('Test Report of'))
    .first()
  const title = collapseText(heading.text()).replace('Test Report of', '').trim()

  const table = $('#score_overview').find('table').first()
  const data: Record<string, string> = {}

  table.find('tr').each((_index, row) => {
    const cells = $(row).children('th,td').toArray()
    for (let i = 0; i < cells.length; i += 2) {
      const key = cells[i]
      const value = cells[i + 1]
      if (!key || !value) {
        continue
      }
      const keyText = collapseText($(key).text())
      const valueText = collapseText($(value).text())
      if (keyText) {
        data[keyText] = valueText
      }
    }
  })

  const rawDate =
    data['Test Date'] ??
    data['Exam Date'] ??
    data['Date'] ??
    data['Date of Exam'] ??
    ''

  return {
    title,
    examDate: rawDate ? normalizeDate(rawDate) : normalizeDate(new Date().toISOString()),
    maxScore: Number.parseInt(data['Max Score of Test'] ?? '', 10),
    totalTimeMin: Number.parseInt(data['Total Test Time(Mins)'] ?? '', 10),
    totalQuestions: Number.parseInt(data['Total Questions'] ?? '', 10),
    score: Number.parseInt(data['Your Score'] ?? '', 10),
    correct: Number.parseInt(data['Correct'] ?? '', 10),
    incorrect: Number.parseInt(data['Incorrect'] ?? '', 10),
    bonus: Number.parseInt(data['Bonus Marks'] ?? '', 10),
    unattempted: Number.parseInt(data['Unattempted'] ?? '', 10),
  }
}

const extractScoreOverviewFromJson = (payload: unknown) => {
  const toStringValue = (value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed ? trimmed : null
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : null
    }
    return null
  }

  const findStringForKeys = (value: unknown, patterns: RegExp[]) => {
    let found: string | null = null
    const visit = (node: unknown) => {
      if (found) {
        return
      }
      if (Array.isArray(node)) {
        for (const item of node) {
          visit(item)
          if (found) {
            return
          }
        }
        return
      }
      if (!node || typeof node !== 'object') {
        return
      }
      for (const [key, val] of Object.entries(node)) {
        if (patterns.some((pattern) => pattern.test(key))) {
          const str = toStringValue(val)
          if (str) {
            found = str
            return
          }
        }
        visit(val)
        if (found) {
          return
        }
      }
    }
    visit(value)
    return found
  }

  const title = findStringForKeys(payload, [
    /title/i,
    /test[_\s-]*name/i,
    /exam[_\s-]*name/i,
    /test[_\s-]*title/i,
  ])
  const examDateRaw = findStringForKeys(payload, [
    /exam[_\s-]*date/i,
    /test[_\s-]*date/i,
    /\bdate of exam\b/i,
    /^date$/i,
  ])

  return {
    title: title ?? null,
    examDate: examDateRaw ? normalizeDate(examDateRaw) : null,
  }
}

const parseSubjectNames = (html: string) => {
  const $ = load(html)
  const table = $('.reportsubject table').first()
  const subjects: string[] = []
  table.find('tbody tr').each((_index, row) => {
    const $row = $(row)
    if ($row.hasClass('ng-hide')) {
      return
    }
    const name = collapseText($row.find('td').first().text())
    if (!name || name.toLowerCase() === 'all') {
      return
    }
    subjects.push(name)
  })

  return subjects
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

const parseSolutionQuestions = (html: string, subject: ScrapedSubject) => {
  const $ = load(html)
  const questions = new Map<number, ScrapedQuestion & { isEnglish: boolean }>()

  $('.reportsolution .qrow').each((_index, row) => {
    const $row = $(row)
    if ($row.hasClass('ng-hide')) {
      return
    }

    const sourceNumber = extractQuestionNumber($row)
    if (!sourceNumber) {
      return
    }

    const classNames = ($row.attr('class') ?? '').toLowerCase()
    const isEnglish =
      classNames.includes('langen') ||
      classNames.includes('lang-en') ||
      classNames.includes('lang_en')

    const $questionBlock = $row.find('.q').first().clone()
    $questionBlock.find('.sol-content').remove()
    const promptParts = $questionBlock
      .find('.q-part')
      .map((_i, el) => extractHtmlOrText($(el)))
      .get()
      .filter(Boolean)

    const questionContent =
      promptParts.length > 0
        ? promptParts.join('<br />')
        : extractHtmlOrText($questionBlock) || `Question ${sourceNumber}`

    const optionMap = new Map<string, string>()
    $row.find('.opt-group').each((_i, el) => {
      const key = collapseText($(el).find('.opt-input').text())
        .replace(/[()]/g, '')
        .toUpperCase()
      const value = extractHtmlOrText($(el).find('.opt-data'))
      if (['A', 'B', 'C', 'D'].includes(key)) {
        optionMap.set(key, value)
      }
    })

    if (optionMap.size === 0) {
      $row.find('.opt-data, .option, .opt').each((_i, el) => {
        const $el = $(el)
        const rawLabel = collapseText(
          $el.find('.opt-input, .option-label, .opt-label').first().text(),
        )
        const labelMatch = rawLabel.match(/[A-D]/i)
        const label =
          labelMatch?.[0]?.toUpperCase() ??
          collapseText($el.text()).match(/^\s*[\(\[]?\s*([A-D])\b/i)?.[1]?.toUpperCase()
        if (!label || !['A', 'B', 'C', 'D'].includes(label)) {
          return
        }
        const value =
          extractHtmlOrText($el.find('.opt-data').first()) ||
          extractHtmlOrText($el)
        optionMap.set(label, value)
      })
    }

    let listOptions = $row
      .find('ol[type="a"] li, ol[type="A"] li')
      .map((_i, el) => extractHtmlOrText($(el)))
      .get()
    if (listOptions.length === 0) {
      const labeledList = new Map<string, string>()
      $row.find('ol li, ul li').each((_i, el) => {
        const $el = $(el)
        const text = collapseText($el.text())
        const labelMatch = text.match(/^\s*[\(\[]?\s*([A-D])[\)\].:-]\s*/i)
        if (!labelMatch) {
          return
        }
        const label = labelMatch[1].toUpperCase()
        if (!['A', 'B', 'C', 'D'].includes(label)) {
          return
        }
        labeledList.set(label, extractHtmlOrText($el))
      })
      if (labeledList.size > 0) {
        listOptions = ['A', 'B', 'C', 'D'].map(
          (letter) => labeledList.get(letter) ?? null,
        )
      }
    }

    const correctAnswerRaw = normalizeAnswer(
      extractMetaValue($row, [
        'Correct Ans',
        'Correct Answer',
        'Correct Answer(s)',
        'Correct Ans.',
      ]),
    )
    const questionTypeText = extractMetaValue($row, [
      'Question Type',
      'Q Type',
      'Type',
    ])
    const hasOptionMarkup = optionMap.size > 0 || listOptions.length > 0
    const qtype = inferQuestionType({
      metaTypeText: questionTypeText,
      hasOptions: hasOptionMarkup,
      correctAnswerRaw,
    })
    const marking = getMarkingForType(qtype)
    const optionContents = ['A', 'B', 'C', 'D'].map((letter, idx) => {
      return optionMap.get(letter) || listOptions[idx] || null
    })
    const useOptions =
      qtype === 'NAT' ? [null, null, null, null] : optionContents

    const question: ScrapedQuestion & { isEnglish: boolean } = {
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
      isEnglish,
    }

    const existing = questions.get(sourceNumber)
    if (!existing || (!existing.isEnglish && isEnglish)) {
      questions.set(sourceNumber, question)
    }
  })

  return Array.from(questions.values()).map(({ isEnglish, ...rest }) => rest)
}

const parseQuestionWiseAnswers = async (
  html: string,
  includeCorrectAnswer = true,
  debugName?: string,
) => {
  const $ = load(html)
  const table = $('.reportqs table').first()
  const answers: ScrapedAnswer[] = []

  let numberIndex = 0
  let correctIndex = 1
  let selectedIndex = 2
  let timeIndex = 3

  const headerCells = table.find('thead th')
  const headerLabels: string[] = []
  if (headerCells.length > 0) {
    headerCells.each((idx, el) => {
      const text = collapseText($(el).text()).toLowerCase()
      if (!text) {
        return
      }
      headerLabels.push(text)
      if (text.includes('question') && (text.includes('no') || text.includes('#'))) {
        numberIndex = idx
        return
      }
      if (
        text.includes('your') ||
        text.includes('selected') ||
        text.includes('marked') ||
        text.includes('given')
      ) {
        selectedIndex = idx
        return
      }
      if (text.includes('correct')) {
        correctIndex = idx
        return
      }
      if (text.includes('time') || text.includes('duration')) {
        timeIndex = idx
      }
    })
  }

  const rawRows: string[] = []

  table.find('tbody tr').each((_index, row) => {
    const $row = $(row)
    const cells = $row.find('td')
    if (cells.length < 2) {
      return
    }

    if (debugName) {
      const cellText = cells
        .toArray()
        .map((cell, idx) => `${idx}:${collapseText($(cell).text())}`)
        .join(' | ')
      rawRows.push(cellText)
    }

    const numberText = collapseText(cells.eq(numberIndex).text())
    const sourceNumber = Number.parseInt(numberText.replace(/\D/g, ''), 10)
    if (!Number.isFinite(sourceNumber)) {
      return
    }

    const correctAnswerRaw = includeCorrectAnswer
      ? normalizeAnswer(collapseText(cells.eq(correctIndex).text()))
      : null
    const selectedAnswerRaw = normalizeAnswer(
      collapseText(cells.eq(selectedIndex).text()),
    )
    const timeSpent = Number.parseInt(
      collapseText(cells.eq(timeIndex).text()),
      10,
    )

    answers.push({
      sourceNumber,
      selectedAnswerRaw,
      correctAnswerRaw,
      timeSpentSec: Number.isNaN(timeSpent) ? 0 : timeSpent,
    })
  })

  if (debugName) {
    const headerLine =
      headerLabels.length > 0 ? `headers: ${headerLabels.join(' | ')}` : ''
    const indexLine = `indexes: number=${numberIndex} correct=${correctIndex} selected=${selectedIndex} time=${timeIndex}`
    const payload = [headerLine, indexLine, ...rawRows].filter(Boolean).join('\n')
    await saveDebugText(debugName, payload)
  }

  return answers
}

const openLoginModal = async (page: Page) => {
  const loginTrigger = page.locator('a.login').first()
  await loginTrigger.waitFor({ state: 'attached', timeout: env.scraperTimeoutMs })
  if (await loginTrigger.isVisible()) {
    await loginTrigger.click()
  } else {
    await loginTrigger.evaluate((node) => (node as HTMLElement).click())
  }
  const loginModal = page.locator('#login-modal')
  await loginModal.waitFor({ state: 'visible', timeout: env.scraperTimeoutMs })
}

const completeVerification = async (page: Page, verificationCode?: string) => {
  const verifyModal = page.locator('#verify-modal')
  if (!(await verifyModal.isVisible())) {
    return
  }

  if (!verificationCode) {
    throw new Error('Verification code required. Provide an OTP to continue.')
  }

  await page.locator('input[ng-model="verify.code"]').fill(verificationCode)
  await page.locator('#verify-modal button.log-in').click()
}

const login = async (
  page: Page,
  payload: { username: string; password: string; verificationCode?: string },
) => {
  await page.goto(env.scraperBaseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: env.scraperTimeoutMs,
  })

  if (page.url().includes('/student/')) {
    return
  }

  await openLoginModal(page)

  await page.locator('input[ng-model="signin.username"]').fill(payload.username)
  await page.locator('input[ng-model="signin.password"]').fill(payload.password)
  await page.locator('#login-modal button.log-in').click()

  try {
    await page.waitForURL(/\/student\//i, { timeout: env.scraperTimeoutMs })
  } catch {
    const errorText = await page
      .locator('#login-modal .err.text-left')
      .first()
      .textContent()
    if (errorText?.trim()) {
      throw new Error(`Login failed: ${errorText.trim()}`)
    }

    await completeVerification(page, payload.verificationCode)
    await page.waitForURL(/\/student\//i, { timeout: env.scraperTimeoutMs })
  }
}

const selectSubject = async (page: Page, label: string) => {
  const scopedArrow = page.locator(
    '.reportsolution .select2-selection__arrow > b',
  )
  if ((await scopedArrow.count()) > 0) {
    await scopedArrow.first().click()
  } else {
    await page.locator('.select2-selection__arrow > b').first().click()
  }
  await page.getByRole('treeitem', { name: label }).click()
  const scopedRendered = page.locator(
    '.reportsolution .select2-selection__rendered',
  )
  const rendered =
    (await scopedRendered.count()) > 0
      ? scopedRendered.first()
      : page.locator('.select2-selection__rendered').first()
  const selector =
    (await scopedRendered.count()) > 0
      ? '.reportsolution .select2-selection__rendered'
      : '.select2-selection__rendered'
  await page.waitForFunction(
    ({ selector: sel, expected }) => {
      const element = document.querySelector(sel)
      if (!element) {
        return false
      }
      const text = (element.textContent ?? '').toLowerCase()
      return text.includes((expected ?? '').toLowerCase())
    },
    { selector, expected: label },
    { timeout: env.scraperTimeoutMs },
  )
  await page.waitForTimeout(400)
}

export const scrapeTestZ7i = async (payload: {
  username: string
  password: string
  verificationCode?: string
  existingExamIds?: string[]
  forceFullExamIds?: string[]
  skipExamIds?: string[]
  onProgress?: (progress: ScrapeProgress) => Promise<void> | void
}): Promise<ScrapeResult> => {
  const baseUrl = env.scraperBaseUrl
  const warnings: string[] = []
  const debugDir = await ensureDebugDir()
  const existingExamIds = new Set(payload.existingExamIds ?? [])
  const forceFullExamIds = new Set(payload.forceFullExamIds ?? [])
  const skipExamIds = new Set(payload.skipExamIds ?? [])

  const browser = await chromium.launch({ headless: env.scraperHeadless })
  const context = await browser.newContext()
  if (env.scraperTrace && debugDir) {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  }

  const page = await context.newPage()

  try {
    await login(page, payload)

    await page.goto(`${baseUrl}/student/reports`, {
      waitUntil: 'networkidle',
      timeout: env.scraperTimeoutMs,
    })

    const resultsHtml = await page.content()
    await saveDebugHtml('results', resultsHtml)

    const results = parseResultsPage(baseUrl, resultsHtml)
    if (results.length === 0) {
      throw new Error('No reports found on the results page.')
    }

    await payload.onProgress?.({ completed: 0, total: results.length })
    const reports: ScrapedReport[] = []
    let completed = 0

    for (const result of results) {
      const reportId = result.reportUrl.split('/').pop() ?? result.title
      if (skipExamIds.has(reportId)) {
        warnings.push(`Skipping ${result.title} (already synced for this user).`)
        completed += 1
        await payload.onProgress?.({
          completed,
          total: results.length,
          currentTitle: result.title,
        })
        continue
      }
      await page.goto(result.reportUrl, {
        waitUntil: 'networkidle',
        timeout: env.scraperTimeoutMs,
      })

      const reportHtml = await page.content()
      await saveDebugHtml(`report-${reportId}`, reportHtml)

      let meta = parseScoreOverview(reportHtml)
      try {
        const response = await context.request.get(
          `${baseUrl}/student/reports/get-score-overview/${reportId}`,
          { timeout: env.scraperTimeoutMs },
        )
        const contentType = response.headers()['content-type'] ?? ''
        const body = await response.text()
        const payload = tryParseJsonPayload(body)
        if (response.ok() && payload) {
          await saveDebugJson(`score-overview-${reportId}`, payload)
          const jsonMeta = extractScoreOverviewFromJson(payload)
          meta = {
            ...meta,
            title: jsonMeta.title ?? meta.title,
            examDate: jsonMeta.examDate ?? meta.examDate,
          }
        } else if (response.ok() && contentType.includes('application/json')) {
          warnings.push(`Score overview JSON malformed for ${result.title}.`)
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : 'Unknown error'
        warnings.push(`Score overview JSON failed for ${result.title}: ${err}`)
      }
      const shouldFetchFull =
        forceFullExamIds.has(reportId) || !existingExamIds.has(reportId)

      let questionwisePayload: unknown | null = null
      try {
        const response = await context.request.get(
          `${baseUrl}/student/reports/questionwise/${reportId}`,
          { timeout: env.scraperTimeoutMs },
        )
        const body = await response.text()
        const parsed = tryParseJsonPayload(body)
        if (response.ok() && parsed) {
          questionwisePayload = parsed
          await saveDebugJson(`question-wise-${reportId}`, parsed)
        } else if (response.ok()) {
          await saveDebugText(`question-wise-${reportId}`, body)
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : 'Unknown error'
        warnings.push(`Questionwise JSON failed for ${result.title}: ${err}`)
      }

      if (shouldFetchFull) {
        const subjects = parseSubjectNames(reportHtml)
        const rawSubjectEntries =
          subjects.length > 0
            ? subjects.map((label) => ({
                label,
                subject: normalizeSubject(label),
              }))
            : subjectOrder.map((subject) => ({
                label: subject,
                subject,
              }))
        const subjectEntries = rawSubjectEntries.some((entry) => entry.subject)
          ? rawSubjectEntries
          : subjectOrder.map((subject) => ({ label: subject, subject }))
        let questions: ScrapedQuestion[] = []
        let answers: ScrapedAnswer[] = []

        if (questionwisePayload) {
          const parsed = parseQuestionwisePayload(questionwisePayload, true)
          if (parsed.warnings.length > 0) {
            warnings.push(...parsed.warnings)
          }
          if (parsed.questions.length > 0) {
            questions = parsed.questions
            answers = parsed.answers
          }
        }

        if (questions.length === 0) {
          await page.getByRole('link', { name: /solution/i }).click()
          await page.waitForLoadState('networkidle', { timeout: env.scraperTimeoutMs })

          for (const entry of subjectEntries) {
            if (!entry.subject) {
              warnings.push(`Unrecognized subject label "${entry.label}".`)
              continue
            }
            await selectSubject(page, entry.label)
            const subjectHtml = await page.content()
            await saveDebugHtml(
              `solution-${reportId}-${entry.label.toLowerCase()}`,
              subjectHtml,
            )
            const parsedQuestions = parseSolutionQuestions(subjectHtml, entry.subject)
            if (parsedQuestions.length === 0) {
              warnings.push(`No questions parsed for ${result.title} (${entry.label}).`)
            }
            questions.push(...parsedQuestions)
          }
        }

        if (questions.length === 0) {
          warnings.push(`No questions parsed for ${result.title}.`)
        }

        if (answers.length === 0) {
          await page.getByRole('link', { name: /question wise/i }).click()
          await page.waitForLoadState('networkidle', { timeout: env.scraperTimeoutMs })
          const questionWiseHtml = await page.content()
          await saveDebugHtml(`question-wise-${reportId}`, questionWiseHtml)
          answers = await parseQuestionWiseAnswers(
            questionWiseHtml,
            true,
            `question-wise-raw-${reportId}`,
          )
        }
        if (answers.length === 0) {
          warnings.push(`No question-wise answers parsed for ${result.title}.`)
        }

        reports.push({
          externalExamId: reportId,
          title: meta.title || result.title,
          examDate: meta.examDate,
          questions,
          answers,
        })
      } else {
        let answers: ScrapedAnswer[] = []
        if (questionwisePayload) {
          const parsed = parseQuestionwisePayload(questionwisePayload, false)
          if (parsed.warnings.length > 0) {
            warnings.push(...parsed.warnings)
          }
          answers = parsed.answers
        }
        if (answers.length === 0) {
          await page.getByRole('link', { name: /question wise/i }).click()
          await page.waitForLoadState('networkidle', { timeout: env.scraperTimeoutMs })
          const questionWiseHtml = await page.content()
          await saveDebugHtml(`question-wise-${reportId}`, questionWiseHtml)
          answers = await parseQuestionWiseAnswers(
            questionWiseHtml,
            false,
            `question-wise-raw-${reportId}`,
          )
        }
        if (answers.length === 0) {
          warnings.push(`No question-wise answers parsed for ${result.title}.`)
        }

        reports.push({
          externalExamId: reportId,
          title: meta.title || result.title,
          examDate: meta.examDate,
          answers,
        })
      }

      completed += 1
      await payload.onProgress?.({
        completed,
        total: results.length,
        currentTitle: result.title,
      })
    }

    return { reports, warnings }
  } catch (error) {
    const err = error instanceof Error ? error.message : 'Unknown error'
    if (debugDir) {
      const filePath = join(debugDir, 'last-error.txt')
      await writeFile(filePath, err, 'utf8')
    }
    throw error
  } finally {
    if (env.scraperTrace && debugDir) {
      await context.tracing.stop({ path: join(debugDir, 'trace.zip') })
    }
    await context.close()
    await browser.close()
  }
}
