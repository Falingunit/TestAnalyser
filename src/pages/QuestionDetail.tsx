import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import {
  formatAnswerValue,
  getAnswerForQuestion,
  getQuestionMark,
  getQuestionStatus,
  getTimeForQuestion,
  isBonusKey,
} from '@/lib/analysis'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const formatSeconds = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0s'
  }
  if (value < 60) {
    return `${Math.round(value)}s`
  }
  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
}

const splitByOr = (value: string) =>
  value
    .split(/\s+(?:OR)\s+|\s*\|\s*/i)
    .map((item) => item.trim())
    .filter(Boolean)

const toOptionArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toUpperCase()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const segments = splitByOr(value)
    if (segments.length === 0) {
      return []
    }
    return segments.flatMap((segment) => {
      const normalized = segment.trim().toUpperCase()
      if (!normalized) {
        return []
      }
      if (normalized.includes(',')) {
        return normalized
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean)
      }
      if (/^[A-Z]+$/.test(normalized)) {
        return normalized.split('')
      }
      return [normalized]
    })
  }
  return []
}

type ChatMessage = {
  id: string
  author: string
  body: string
  createdAt: string
  pinned?: boolean
}

export const QuestionDetail = () => {
  const { testId, questionId } = useParams()
  const { state, updateAnswerKey, currentUser, isAdmin, fontScale, setFontScale, setMode } =
    useAppStore()
  const test = state.tests.find((item) => item.id === testId)
  const questions = useMemo(() => {
    if (!test) {
      return []
    }
    return [...test.questions].sort(
      (a, b) => a.questionNumber - b.questionNumber,
    )
  }, [test])

  const currentIndex = questions.findIndex((item) => item.id === questionId)
  const question = currentIndex >= 0 ? questions[currentIndex] : null
  const status = question && test ? getQuestionStatus(test, question) : 'Unattempted'
  const timeSpent = question && test ? getTimeForQuestion(test, question) : 0
  const answer = question && test ? getAnswerForQuestion(test, question) : null
  const score = question && test ? getQuestionMark(test, question) : 0
  const mode = currentUser?.preferences.mode ?? state.ui.mode
  const isDark = mode === 'dark'

  const statuses = useMemo(() => {
    if (!test) {
      return []
    }
    return questions.map((item) => ({
      id: item.id,
      number: item.questionNumber,
      status: getQuestionStatus(test, item),
      bonus: isBonusKey(item.keyUpdate),
    }))
  }, [questions, test])

  const [message, setMessage] = useState<string | null>(null)
  const [keyUpdateValue, setKeyUpdateValue] = useState('')
  const [keyUpdateBonus, setKeyUpdateBonus] = useState(false)
  const [notes, setNotes] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isImageOpen, setIsImageOpen] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageZoom, setImageZoom] = useState(1)
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 })
  const dragState = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const activePointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchState = useRef<{
    startDistance: number
    startZoom: number
  } | null>(null)

  const handleKeyUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isAdmin) {
      setMessage('Only admins can update answer keys.')
      return
    }
    if (!test || !question) {
      return
    }
    const trimmedKey = keyUpdateValue.trim()
    if (!keyUpdateBonus && !trimmedKey) {
      setMessage('Enter a new key or mark this question as bonus.')
      return
    }
    await updateAnswerKey({
      testId: test.id,
      questionId: question.id,
      newKey: keyUpdateBonus ? { bonus: true } : trimmedKey,
    })
    setMessage('Answer key updated.')
    setKeyUpdateValue('')
    setKeyUpdateBonus(false)
  }

  if (!test || !question) {
    return (
      <Card className="app-panel">
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">Question not found.</p>
          <Button asChild variant="outline">
            <Link to="/app/tests">Back to tests</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const prev = currentIndex > 0 ? questions[currentIndex - 1] : null
  const next = currentIndex < questions.length - 1 ? questions[currentIndex + 1] : null
  const selectedOptions = toOptionArray(answer)
  const correctOptions = question ? toOptionArray(question.keyUpdate) : []
  const isMultiSelect = question?.qtype === 'MAQ'
  const notesKey =
    test && question ? `testanalyser-question-notes-${test.id}-${question.id}` : null
  const chatKey =
    test && question ? `testanalyser-question-chat-${test.id}-${question.id}` : null
  const orderedMessages = useMemo(() => {
    return [...chatMessages].sort((a, b) => {
      const pinDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      if (pinDelta !== 0) {
        return pinDelta
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  }, [chatMessages])

  useEffect(() => {
    if (!notesKey) {
      setNotes('')
      return
    }
    const saved = localStorage.getItem(notesKey)
    setNotes(saved ?? '')
  }, [notesKey])

  useEffect(() => {
    if (keyUpdateBonus) {
      setKeyUpdateValue('')
    }
  }, [keyUpdateBonus])

  useEffect(() => {
    if (!notesKey) {
      return
    }
    localStorage.setItem(notesKey, notes)
  }, [notes, notesKey])

  useEffect(() => {
    if (!chatKey) {
      setChatMessages([])
      return
    }
    const raw = localStorage.getItem(chatKey)
    if (!raw) {
      setChatMessages([])
      return
    }
    try {
      const parsed = JSON.parse(raw) as ChatMessage[]
      setChatMessages(Array.isArray(parsed) ? parsed : [])
    } catch {
      setChatMessages([])
    }
  }, [chatKey])

  useEffect(() => {
    if (!chatKey) {
      return
    }
    localStorage.setItem(chatKey, JSON.stringify(chatMessages))
  }, [chatKey, chatMessages])

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = chatInput.trim()
    if (!trimmed) {
      return
    }
    const author = currentUser?.name ?? 'User'
    const nextMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      author,
      body: trimmed,
      createdAt: new Date().toISOString(),
      pinned: false,
    }
    setChatMessages((prevMessages) => [...prevMessages, nextMessage])
    setChatInput('')
  }

  const clampZoom = (value: number) => Math.min(4, Math.max(1, value))

  const resetImageView = () => {
    setImageZoom(1)
    setImageOffset({ x: 0, y: 0 })
    activePointers.current.clear()
    pinchState.current = null
    dragState.current = null
  }

  const handleImageOpen = (src: string) => {
    setImageSrc(src)
    resetImageView()
    setIsImageOpen(true)
  }

  const handleRichContentClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target
    if (target instanceof HTMLImageElement) {
      const src = target.currentSrc || target.src
      if (src) {
        event.preventDefault()
        handleImageOpen(src)
      }
    }
  }

  const handleZoomStep = (delta: number) => {
    setImageZoom((prev) => clampZoom(prev + delta))
  }

  const handleImageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const delta = event.deltaY < 0 ? 0.15 : -0.15
    setImageZoom((prev) => clampZoom(prev + delta))
  }

  const handleImagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (activePointers.current.size === 2) {
      const points = Array.from(activePointers.current.values())
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      pinchState.current = {
        startDistance: distance || 1,
        startZoom: imageZoom,
      }
      dragState.current = null
      return
    }

    if (imageZoom > 1) {
      dragState.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: imageOffset.x,
        originY: imageOffset.y,
      }
    }
  }

  const handleImagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!activePointers.current.has(event.pointerId)) {
      return
    }
    activePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (activePointers.current.size === 2) {
      const points = Array.from(activePointers.current.values())
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      const start = pinchState.current?.startDistance ?? distance || 1
      const startZoom = pinchState.current?.startZoom ?? imageZoom
      setImageZoom(clampZoom(startZoom * (distance / start)))
      return
    }

    if (!dragState.current) {
      return
    }
    const nextX = dragState.current.originX + (event.clientX - dragState.current.startX)
    const nextY = dragState.current.originY + (event.clientY - dragState.current.startY)
    setImageOffset({ x: nextX, y: nextY })
  }

  const handleImagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(event.pointerId)
    if (activePointers.current.size < 2) {
      pinchState.current = null
    }
    dragState.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const adjustFontScale = (delta: number) => {
    setFontScale(fontScale + delta)
  }

  const togglePin = (id: string) => {
    if (!isAdmin) {
      return
    }
    setChatMessages((prevMessages) =>
      prevMessages.map((message) =>
        message.id === id ? { ...message, pinned: !message.pinned } : message,
      ),
    )
  }

  const deleteMessage = (id: string, author: string) => {
    if (!isAdmin && currentUser?.name !== author) {
      return
    }
    setChatMessages((prevMessages) =>
      prevMessages.filter((message) => message.id !== id),
    )
  }

  return (
    <div className="flex h-[calc(100vh-144px)] flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/app/tests/${test.id}`}>Back to test</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>
            Q{question.questionNumber} - {question.subject}
          </span>
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
            <span>Text size</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => adjustFontScale(-0.1)}
              title="Decrease font size"
            >
              A-
            </Button>
            <span className="min-w-[38px] text-center text-[11px]">
              {Math.round(fontScale * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => adjustFontScale(0.1)}
              title="Increase font size"
            >
              A+
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Dark mode</span>
            <Switch
              checked={isDark}
              onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
            />
          </div>
        </div>
      </div>
      <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,320px)]">
        <Card className="app-panel h-full min-h-0">
          <CardContent className="flex h-full min-h-0 flex-col gap-4 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Questions
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-5 gap-2">
                {statuses.map((item) => (
                  <Link
                    key={item.id}
                    to={`/app/questions/${test.id}/${item.id}`}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-lg border text-xs font-medium',
                      item.id === question.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : item.bonus
                          ? 'border-sky-500/60 bg-sky-500/15 text-foreground hover:border-sky-400'
                          : item.status === 'Correct'
                            ? 'border-emerald-500/60 bg-emerald-500/15 text-foreground hover:border-emerald-400'
                            : item.status === 'Partial'
                              ? 'border-amber-400/60 bg-amber-400/15 text-foreground hover:border-amber-300'
                              : item.status === 'Incorrect'
                                ? 'border-rose-500/60 bg-rose-500/15 text-foreground hover:border-rose-400'
                                : 'border-border/60 text-muted-foreground hover:border-primary/60',
                    )}
                  >
                    {item.number}
                  </Link>
                ))}
              </div>
            </div>
            <Separator />
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>Attempted {status !== 'Unattempted' ? 'Yes' : 'No'}</p>
              <p>Time {formatSeconds(timeSpent)}</p>
              <p>Score {score}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="app-panel h-full min-h-0">
          <CardContent className="flex h-full min-h-0 flex-col gap-5 p-6">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Prompt
                </p>
                <div
                  className="question-html rounded-lg border border-border bg-background p-4 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: question.questionContent }}
                  onClick={handleRichContentClick}
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Options
                </p>
                <div className="grid gap-3">
                  {[
                    { label: 'A', value: question.optionContentA },
                    { label: 'B', value: question.optionContentB },
                    { label: 'C', value: question.optionContentC },
                    { label: 'D', value: question.optionContentD },
                  ]
                    .filter((item) => item.value)
                    .map((item) => {
                      const isSelected = selectedOptions.includes(item.label)
                      const isCorrect = correctOptions.includes(item.label)
                      const isSelectedCorrect = isSelected && isCorrect
                      const isSelectedIncorrect = isSelected && !isCorrect
                      const isUnselectedCorrect = !isSelected && isCorrect
                      return (
                        <div
                          key={item.label}
                          className={cn(
                            'flex gap-3 rounded-lg border p-4 text-sm',
                            isSelectedCorrect &&
                              'border-emerald-500/70 bg-emerald-500/20 text-foreground',
                            isSelectedIncorrect &&
                              'border-rose-500/70 bg-rose-500/20 text-foreground',
                            isUnselectedCorrect &&
                              'border-emerald-500/70 border-dashed bg-emerald-500/10 text-foreground',
                            !isSelectedCorrect &&
                              !isSelectedIncorrect &&
                              !isUnselectedCorrect &&
                              'border-border bg-background text-foreground',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-7 w-7 flex-shrink-0 items-center justify-center border text-xs font-semibold',
                              isMultiSelect ? 'rounded-md' : 'rounded-full',
                              isSelectedCorrect && 'border-emerald-500 bg-emerald-500 text-emerald-950',
                              isSelectedIncorrect && 'border-rose-500 bg-rose-500 text-white',
                              isUnselectedCorrect && 'border-emerald-500 text-emerald-500',
                              !isSelectedCorrect &&
                                !isSelectedIncorrect &&
                                !isUnselectedCorrect &&
                                'border-border text-muted-foreground',
                            )}
                          >
                            {item.label}
                        </span>
                        <div
                          className="question-html leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: item.value ?? '' }}
                          onClick={handleRichContentClick}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button asChild variant="outline" disabled={!prev}>
                {prev ? (
                  <Link to={`/app/questions/${test.id}/${prev.id}`}>Previous</Link>
                ) : (
                  <span>Previous</span>
                )}
              </Button>
              <Button asChild variant="outline" disabled={!next}>
                {next ? (
                  <Link to={`/app/questions/${test.id}/${next.id}`}>Next</Link>
                ) : (
                  <span>Next</span>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="app-panel h-full min-h-0">
          <CardContent className="flex h-full min-h-0 flex-col gap-4 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Answer review
            </p>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Your answer</span>
                  <span className="font-semibold text-foreground">
                    {formatAnswerValue(answer)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Correct key</span>
                  <span className="font-semibold text-foreground">
                    {formatAnswerValue(question.keyUpdate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Original key</span>
                  <span className="font-semibold text-foreground">
                    {formatAnswerValue(question.correctAnswer)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Marks</span>
                  <span className="font-semibold text-foreground">{score}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Notes
                </p>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add your notes for this question"
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Key discussion
                </p>
                <div className="space-y-2">
                  {orderedMessages.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No messages yet. Start the discussion.
                    </p>
                  ) : (
                    orderedMessages.map((chat) => (
                      <div
                        key={chat.id}
                        className={cn(
                          'rounded-lg border border-border p-3 text-xs',
                          chat.pinned ? 'bg-amber-500/10' : 'bg-background',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-1">
                            <p className="font-semibold text-foreground">{chat.author}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(chat.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => togglePin(chat.id)}
                              disabled={!isAdmin}
                              title={isAdmin ? 'Toggle pin' : 'Admins only'}
                            >
                              {chat.pinned ? 'Unpin' : 'Pin'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteMessage(chat.id, chat.author)}
                              disabled={!isAdmin && currentUser?.name !== chat.author}
                              title={
                                isAdmin || currentUser?.name === chat.author
                                  ? 'Delete message'
                                  : 'Admins or message author only'
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-foreground/90">{chat.body}</p>
                      </div>
                    ))
                  )}
                </div>
                <form className="flex gap-2" onSubmit={handleChatSubmit}>
                  <Input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Add a message"
                  />
                  <Button type="submit">Send</Button>
                </form>
              </div>

              {isAdmin ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="secondary">Update answer key</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Update answer key</DialogTitle>
                      <DialogDescription>
                        Enter the corrected key and apply it to this question.
                      </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleKeyUpdate}>
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground" htmlFor="newKey">
                          New key
                        </label>
                        <Input
                          id="newKey"
                          placeholder="Example: B or 2.5-3.5"
                          value={keyUpdateValue}
                          onChange={(event) => setKeyUpdateValue(event.target.value)}
                          disabled={keyUpdateBonus}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">Bonus question</p>
                          <p>Give full marks to everyone for this question.</p>
                        </div>
                        <Switch
                          checked={keyUpdateBonus}
                          onCheckedChange={setKeyUpdateBonus}
                        />
                      </div>
                      <DialogFooter>
                        <Button type="submit">Save update</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only admins can update answer keys.
                </p>
              )}

              {message ? (
                <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                  {message}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <Dialog
        open={isImageOpen}
        onOpenChange={(open) => {
          setIsImageOpen(open)
          if (!open) {
            setImageSrc(null)
            resetImageView()
          }
        }}
      >
        <DialogContent
          className="max-w-5xl border-0 bg-transparent p-4 shadow-none"
          overlayClassName="bg-transparent backdrop-blur-md"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Image viewer
              </p>
              <p className="text-xs text-muted-foreground">
                Pinch or scroll to zoom, drag to pan.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleZoomStep(-0.2)}
              >
                Zoom out
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleZoomStep(0.2)}
              >
                Zoom in
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetImageView}>
                Reset
              </Button>
            </div>
          </div>
          <div
            className={cn(
              'relative mt-4 flex h-[70vh] touch-none items-center justify-center overflow-hidden',
              imageZoom > 1 ? 'cursor-grab' : 'cursor-zoom-in',
            )}
            onWheel={handleImageWheel}
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={handleImagePointerUp}
            onPointerLeave={handleImagePointerUp}
            onPointerCancel={handleImagePointerUp}
          >
            {imageSrc ? (
              <img
                src={imageSrc}
                alt="Question attachment"
                className="max-h-full max-w-full select-none"
                draggable={false}
                style={{
                  transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageZoom})`,
                  transformOrigin: 'center',
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
