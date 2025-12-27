import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export const hashPassword = async (password: string) => {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export const verifyPassword = async (password: string, hash: string) => {
  return bcrypt.compare(password, hash)
}
