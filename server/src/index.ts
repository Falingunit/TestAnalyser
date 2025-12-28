import express from 'express'
import cors from 'cors'
import { env } from './config.js'
import authRouter from './routes/auth.js'
import externalRouter from './routes/external.js'
import testsRouter from './routes/tests.js'
import { errorHandler } from './middleware/error.js'

const app = express()

const allowedOrigins = new Set(env.corsOrigins)
const allowAllOrigins = env.corsOrigins.includes('*')
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowAllOrigins || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRouter)
app.use('/api/external', externalRouter)
app.use('/api/tests', testsRouter)

app.use(errorHandler)

app.listen(env.port, env.serverHost, () => {
  console.log(`Server listening on http://${env.serverHost}:${env.port}`)
})
