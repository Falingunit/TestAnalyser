import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

const QUESTION_TYPE_LABELS: Record<string, string> = {
  MCQ: 'Single Correct',
  MAQ: 'Multiple Correct',
  NAT: 'Numerical',
  VMAQ: 'Comprehension',
}

export const formatQuestionType = (value: string) =>
  QUESTION_TYPE_LABELS[value] ?? value
