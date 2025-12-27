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

export const env = {
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  encryptionKey: requireEnv('ENCRYPTION_KEY'),
  port: parseNumber(process.env.PORT ?? '', 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  scraperBaseUrl: process.env.SCRAPER_BASE_URL ?? 'https://test.z7i.in',
  scraperHeadless: (process.env.SCRAPER_HEADLESS ?? 'true') === 'true',
  scraperTimeoutMs: parseNumber(process.env.SCRAPER_TIMEOUT_MS ?? '', 30000),
  scraperDebugDir: process.env.SCRAPER_DEBUG_DIR ?? '',
  scraperTrace: (process.env.SCRAPER_TRACE ?? 'false') === 'true',
}
