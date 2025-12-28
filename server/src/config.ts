import { config } from 'dotenv'

config()

const requireEnv = (key: string) => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required env var: ${key}`)
  }
  return value
}

const parseNumber = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const parseCorsOrigins = (value: string | undefined) => {
  const fallback = ['http://localhost:5173']
  if (!value) {
    return fallback
  }
  const origins = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return origins.length > 0 ? origins : fallback
}

export const env = {
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  encryptionKey: requireEnv('ENCRYPTION_KEY'),
  port: parseNumber(process.env.PORT ?? '', 4000),
  serverHost: process.env.SERVER_HOST ?? '0.0.0.0',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  scraperBaseUrl: process.env.SCRAPER_BASE_URL ?? 'https://test.z7i.in',
  scraperHeadless: (process.env.SCRAPER_HEADLESS ?? 'true') === 'true',
  scraperTimeoutMs: parseNumber(process.env.SCRAPER_TIMEOUT_MS ?? '', 30000),
  scraperDebugDir: process.env.SCRAPER_DEBUG_DIR ?? '',
  scraperTrace: (process.env.SCRAPER_TRACE ?? 'false') === 'true',
  scraperPackageId: process.env.SCRAPER_PACKAGE_ID ?? '',
}
