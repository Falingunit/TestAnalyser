import type { NextFunction, Response } from 'express'
import { verifyToken, type TokenPayload } from '../auth/token.js'
import type { Request } from 'express'

export type AuthRequest = Request & { user?: TokenPayload }

export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token.' })
  }

  const token = header.slice('Bearer '.length)
  try {
    req.user = verifyToken(token)
    return next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid auth token.' })
  }
}
