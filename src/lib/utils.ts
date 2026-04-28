import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { TestRecord } from './types'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

const QUESTION_TYPE_LABELS: Record<string, string> = {
  MCQ: 'Single Correct',
  MAQ: 'Multiple Correct',
  NAT: 'Numerical',
  VMAQ: 'Comprehension',
  MTQ: 'Match the Following',
}

export const formatQuestionType = (value: string) =>
  QUESTION_TYPE_LABELS[value] ?? value

export const LEADERBOARD_PREVIEW_TESTS_KEY =
  'testanalyser-leaderboard-preview-tests'

export const loadLeaderboardPreviewTest = (testId?: string) => {
  if (!testId) {
    return null
  }
  try {
    const raw = sessionStorage.getItem(LEADERBOARD_PREVIEW_TESTS_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Record<string, TestRecord>
    const candidate = parsed[testId]
    return candidate ?? null
  } catch {
    return null
  }
}
