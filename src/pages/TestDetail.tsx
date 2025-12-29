import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Star } from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  buildAnalysis,
  formatAnswerValue,
  getAnswerForQuestion,
  getQuestionMark,
  getQuestionStatus,
  getTimeForQuestion,
  isBonusKey,
} from "@/lib/analysis";
import type { QuestionType, Subject } from "@/lib/types";
import { TestSummaryCard } from "@/components/TestSummaryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatQuestionType } from "@/lib/utils";
import { buildDisplayQuestions } from "@/lib/questionDisplay";

const formatSeconds = (value: number) => {
  if (!Number.isFinite(value)) {
    return "0s";
  }
  if (value < 60) {
    return `${Math.round(value)}s`;
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const subjects = ["ALL", "PHYSICS", "CHEMISTRY", "MATHEMATICS"] as const;
const typeOptions = [
  { value: "ALL", label: "All types" },
  { value: "MCQ", label: formatQuestionType("MCQ") },
  { value: "MAQ", label: formatQuestionType("MAQ") },
  { value: "NAT", label: formatQuestionType("NAT") },
  { value: "VMAQ", label: formatQuestionType("VMAQ") },
] as const;
const questionTypes = ["MCQ", "MAQ", "NAT", "VMAQ"] as const;
const statuses = [
  "ALL",
  "Correct",
  "Incorrect",
  "Partial",
  "Unattempted",
] as const;

type SubjectFilter = (typeof subjects)[number];
type TypeFilter = (typeof typeOptions)[number]["value"];
type StatusFilter = (typeof statuses)[number];
type MarkingDraft = Record<
  QuestionType,
  { correct: string; incorrect: string; unattempted: string }
>;

const hasKeyChange = (question: {
  correctAnswer: unknown;
  keyUpdate: unknown;
}) =>
  JSON.stringify(question.correctAnswer ?? null) !==
  JSON.stringify(question.keyUpdate ?? null);

const getStatusVariant = (status: string) => {
  if (status === "Correct") {
    return "secondary";
  }
  if (status === "Incorrect") {
    return "destructive";
  }
  if (status === "Partial") {
    return "outline";
  }
  return "outline";
};

const buildEmptyMarkingDraft = (): MarkingDraft => ({
  MCQ: { correct: "", incorrect: "", unattempted: "" },
  MAQ: { correct: "", incorrect: "", unattempted: "" },
  NAT: { correct: "", incorrect: "", unattempted: "" },
  VMAQ: { correct: "", incorrect: "", unattempted: "" },
});

export const TestDetail = () => {
  const { testId } = useParams();
  const {
    state,
    currentUser,
    acknowledgeKeyUpdates,
    updateMarkingScheme,
    isAdmin,
    resyncTest,
  } = useAppStore();
  const test = state.tests.find((item) => item.id === testId);
  const displayQuestions = useMemo(() => {
    if (!test) {
      return [];
    }
    return buildDisplayQuestions(test.questions);
  }, [test]);
  const firstQuestionId = displayQuestions[0]?.question.id ?? "";
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<SubjectFilter>("ALL");
  const [type, setType] = useState<TypeFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [onlyKeyUpdates, setOnlyKeyUpdates] = useState(false);
  const [markingDraft, setMarkingDraft] = useState<MarkingDraft>(() =>
    buildEmptyMarkingDraft()
  );
  const [markingMessage, setMarkingMessage] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [confirmResyncOpen, setConfirmResyncOpen] = useState(false);
  const [collapsedSubjects, setCollapsedSubjects] = useState<
    Record<Subject, boolean>
  >({
    PHYSICS: false,
    CHEMISTRY: false,
    MATHEMATICS: false,
  });

  useEffect(() => {
    if (!test) {
      setMarkingDraft(buildEmptyMarkingDraft());
      setMarkingMessage(null);
      return;
    }
    const nextDraft = buildEmptyMarkingDraft();
    test.questions.forEach((question) => {
      const qtype = question.qtype as QuestionType;
      if (!questionTypes.includes(qtype)) {
        return;
      }
      if (nextDraft[qtype].correct) {
        return;
      }
      nextDraft[qtype] = {
        correct: String(question.correctMarking),
        incorrect: String(question.incorrectMarking),
        unattempted: String(question.unattemptedMarking),
      };
    });
    setMarkingDraft(nextDraft);
    setMarkingMessage(null);
  }, [test]);

  if (!test) {
    return (
      <Card className="app-panel">
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">Test not found.</p>
          <Button asChild variant="outline">
            <Link to="/app/tests">Back to tests</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const analysis = buildAnalysis(test);
  const acknowledgedAt =
    currentUser?.preferences.acknowledgedKeyUpdates[test.id] ?? null;
  const hasNewKeyUpdates = Boolean(
    analysis.latestKeyUpdate &&
      (!acknowledgedAt || acknowledgedAt < analysis.latestKeyUpdate)
  );
  const account = state.externalAccounts.find(
    (item) => item.userId === currentUser?.id && item.provider === "test.z7i.in"
  );
  const canResync = Boolean(
    test.externalExamId &&
      account &&
      account.syncStatus !== "syncing" &&
      !isResyncing
  );

  const availableTypes = useMemo(() => {
    if (!test) {
      return [];
    }
    const types = new Set<QuestionType>();
    test.questions.forEach((question) => {
      const qtype = question.qtype as QuestionType;
      if (questionTypes.includes(qtype)) {
        types.add(qtype);
      }
    });
    return questionTypes.filter((type) => types.has(type));
  }, [test]);

  const handleMarkingSchemeSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) {
      setMarkingMessage("Only admins can update marking schemes.");
      return;
    }
    if (!test) {
      return;
    }
    const scheme: Record<
      string,
      { correct: number; incorrect: number; unattempted: number }
    > = {};
    for (const qtype of availableTypes) {
      const entry = markingDraft[qtype];
      const correct = Number(entry.correct);
      const incorrect = Number(entry.incorrect);
      const unattempted = Number(entry.unattempted);
      if (
        !Number.isFinite(correct) ||
        !Number.isFinite(incorrect) ||
        !Number.isFinite(unattempted)
      ) {
        setMarkingMessage(
          `Enter valid numbers for ${formatQuestionType(qtype)}.`
        );
        return;
      }
      scheme[qtype] = { correct, incorrect, unattempted };
    }
    await updateMarkingScheme({ testId: test.id, scheme });
    setMarkingMessage("Marking scheme updated.");
  };

  const questionSnapshots = useMemo(() => {
    if (!test) {
      return [];
    }
    return displayQuestions.map(({ question, displayNumber }) => {
      const statusLabel = getQuestionStatus(test, question);
      const time = getTimeForQuestion(test, question);
      const answer = getAnswerForQuestion(test, question);
      const score = getQuestionMark(test, question);
      return {
        question,
        displayNumber,
        status: statusLabel,
        time,
        answer,
        score,
        keyChanged: hasKeyChange(question),
        bonus: isBonusKey(question.keyUpdate),
        bookmarked: Boolean(test.bookmarks?.[question.id]),
      };
    });
  }, [displayQuestions, test]);

  const filteredQuestions = useMemo(() => {
    const queryValue = query.trim().toLowerCase();
    return questionSnapshots.filter(
      ({ question, status: statusLabel, keyChanged, displayNumber }) => {
        const matchesQuery =
          queryValue.length === 0 ||
          String(displayNumber).includes(queryValue) ||
          question.questionContent.toLowerCase().includes(queryValue);
        const matchesSubject =
          subject === "ALL" || question.subject === (subject as Subject);
        const matchesType =
          type === "ALL" || question.qtype === (type as QuestionType);
        const matchesStatus = status === "ALL" || statusLabel === status;
        const matchesKey = !onlyKeyUpdates || keyChanged;
        return (
          matchesQuery &&
          matchesSubject &&
          matchesType &&
          matchesStatus &&
          matchesKey
        );
      }
    );
  }, [onlyKeyUpdates, query, questionSnapshots, status, subject, type]);

  const groupedQuestions = useMemo(() => {
    const map = new Map<Subject, typeof filteredQuestions>();
    filteredQuestions.forEach((item) => {
      const current = map.get(item.question.subject) ?? [];
      current.push(item);
      map.set(item.question.subject, current);
    });
    return subjects
      .filter((item): item is Subject => item !== "ALL")
      .map((item) => ({
        subject: item,
        items: map.get(item) ?? [],
      }))
      .filter((group) => group.items.length > 0);
  }, [filteredQuestions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Test review
          </p>
          <h1 className="text-xl font-semibold text-foreground">
            {test.title}
          </h1>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/tests">Back to tests</Link>
        </Button>
      </div>
      <section className="grid grid-cols-6 gap-2">
        <TestSummaryCard
          className="col-span-4"
          test={test}
          analysis={analysis}
          defaultExpanded
          reviewAction={
            <Button asChild variant="outline" size="sm">
              <Link to={`/app/questions/${test.id}/${firstQuestionId}`}>
                Open questions
              </Link>
            </Button>
          }
          collapsedAction={
            <Button asChild variant="outline" size="sm">
              <Link to={`/app/questions/${test.id}/${firstQuestionId}`}>
                Open questions
              </Link>
            </Button>
          }
          actions={
            <>
              {hasNewKeyUpdates ? (
                <Button
                  size="sm"
                  onClick={() => acknowledgeKeyUpdates(test.id)}
                >
                  Mark updates reviewed
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canResync}
                onClick={() => {
                  if (!canResync) {
                    return;
                  }
                  setConfirmResyncOpen(true);
                }}
              >
                {isResyncing ? "Resyncing..." : "Resync exam"}
              </Button>
            </>
          }
        />
        {/* Marking Scheme */}
        <Card className="app-panel col-span-2 border-none">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Marking scheme
                </p>
                <p className="text-sm text-muted-foreground">
                  Update marks for each question type in this test.
                </p>
              </div>
              <Button
                type="submit"
                size="sm"
                form="marking-scheme-form"
                disabled={!isAdmin}
              >
                Save scheme
              </Button>
            </div>

            <form
              id="marking-scheme-form"
              className="space-y-4"
              onSubmit={handleMarkingSchemeSave}
            >
              <div className="overflow-hidden rounded-lg border border-border/60">
                <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,90px))] gap-3 bg-muted/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <span>Type</span>
                  <span className="text-right">Correct</span>
                  <span className="text-right">Incorrect</span>
                  <span className="text-right">Unattempted</span>
                </div>
                <div className="divide-y divide-border/60">
                  {availableTypes.map((qtype) => (
                    <div
                      key={qtype}
                      className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,90px))] items-center gap-3 px-3 py-2 text-xs text-muted-foreground"
                    >
                      <span className="text-foreground/90">
                        {formatQuestionType(qtype)}
                      </span>
                      <Input
                        type="number"
                        step="1"
                        value={markingDraft[qtype].correct}
                        onChange={(event) =>
                          setMarkingDraft((prev) => ({
                            ...prev,
                            [qtype]: {
                              ...prev[qtype],
                              correct: event.target.value,
                            },
                          }))
                        }
                        className="h-8 text-right"
                        disabled={!isAdmin}
                      />
                      <Input
                        type="number"
                        step="1"
                        value={markingDraft[qtype].incorrect}
                        onChange={(event) =>
                          setMarkingDraft((prev) => ({
                            ...prev,
                            [qtype]: {
                              ...prev[qtype],
                              incorrect: event.target.value,
                            },
                          }))
                        }
                        className="h-8 text-right"
                        disabled={!isAdmin}
                      />
                      <Input
                        type="number"
                        step="1"
                        value={markingDraft[qtype].unattempted}
                        onChange={(event) =>
                          setMarkingDraft((prev) => ({
                            ...prev,
                            [qtype]: {
                              ...prev[qtype],
                              unattempted: event.target.value,
                            },
                          }))
                        }
                        className="h-8 text-right"
                        disabled={!isAdmin}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Changes apply to all questions in this test.
              </p>
            </form>

            {markingMessage ? (
              <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                {markingMessage}
              </div>
            ) : null}
            {!isAdmin ? (
              <p className="text-xs text-muted-foreground">
                Only admins can update marking schemes.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Dialog open={confirmResyncOpen} onOpenChange={setConfirmResyncOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resync this exam?</DialogTitle>
            <DialogDescription>
              This will replace your current attempt with the latest data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmResyncOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setConfirmResyncOpen(false);
                setIsResyncing(true);
                await resyncTest(test.id);
                setIsResyncing(false);
              }}
            >
              Resync exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section></section>

      <section>
        <Card className="app-panel">
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Question view
                </p>
                <p className="text-sm text-muted-foreground">
                  {filteredQuestions.length} questions shown
                </p>
              </div>
              <Button asChild size="sm">
                <Link to={`/app/questions/${test.id}/${firstQuestionId}`}>
                  Open question view
                </Link>
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Search</label>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search number or text"
                />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    Subject
                  </label>
                  <Select
                    value={subject}
                    onValueChange={(value) =>
                      setSubject(value as SubjectFilter)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Type</label>
                  <Select
                    value={type}
                    onValueChange={(value) => setType(value as TypeFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    Status
                  </label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as StatusFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={onlyKeyUpdates}
                  onCheckedChange={setOnlyKeyUpdates}
                />
                <span>Show key updates only</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-5">
              {groupedQuestions.map((group) => (
                <div key={group.subject} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {group.subject}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{group.items.length} questions</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          setCollapsedSubjects((prev) => ({
                            ...prev,
                            [group.subject]: !prev[group.subject],
                          }))
                        }
                        aria-expanded={!collapsedSubjects[group.subject]}
                      >
                        {collapsedSubjects[group.subject] ? "Show" : "Hide"}
                      </Button>
                    </div>
                  </div>
                  {!collapsedSubjects[group.subject] ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {group.items.map(
                        ({
                          question,
                          displayNumber,
                          status: statusLabel,
                          time,
                          score,
                          keyChanged,
                          answer,
                          bonus,
                          bookmarked,
                        }) => (
                          <Link
                            key={question.id}
                            to={`/app/questions/${test.id}/${question.id}`}
                            className="app-panel flex flex-col gap-3 p-4 transition hover:border-primary/60"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  {bookmarked ? (
                                    <Star
                                      className="h-4 w-4 text-amber-400"
                                      fill="currentColor"
                                    />
                                  ) : null}
                                  <p className="text-sm font-semibold text-foreground">
                                    Q{displayNumber} - {question.subject}
                                  </p>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {formatQuestionType(question.qtype)} -{" "}
                                  {formatSeconds(time)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {bonus ? (
                                  <Badge className="border-sky-500/60 bg-sky-500/20 text-sky-100">
                                    Bonus
                                  </Badge>
                                ) : null}
                                {keyChanged ? (
                                  <Badge variant="destructive">
                                    Key update
                                  </Badge>
                                ) : null}
                                <Badge variant={getStatusVariant(statusLabel)}>
                                  {statusLabel}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span>Score {score}</span>
                              <span>Answer {formatAnswerValue(answer)}</span>
                              <span>
                                Correct {formatAnswerValue(question.keyUpdate)}
                              </span>
                            </div>
                          </Link>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {filteredQuestions.length === 0 ? (
              <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
                No questions match the selected filters.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
