import { execSync } from 'child_process'
import { existsSync, rmSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'

config()

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set.')
}

if (!databaseUrl.startsWith('file:')) {
  throw new Error('resetDb only supports sqlite file URLs.')
}

const dbPath = resolve(process.cwd(), databaseUrl.replace(/^file:/, ''))
if (existsSync(dbPath)) {
  rmSync(dbPath, { force: true })
}

execSync('npx prisma db push', { stdio: 'inherit' })
execSync('npx prisma generate', { stdio: 'inherit' })
