import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { getUploadsRoot } from './questionAssets.js'

const MANAGED_UPLOAD_PREFIX = '/uploads/community-assets'
const TEMP_SEGMENT = '/temp'
const SOLUTIONS_SEGMENT = '/solutions'
const COMMENTS_SEGMENT = '/comments'

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/
const MARKDOWN_IMAGE_PATTERN =
  /!\[[^\]]*]\((?:<)?([^)\s>]+)(?:>)?(?:\s+["'][^"']*["'])?\)/gi

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
}

const ensureDirectory = async (directoryPath: string) => {
  await fs.mkdir(directoryPath, { recursive: true })
}

const logCommunityAsset = (message: string, details?: Record<string, unknown>) => {
  console.log('[community-assets]', message, details ?? {})
}

const warnCommunityAsset = (message: string, details?: Record<string, unknown>) => {
  console.warn('[community-assets]', message, details ?? {})
}

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
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

type ManagedMarkdownImageMatch = {
  source: string
  assetPath: string
}

const extractManagedMarkdownImageMatches = (value: string) => {
  const matches: ManagedMarkdownImageMatch[] = []
  let match: RegExpExecArray | null
  MARKDOWN_IMAGE_PATTERN.lastIndex = 0
  while ((match = MARKDOWN_IMAGE_PATTERN.exec(value)) !== null) {
    const source = match[1]
    const assetPath = normalizeManagedAssetPath(source)
    if (!assetPath) {
      continue
    }
    matches.push({ source, assetPath })
  }
  return matches
}

const collectPermanentAssets = (
  entityPrefix: string,
  markdownValues: Array<string | null | undefined>,
) =>
  new Set(
    markdownValues
      .flatMap((value) => extractManagedMarkdownImageMatches(value ?? ''))
      .map((item) => item.assetPath)
      .filter((assetPath) => assetPath.startsWith(entityPrefix)),
  )

const replaceAssetUrl = (value: string, sourceValues: string[], replacement: string) => {
  let next = value
  sourceValues.forEach((sourceValue) => {
    next = next.replace(new RegExp(escapeRegExp(sourceValue), 'g'), replacement)
  })
  return next
}

const getEntityPrefix = (entityKind: 'solution' | 'comment', entityId: string) =>
  entityKind === 'solution'
    ? `${MANAGED_UPLOAD_PREFIX}${SOLUTIONS_SEGMENT}/${entityId}/`
    : `${MANAGED_UPLOAD_PREFIX}${COMMENTS_SEGMENT}/${entityId}/`

const promoteTempAsset = async (sourcePath: string, targetPath: string) => {
  try {
    await fs.rename(sourcePath, targetPath)
    logCommunityAsset('promoted temp asset via rename', {
      sourcePath,
      targetPath,
    })
    return
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    warnCommunityAsset('rename during finalize failed', {
      sourcePath,
      targetPath,
      code,
      message: error instanceof Error ? error.message : String(error),
    })
    if (code !== 'ENOENT') {
      throw error
    }
  }

  if (!(await fileExists(sourcePath))) {
    if (await fileExists(targetPath)) {
      logCommunityAsset('finalize target already exists after missing source', {
        sourcePath,
        targetPath,
      })
      return
    }
    warnCommunityAsset('temporary asset missing during finalize', {
      sourcePath,
      targetPath,
    })
    throw new Error('Temporary community image was not found during finalize.')
  }

  await fs.copyFile(sourcePath, targetPath)
  logCommunityAsset('promoted temp asset via copy', {
    sourcePath,
    targetPath,
  })
  try {
    await fs.unlink(sourcePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

export const hasVisibleMarkdownContent = (value: string | null | undefined) => {
  if (!value) {
    return false
  }
  if (MARKDOWN_IMAGE_PATTERN.test(value)) {
    MARKDOWN_IMAGE_PATTERN.lastIndex = 0
    return true
  }
  MARKDOWN_IMAGE_PATTERN.lastIndex = 0
  const normalized = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[[^\]]*\]\(([^)]+)\)/g, ' ')
    .replace(/[#>*_~`\-|!()[\]]/g, ' ')
    .trim()
  return normalized.length > 0
}

export const saveTemporaryCommunityImage = async (payload: {
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
  logCommunityAsset('saved temporary image', {
    userId: payload.userId,
    mimeType,
    bytes: buffer.length,
    relativePath,
    filePath,
  })

  return {
    path: relativePath,
    url: `${payload.baseUrl}${relativePath}`,
  }
}

export const deleteTemporaryCommunityImages = async (payload: {
  userId: string
  urls: string[]
}) => {
  const allowedPrefix = `${MANAGED_UPLOAD_PREFIX}${TEMP_SEGMENT}/${payload.userId}/`
  logCommunityAsset('cleanup request received', {
    userId: payload.userId,
    urlCount: payload.urls.length,
    urls: payload.urls,
  })
  const deletions = payload.urls
    .map(normalizeManagedAssetPath)
    .filter((assetPath): assetPath is string => Boolean(assetPath))
    .filter((assetPath) => assetPath.startsWith(allowedPrefix))
    .map(async (assetPath) => {
      const filePath = toFileSystemPath(assetPath)
      try {
        await fs.unlink(filePath)
        logCommunityAsset('deleted temporary image', {
          userId: payload.userId,
          assetPath,
          filePath,
        })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        warnCommunityAsset('temporary image already missing during cleanup', {
          userId: payload.userId,
          assetPath,
          filePath,
        })
      }
    })

  await Promise.all(deletions)
}

export const finalizeCommunityMarkdownAssets = async (payload: {
  userId: string
  entityKind: 'solution' | 'comment'
  entityId: string
  baseUrl: string
  markdown: string
  previousMarkdownValues: Array<string | null | undefined>
}) => {
  const tempPrefix = `${MANAGED_UPLOAD_PREFIX}${TEMP_SEGMENT}/${payload.userId}/`
  const entityPrefix = getEntityPrefix(payload.entityKind, payload.entityId)
  const entityDirectory = toFileSystemPath(entityPrefix)
  const moveMap = new Map<string, string>()

  let nextMarkdown = payload.markdown
  const matches = extractManagedMarkdownImageMatches(payload.markdown)
  logCommunityAsset('finalize start', {
    userId: payload.userId,
    entityKind: payload.entityKind,
    entityId: payload.entityId,
    totalMarkdownImages: matches.length,
    previousMarkdownValueCount: payload.previousMarkdownValues.length,
  })

  for (const match of matches) {
    if (!match.assetPath.startsWith(tempPrefix)) {
      continue
    }

    let targetUrl = moveMap.get(match.assetPath)
    if (!targetUrl) {
        const sourcePath = toFileSystemPath(match.assetPath)
        const extension = path.extname(sourcePath) || '.png'
        const finalAssetPath = `${entityPrefix}${randomUUID()}${extension}`
        const targetPath = toFileSystemPath(finalAssetPath)
        await ensureDirectory(entityDirectory)
        logCommunityAsset('finalizing temporary image', {
          userId: payload.userId,
          entityKind: payload.entityKind,
          entityId: payload.entityId,
          sourceAssetPath: match.assetPath,
          sourcePath,
          finalAssetPath,
          targetPath,
        })
        await promoteTempAsset(sourcePath, targetPath)
        targetUrl = `${payload.baseUrl}${finalAssetPath}`
        moveMap.set(match.assetPath, targetUrl)
      }

    nextMarkdown = replaceAssetUrl(nextMarkdown, [match.source, match.assetPath], targetUrl)
  }

  const previousAssets = collectPermanentAssets(
    entityPrefix,
    payload.previousMarkdownValues,
  )
  const nextAssets = collectPermanentAssets(entityPrefix, [nextMarkdown])
  const staleAssets = Array.from(previousAssets).filter((assetPath) => !nextAssets.has(assetPath))

  await Promise.all(
    staleAssets.map(async (assetPath) => {
      const filePath = toFileSystemPath(assetPath)
      try {
        await fs.unlink(filePath)
        logCommunityAsset('deleted stale permanent image', {
          entityKind: payload.entityKind,
          entityId: payload.entityId,
          assetPath,
          filePath,
        })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        warnCommunityAsset('stale permanent image already missing', {
          entityKind: payload.entityKind,
          entityId: payload.entityId,
          assetPath,
          filePath,
        })
      }
    }),
  )

  logCommunityAsset('finalize complete', {
    userId: payload.userId,
    entityKind: payload.entityKind,
    entityId: payload.entityId,
    movedAssetCount: moveMap.size,
    staleAssetCount: staleAssets.length,
  })

  return nextMarkdown
}

export const deleteCommunityMarkdownAssets = async (payload: {
  entityKind: 'solution' | 'comment'
  entityId: string
  markdownValues: Array<string | null | undefined>
}) => {
  const entityPrefix = getEntityPrefix(payload.entityKind, payload.entityId)
  const assetPaths = Array.from(collectPermanentAssets(entityPrefix, payload.markdownValues))
  logCommunityAsset('delete permanent assets request', {
    entityKind: payload.entityKind,
    entityId: payload.entityId,
    assetCount: assetPaths.length,
  })
  await Promise.all(
    assetPaths.map(async (assetPath) => {
      const filePath = toFileSystemPath(assetPath)
      try {
        await fs.unlink(filePath)
        logCommunityAsset('deleted permanent image', {
          entityKind: payload.entityKind,
          entityId: payload.entityId,
          assetPath,
          filePath,
        })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        warnCommunityAsset('permanent image already missing during delete', {
          entityKind: payload.entityKind,
          entityId: payload.entityId,
          assetPath,
          filePath,
        })
      }
    }),
  )
}
