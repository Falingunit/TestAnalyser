import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'

const MANAGED_UPLOAD_PREFIX = '/uploads/question-assets'
const TEMP_SEGMENT = '/temp'
const QUESTIONS_SEGMENT = '/questions'

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/
const IMAGE_SRC_PATTERN = /<img\b[^>]*?\bsrc\s*=\s*['"]([^'"]+)['"][^>]*>/gi

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
}

export const getUploadsRoot = () => path.resolve(process.cwd(), 'uploads')

const ensureDirectory = async (directoryPath: string) => {
  await fs.mkdir(directoryPath, { recursive: true })
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getExtensionForMime = (mimeType: string) => {
  if (MIME_EXTENSION_MAP[mimeType]) {
    return MIME_EXTENSION_MAP[mimeType]
  }
  const subtype = mimeType.split('/')[1]?.trim().toLowerCase() ?? 'png'
  const safeSubtype = subtype.replace(/[^a-z0-9]+/g, '')
  return safeSubtype ? `.${safeSubtype}` : '.png'
}

const toFileSystemPath = (assetPath: string) => {
  const normalized = assetPath.split('/').filter(Boolean)
  return path.join(getUploadsRoot(), ...normalized.slice(1))
}

const normalizeManagedAssetPath = (value: string) => {
  try {
    const parsed = value.startsWith('http://') || value.startsWith('https://')
      ? new URL(value)
      : new URL(value, 'http://local.test')
    const pathname = parsed.pathname
    return pathname.startsWith(MANAGED_UPLOAD_PREFIX) ? pathname : null
  } catch {
    return value.startsWith(MANAGED_UPLOAD_PREFIX) ? value : null
  }
}

const replaceAssetUrl = (
  html: string,
  sourceValues: string[],
  replacement: string,
) => {
  let next = html
  sourceValues.forEach((value) => {
    next = next.replace(new RegExp(escapeRegExp(value), 'g'), replacement)
  })
  return next
}

export const hasVisibleHtmlContent = (value: string | null | undefined) => {
  if (!value) {
    return false
  }
  if (/<img\b/i.test(value)) {
    return true
  }
  const normalized = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .trim()
  return normalized.length > 0
}

export const saveTemporaryQuestionImage = async (payload: {
  userId: string
  dataUrl: string
  baseUrl: string
}) => {
  const match = payload.dataUrl.match(DATA_URL_PATTERN)
  if (!match) {
    throw new Error('Invalid image payload.')
  }

  const [, mimeType, base64Body] = match
  const buffer = Buffer.from(base64Body, 'base64')
  const extension = getExtensionForMime(mimeType)
  const relativePath = `${MANAGED_UPLOAD_PREFIX}${TEMP_SEGMENT}/${payload.userId}/${randomUUID()}${extension}`
  const filePath = toFileSystemPath(relativePath)

  await ensureDirectory(path.dirname(filePath))
  await fs.writeFile(filePath, buffer)

  return {
    path: relativePath,
    url: `${payload.baseUrl}${relativePath}`,
  }
}

export const deleteTemporaryQuestionImages = async (payload: {
  userId: string
  urls: string[]
}) => {
  const allowedPrefix = `${MANAGED_UPLOAD_PREFIX}${TEMP_SEGMENT}/${payload.userId}/`
  const deletions = payload.urls
    .map(normalizeManagedAssetPath)
    .filter((assetPath): assetPath is string => Boolean(assetPath))
    .filter((assetPath) => assetPath.startsWith(allowedPrefix))
    .map(async (assetPath) => {
      try {
        await fs.unlink(toFileSystemPath(assetPath))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    })

  await Promise.all(deletions)
}

type ManagedImageMatch = {
  source: string
  assetPath: string
}

const extractManagedImageMatches = (html: string) => {
  const matches: ManagedImageMatch[] = []
  let match: RegExpExecArray | null
  IMAGE_SRC_PATTERN.lastIndex = 0
  while ((match = IMAGE_SRC_PATTERN.exec(html)) !== null) {
    const source = match[1]
    const assetPath = normalizeManagedAssetPath(source)
    if (!assetPath) {
      continue
    }
    matches.push({ source, assetPath })
  }
  return matches
}

const collectPermanentQuestionAssets = (
  questionId: string,
  htmlValues: Array<string | null | undefined>,
) => {
  const questionPrefix = `${MANAGED_UPLOAD_PREFIX}${QUESTIONS_SEGMENT}/${questionId}/`
  return new Set(
    htmlValues
      .flatMap((value) => extractManagedImageMatches(value ?? ''))
      .map((item) => item.assetPath)
      .filter((assetPath) => assetPath.startsWith(questionPrefix)),
  )
}

export const finalizeQuestionContentAssets = async (payload: {
  userId: string
  questionId: string
  baseUrl: string
  questionContent: string
  optionContentA: string | null
  optionContentB: string | null
  optionContentC: string | null
  optionContentD: string | null
  solutionContent: string | null
  previousHtmlValues: Array<string | null | undefined>
}) => {
  const fields = {
    questionContent: payload.questionContent,
    optionContentA: payload.optionContentA,
    optionContentB: payload.optionContentB,
    optionContentC: payload.optionContentC,
    optionContentD: payload.optionContentD,
    solutionContent: payload.solutionContent,
  }
  const tempPrefix = `${MANAGED_UPLOAD_PREFIX}${TEMP_SEGMENT}/${payload.userId}/`
  const finalPrefix = `${MANAGED_UPLOAD_PREFIX}${QUESTIONS_SEGMENT}/${payload.questionId}/`
  const finalDirectory = toFileSystemPath(finalPrefix)
  const moveMap = new Map<string, string>()

  for (const [fieldName, htmlValue] of Object.entries(fields)) {
    if (!htmlValue) {
      continue
    }
    const matches = extractManagedImageMatches(htmlValue)
    let nextHtml = htmlValue

    for (const match of matches) {
      if (!match.assetPath.startsWith(tempPrefix)) {
        continue
      }

      let targetUrl = moveMap.get(match.assetPath)
      if (!targetUrl) {
        const sourcePath = toFileSystemPath(match.assetPath)
        const extension = path.extname(sourcePath) || '.png'
        const finalAssetPath = `${finalPrefix}${randomUUID()}${extension}`
        const targetPath = toFileSystemPath(finalAssetPath)
        await ensureDirectory(finalDirectory)
        await fs.rename(sourcePath, targetPath)
        targetUrl = `${payload.baseUrl}${finalAssetPath}`
        moveMap.set(match.assetPath, targetUrl)
      }

      nextHtml = replaceAssetUrl(nextHtml, [match.source, match.assetPath], targetUrl)
    }

    fields[fieldName as keyof typeof fields] = nextHtml
  }

  const previousAssets = collectPermanentQuestionAssets(
    payload.questionId,
    payload.previousHtmlValues,
  )
  const nextAssets = collectPermanentQuestionAssets(payload.questionId, [
    fields.questionContent,
    fields.optionContentA,
    fields.optionContentB,
    fields.optionContentC,
    fields.optionContentD,
    fields.solutionContent,
  ])

  const staleAssets = Array.from(previousAssets).filter(
    (assetPath) => !nextAssets.has(assetPath),
  )

  await Promise.all(
    staleAssets.map(async (assetPath) => {
      try {
        await fs.unlink(toFileSystemPath(assetPath))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    }),
  )

  return fields
}
