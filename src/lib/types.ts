export type UserRole = 'user' | 'admin'

export type ThemeName = 'ember' | 'ocean' | 'forest' | 'slate'

export type ColorMode = 'light' | 'dark' | 'system'

export type UserPreferences = {
  theme: ThemeName
  mode: ColorMode
  fontScale: number
  acknowledgedKeyUpdates: Record<string, string>
  communitySolutionsEnabled: boolean
}

export type User = {
  id: string
  name: string
  email: string
  role: UserRole
  preferences: UserPreferences
}

export type ExternalAccountStatus = 'connected' | 'error' | 'disconnected'
export type ExternalAccountSyncStatus = 'idle' | 'syncing' | 'error'

export type ExternalAccount = {
  id: string
  userId: string
  provider: 'test.z7i.in'
  username: string
  remoteDisplayName?: string | null
  status: ExternalAccountStatus
  syncStatus: ExternalAccountSyncStatus
  syncTotal: number
  syncCompleted: number
  syncStartedAt: string | null
  syncFinishedAt: string | null
  lastSyncAt: string | null
  statusMessage?: string
}

export type Subject = 'PHYSICS' | 'CHEMISTRY' | 'MATHEMATICS'

export type QuestionType = 'MCQ' | 'MAQ' | 'VMAQ' | 'NAT'

export type NumericRange = {
  min: number
  max: number
}

export type BonusKey = {
  bonus: true
}

export type AnswerValue =
  | string
  | number
  | NumericRange
  | string[]
  | BonusKey
  | null

export type PeerAnswerStats = {
  total: number
  unattempted: number
  correct: number
  incorrect: number
  options: Record<string, number>
}

export type MarkingSchemeEntry = {
  correct: number
  incorrect: number
  unattempted: number
}

export type QuestionTypeMapping = Record<string, QuestionType>

export type QuestionRecord = {
  id: string
  sourceQtypeRaw?: string | null
  subject: Subject
  tags: string[]
  lockedTags: string[]
  qtype: QuestionType
  correctAnswer: AnswerValue
  keyUpdate: AnswerValue
  sharedPassageContent: string | null
  questionContent: string
  solutionContent: string | null
  optionContentA: string | null
  optionContentB: string | null
  optionContentC: string | null
  optionContentD: string | null
  hasPartial: boolean
  correctMarking: number
  incorrectMarking: number
  unattemptedMarking: number
  markingOverridden: boolean
  questionNumber: number
  lastKeyUpdateTime: string | null
}

export type TestRecord = {
  id: string
  userId: string
  examId: string
  externalExamId?: string
  title: string
  examDate: string
  rank: number | null
  calculatedRank?: number | null
  markingScheme?: Record<string, MarkingSchemeEntry> | null
  questionTypeMapping?: QuestionTypeMapping | null
  answers: Record<string, AnswerValue>
  timings: Record<string, number>
  peerTimings?: Record<string, number>
  peerAnswerStats?: Record<string, PeerAnswerStats>
  bookmarks: Record<string, boolean>
  questions: QuestionRecord[]
}

export type CustomLeaderboard = {
  id: string
  title: string
  description: string | null
  examIds: string
  createdAt: string
  updatedAt: string
}

export type CustomLeaderboardEntry = {
  participantKey: string
  externalUsername: string
  displayName: string
  akaNames: string[]
  remoteDisplayName: string | null
  rank: number
  score: number
  totalScore: number
  subjectScores: Record<string, { score: number, total: number }>
  attemptCount: number
  isCurrentUserParticipant: boolean
}

export type LeaderboardEntry = {
  participantKey: string
  externalUsername: string
  displayName: string
  akaNames: string[]
  remoteDisplayName: string | null
  rank: number
  score: number
  totalScore: number
  attemptCount: number
  isCurrentUserParticipant: boolean
  test: TestRecord
}

export type CommunitySolutionVoteValue = -1 | 0 | 1

export type CommunityAuthor = {
  id: string
  name: string
  role: UserRole
}

export type CommunitySolutionComment = {
  id: string
  solutionId: string
  contentMarkdown: string
  createdAt: string
  updatedAt: string
  author: CommunityAuthor
  canEdit: boolean
  canDelete: boolean
}

export type CommunitySolution = {
  id: string
  questionId: string
  contentMarkdown: string
  score: number
  upvoteCount: number
  downvoteCount: number
  pinnedAt: string | null
  createdAt: string
  updatedAt: string
  currentUserVote: CommunitySolutionVoteValue
  author: CommunityAuthor
  canEdit: boolean
  canDelete: boolean
  canPin: boolean
  comments: CommunitySolutionComment[]
}

export type QuestionCommunityThread = {
  questionId: string
  solutionCount: number
  solutions: CommunitySolution[]
}

export type AppState = {
  externalAccounts: ExternalAccount[]
  tests: TestRecord[]
  ui: {
    theme: ThemeName
    mode: ColorMode
    fontScale: number
  }
}
