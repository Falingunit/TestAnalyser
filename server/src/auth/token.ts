import jwt from 'jsonwebtoken'
import { env } from '../config'

export type TokenPayload = {
  userId: string
  role: string
}

export const signToken = (payload: TokenPayload) => {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' })
}

export const verifyToken = (token: string) => {
  return jwt.verify(token, env.jwtSecret) as TokenPayload
}
