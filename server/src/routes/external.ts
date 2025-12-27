import { Router } from 'express'
import { prisma } from '../db'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import { decryptSecret, encryptSecret } from '../utils/crypto'
import { syncExternalAccount } from '../services/syncService'

const router = Router()

const isNonEmptyString = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0

const serializeAccount = (account: {
  id: string
  userId: string
  provider: string
  username: string
  status: string
  syncStatus: string
  syncTotal: number
  syncCompleted: number
  syncStartedAt: Date | null
  syncFinishedAt: Date | null
  lastSyncAt: Date | null
  statusMessage: string | null
}) => ({
  id: account.id,
  userId: account.userId,
  provider: account.provider,
  username: account.username,
  status: account.status,
  syncStatus: account.syncStatus,
  syncTotal: account.syncTotal,
  syncCompleted: account.syncCompleted,
  syncStartedAt: account.syncStartedAt,
  syncFinishedAt: account.syncFinishedAt,
  lastSyncAt: account.lastSyncAt,
  statusMessage: account.statusMessage,
})

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const accounts = await prisma.externalAccount.findMany({
      where: { userId: req.user.userId },
    })

    return res.json({ accounts: accounts.map(serializeAccount) })
  } catch (error) {
    return next(error)
  }
})

router.post('/connect', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { username, password, provider } = req.body as {
      username?: string
      password?: string
      provider?: string
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'Username and password are required.' })
    }

    const providerValue = provider?.trim() || 'test.z7i.in'

    const account = await prisma.externalAccount.upsert({
      where: {
        userId_provider: {
          userId: req.user.userId,
          provider: providerValue,
        },
      },
      update: {
        username: username.trim(),
        status: 'CONNECTED',
        statusMessage: null,
        syncStatus: 'IDLE',
        syncTotal: 0,
        syncCompleted: 0,
        syncStartedAt: null,
        syncFinishedAt: null,
      },
      create: {
        userId: req.user.userId,
        provider: providerValue,
        username: username.trim(),
        status: 'CONNECTED',
      },
    })

    const encrypted = encryptSecret(password)
    await prisma.externalAccountCredential.upsert({
      where: { accountId: account.id },
      update: {
        encryptedPassword: encrypted.encrypted,
        iv: encrypted.iv,
        tag: encrypted.tag,
      },
      create: {
        accountId: account.id,
        encryptedPassword: encrypted.encrypted,
        iv: encrypted.iv,
        tag: encrypted.tag,
      },
    })

    return res.json({ account: serializeAccount(account) })
  } catch (error) {
    return next(error)
  }
})

router.post('/sync', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const provider = (req.body?.provider as string | undefined)?.trim() || 'test.z7i.in'
    const verificationCode =
      typeof req.body?.verificationCode === 'string'
        ? req.body.verificationCode.trim()
        : undefined

    const account = await prisma.externalAccount.findUnique({
      where: {
        userId_provider: {
          userId: req.user.userId,
          provider,
        },
      },
      include: { credential: true },
    })

    if (!account || !account.credential) {
      return res.status(404).json({ error: 'External account not connected.' })
    }

    if (account.syncStatus === 'SYNCING') {
      return res.status(409).json({ error: 'Sync already in progress.' })
    }

    const syncStartedAt = new Date()
    await prisma.externalAccount.update({
      where: { id: account.id },
      data: {
        status: 'CONNECTED',
        statusMessage: null,
        syncStatus: 'SYNCING',
        syncTotal: 0,
        syncCompleted: 0,
        syncStartedAt,
        syncFinishedAt: null,
      },
    })

    const password = decryptSecret({
      encrypted: account.credential.encryptedPassword,
      iv: account.credential.iv,
      tag: account.credential.tag,
    })

    const result = await syncExternalAccount({
      userId: req.user.userId,
      provider: account.provider,
      username: account.username,
      password,
      verificationCode,
      onProgress: async (progress) => {
        try {
          await prisma.externalAccount.update({
            where: { id: account.id },
            data: {
              syncTotal: progress.total,
              syncCompleted: progress.completed,
            },
          })
        } catch (progressError) {
          console.error(progressError)
        }
      },
    })

    const now = new Date()
    const updated = await prisma.externalAccount.update({
      where: { id: account.id },
      data: {
        status: 'CONNECTED',
        statusMessage: null,
        lastSyncAt: now,
        syncStatus: 'IDLE',
        syncFinishedAt: now,
      },
    })

    return res.json({
      account: serializeAccount(updated),
      result,
    })
  } catch (error) {
    if (req.user && typeof req.body?.provider === 'string') {
      const provider = req.body.provider.trim() || 'test.z7i.in'
      await prisma.externalAccount.updateMany({
        where: { userId: req.user.userId, provider },
        data: {
          status: 'ERROR',
          statusMessage:
            error instanceof Error ? error.message : 'Sync failed. Check logs.',
          syncStatus: 'ERROR',
          syncFinishedAt: new Date(),
        },
      })
    }
    return next(error)
  }
})

export default router
