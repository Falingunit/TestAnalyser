import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { env } from './config.js'

const adapter = new PrismaBetterSqlite3({
  url: env.databaseUrl,
})

export const prisma = new PrismaClient({ adapter })
