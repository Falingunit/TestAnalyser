import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

const normalizeDatabaseUrl = (value: string) => {
  if (value === 'file:./dev.db') {
    return 'file:./prisma/dev.db'
  }
  return value
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: normalizeDatabaseUrl(env('DATABASE_URL')),
  },
})
