import crypto from 'crypto'
import { env } from '../config'

type EncryptedPayload = {
  encrypted: string
  iv: string
  tag: string
}

const parseKey = (raw: string) => {
  const trimmed = raw.trim()
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex')
  }
  const base64 = Buffer.from(trimmed, 'base64')
  if (base64.length === 32) {
    return base64
  }
  if (trimmed.length === 32) {
    return Buffer.from(trimmed)
  }
  throw new Error('ENCRYPTION_KEY must be 32 bytes (base64, hex, or raw).')
}

const key = parseKey(env.encryptionKey)

export const encryptSecret = (value: string): EncryptedPayload => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export const decryptSecret = (payload: EncryptedPayload): string => {
  const iv = Buffer.from(payload.iv, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const encrypted = Buffer.from(payload.encrypted, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
