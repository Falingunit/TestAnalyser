import { Router } from 'express'
import { prisma } from '../db.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { signToken } from '../auth/token.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

const router = Router()

const defaultPreferences = {
  theme: 'ember',
  mode: 'system',
  fontScale: 1,
  acknowledgedKeyUpdates: {},
}

const sanitizeEmail = (email: string) => email.trim().toLowerCase()

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const allowedThemes = new Set(['ember', 'ocean', 'forest', 'slate'])
const allowedModes = new Set(['light', 'dark', 'system'])
const clampFontScale = (value: number) => Math.min(1.3, Math.max(0.9, value))

const normalizePreferences = (value: unknown, existing: Record<string, unknown>) => {
  const next = { ...existing }
  if (value && typeof value === 'object') {
    const prefs = value as Record<string, unknown>
    if (typeof prefs.theme === 'string' && allowedThemes.has(prefs.theme)) {
      next.theme = prefs.theme
    }
    if (typeof prefs.mode === 'string' && allowedModes.has(prefs.mode)) {
      next.mode = prefs.mode
    }
    if (typeof prefs.fontScale === 'number' && Number.isFinite(prefs.fontScale)) {
      next.fontScale = clampFontScale(prefs.fontScale)
    }
    if (prefs.acknowledgedKeyUpdates && typeof prefs.acknowledgedKeyUpdates === 'object') {
      next.acknowledgedKeyUpdates = prefs.acknowledgedKeyUpdates
    }
  }
  if (!next.theme) {
    next.theme = defaultPreferences.theme
  }
  if (!next.mode) {
    next.mode = defaultPreferences.mode
  }
  if (typeof next.fontScale !== 'number') {
    next.fontScale = defaultPreferences.fontScale
  }
  if (!next.acknowledgedKeyUpdates || typeof next.acknowledgedKeyUpdates !== 'object') {
    next.acknowledgedKeyUpdates = {}
  }
  return next
}

const parsePreferences = (value: unknown) => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      return parsed
    } catch {
      return defaultPreferences
    }
  }
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>
  }
  return defaultPreferences
}

const serializeUser = (user: {
  id: string
  name: string
  email: string
  role: string
  preferences: unknown
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  preferences: parsePreferences(user.preferences),
})

router.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    })
    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    return res.json({ user: serializeUser(user) })
  } catch (error) {
    return next(error)
  }
})

router.patch('/preferences', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const rawPreferences = req.body?.preferences

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    })
    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const existing = parsePreferences(user.preferences)

    const preferences = normalizePreferences(rawPreferences, existing)

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { preferences: JSON.stringify(preferences) },
    })

    return res.json({ user: serializeUser(updated) })
  } catch (error) {
    return next(error)
  }
})

router.patch('/profile', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const { name, email } = req.body as { name?: string; email?: string }
    if (!isNonEmptyString(name) || !isNonEmptyString(email)) {
      return res.status(400).json({ error: 'Name and email are required.' })
    }

    const normalizedEmail = sanitizeEmail(email)
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })
    if (existing && existing.id !== req.user.userId) {
      return res.status(409).json({ error: 'Email already exists.' })
    }

    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        name: name.trim(),
        email: normalizedEmail,
      },
    })

    return res.json({ user: serializeUser(updated) })
  } catch (error) {
    return next(error)
  }
})

router.patch('/password', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }

    const { currentPassword, nextPassword } = req.body as {
      currentPassword?: string
      nextPassword?: string
    }
    if (!isNonEmptyString(currentPassword) || !isNonEmptyString(nextPassword)) {
      return res.status(400).json({ error: 'Current and new passwords are required.' })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    })
    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const ok = await verifyPassword(currentPassword, user.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'Current password is incorrect.' })
    }

    const passwordHash = await hashPassword(nextPassword)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    return res.json({ ok: true })
  } catch (error) {
    return next(error)
  }
})

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body as {
      name?: string
      email?: string
      password?: string
    }

    if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'Name, email, and password are required.' })
    }

    const normalizedEmail = sanitizeEmail(email)
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })
    if (existing) {
      return res.status(409).json({ error: 'Email already exists.' })
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: 'USER',
        preferences: JSON.stringify(defaultPreferences),
      },
    })

    const token = signToken({ userId: user.id, role: user.role })
    return res.status(201).json({ user: serializeUser(user), token })
  } catch (error) {
    return next(error)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as {
      email?: string
      password?: string
    }

    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const user = await prisma.user.findUnique({
      where: { email: sanitizeEmail(email) },
    })
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const token = signToken({ userId: user.id, role: user.role })
    return res.json({ user: serializeUser(user), token })
  } catch (error) {
    return next(error)
  }
})

export default router
