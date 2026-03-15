import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import type {
  LeaderboardEntry,
  QuestionType,
  Subject,
} from "@/lib/types";
import { TestSummaryCard } from "@/components/TestSummaryCard";
import { SegmentedProgressBar } from "@/components/SegmentedProgressBar";
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
const questionTypes = ["MCQ", "MAQ", "NAT", "VMAQ"] as const;
const statuses = [
  "ALL",
  "Correct",
  "Incorrect",
  "Partial",
  "Unattempted",
] as const;

type SubjectFilter = (typeof subjects)[number];
type TypeFilter = "ALL" | QuestionType;
type StatusFilter = (typeof statuses)[number];
type MarkingDraft = Record<
  QuestionType,
  { correct: string; incorrect: string; unattempted: string }
>;
type QuestionTypeMappingRow = {
  id: string;
  source: string;
  target: QuestionType;
};

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

const createMappingRow = (
  source: string,
  target: QuestionType,
): QuestionTypeMappingRow => ({
  id: `${source}-${target}-${Math.random().toString(36).slice(2, 8)}`,
  source,
  target,
});

const buildDefaultTypeMappingRows = (): QuestionTypeMappingRow[] =>
  questionTypes.map((qtype) => createMappingRow(qtype, qtype));

const LEADERBOARD_PREVIEW_TESTS_KEY = "testanalyser-leaderboard-preview-tests";

export const TestDetail = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const {
    state,
    currentUser,
    acknowledgeKeyUpdates,
    updateMarkingScheme,
    isAdmin,
    resyncTest,
    fetchTestLeaderboard,
  } = useAppStore();
  const test = state.tests.find((item) => item.id === testId);

  // NEW: Ref to track previous test ID for navigation detection
  const prevTestIdRef = useRef(test?.id);

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
    buildEmptyMarkingDraft(),
  );
  const [typeMappingRows, setTypeMappingRows] = useState<QuestionTypeMappingRow[]>(
    () => buildDefaultTypeMappingRows(),
  );
  const [markingMessage, setMarkingMessage] = useState<string | null>(null);

  // NEW: Loading and Edited states
  const [isSaving, setIsSaving] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [msFormEdited, setMsFormEdited] = useState(false); // Renamed from isDirty

  const [confirmResyncOpen, setConfirmResyncOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [leaderboardMessage, setLeaderboardMessage] = useState<string | null>(
    null,
  );
  const [selectedLeaderboardKey, setSelectedLeaderboardKey] = useState<
    string | null
  >(null);
  const [collapsedSubjects, setCollapsedSubjects] = useState<
    Record<Subject, boolean>
  >({
    PHYSICS: false,
    CHEMISTRY: false,
    MATHEMATICS: false,
  });

  // FIXED: useEffect logic to prevent race conditions and overwrites
  useEffect(() => {
    if (!test) {
      setMarkingDraft(buildEmptyMarkingDraft());
      setTypeMappingRows(buildDefaultTypeMappingRows());
      return;
    }

    const isNewTest = prevTestIdRef.current !== test.id;

    // 1. Only clear message if we actually navigated to a new test page
    if (isNewTest) {
      setMarkingMessage(null);
      setMsFormEdited(false); // Reset edited flag on new page load
      prevTestIdRef.current = test.id;
    }

    // 2. Only update the draft from DB if:
    //    a) It's a fresh page load (isNewTest)
    //    b) OR The user hasn't started typing yet (!msFormEdited)
    //    This prevents the input from jumping back to old values while typing.
    if (isNewTest || !msFormEdited) {
      const nextDraft = buildEmptyMarkingDraft();
      questionTypes.forEach((qtype) => {
        const entry = test.markingScheme?.[qtype];
        if (!entry) {
          return;
        }
        nextDraft[qtype] = {
          correct: String(entry.correct),
          incorrect: String(entry.incorrect),
          unattempted: String(entry.unattempted),
        };
      });
      const defaults = new Set<QuestionType>();
      const fallback = new Set<QuestionType>();
      test.questions.forEach((question) => {
        const qtype = question.qtype as QuestionType;
        if (!questionTypes.includes(qtype)) {
          return;
        }
        if (
          nextDraft[qtype].correct &&
          nextDraft[qtype].incorrect &&
          nextDraft[qtype].unattempted
        ) {
          return;
        }
        if (!question.markingOverridden && !defaults.has(qtype)) {
          defaults.add(qtype);
          nextDraft[qtype] = {
            correct: String(question.correctMarking),
            incorrect: String(question.incorrectMarking),
            unattempted: String(question.unattemptedMarking),
          };
          return;
        }
        if (fallback.has(qtype)) {
          return;
        }
        fallback.add(qtype);
        nextDraft[qtype] = {
          correct: String(question.correctMarking),
          incorrect: String(question.incorrectMarking),
          unattempted: String(question.unattemptedMarking),
        };
      });
      setMarkingDraft(nextDraft);
      const savedMapping = test.questionTypeMapping ?? {};
      const seen = new Set<string>();
      const rows: QuestionTypeMappingRow[] = [];
      questionTypes.forEach((qtype) => {
        const source =
          Object.entries(savedMapping).find(([, target]) => target === qtype)?.[0] ??
          qtype;
        const normalized = source.trim().toUpperCase();
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          rows.push(createMappingRow(source, qtype));
        }
      });
      Object.entries(savedMapping).forEach(([source, target]) => {
        const normalized = source.trim().toUpperCase();
        if (!normalized || seen.has(normalized)) {
          return;
        }
        if (!questionTypes.includes(target as QuestionType)) {
          return;
        }
        seen.add(normalized);
        rows.push(createMappingRow(source, target as QuestionType));
      });
      setTypeMappingRows(rows.length > 0 ? rows : buildDefaultTypeMappingRows());
    }
    // Note: We deliberately removed setMarkingMessage(null) from here
  }, [test, msFormEdited]); // Re-run when test updates

  const analysis = useMemo(() => (test ? buildAnalysis(test) : null), [test]);
  const acknowledgedAt =
    test ? currentUser?.preferences.acknowledgedKeyUpdates[test.id] ?? null : null;
  const latestKeyUpdate = analysis?.latestKeyUpdate ?? null;
  const hasNewKeyUpdates = Boolean(
    latestKeyUpdate && (!acknowledgedAt || acknowledgedAt < latestKeyUpdate),
  );
  const account = state.externalAccounts.find(
    (item) =>
      item.userId === currentUser?.id && item.provider === "test.z7i.in",
  );
  const canResync = Boolean(
    test?.externalExamId &&
    account &&
    account.syncStatus !== "syncing" &&
    !isResyncing,
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

  const typeOptions = useMemo(
    () => [
      { value: "ALL", label: "All types" },
      ...questionTypes.map((value) => ({
        value,
        label: formatQuestionType(value),
      })),
    ],
    [],
  );

  const handleMarkingSchemeSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMarkingMessage(null); // Clear previous messages

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

      // Validation: Check for empty strings first to avoid saving "0" accidentally
      if (
        entry.correct.trim() === "" ||
        entry.incorrect.trim() === "" ||
        entry.unattempted.trim() === ""
      ) {
        setMarkingMessage(
          `Please enter a value for all ${formatQuestionType(qtype)} fields.`,
        );
        return;
      }

      const correct = Number(entry.correct);
      const incorrect = Number(entry.incorrect);
      const unattempted = Number(entry.unattempted);

      if (
        !Number.isFinite(correct) ||
        !Number.isFinite(incorrect) ||
        !Number.isFinite(unattempted)
      ) {
        setMarkingMessage(
          `Enter valid numbers for ${formatQuestionType(qtype)}.`,
        );
        return;
      }
      if (
        !Number.isInteger(correct) ||
        !Number.isInteger(incorrect) ||
        !Number.isInteger(unattempted)
      ) {
        setMarkingMessage(
          `${formatQuestionType(qtype)} values must be whole numbers.`,
        );
        return;
      }
      scheme[qtype] = { correct, incorrect, unattempted };
    }
    const questionTypeMapping: Record<string, QuestionType> = {};
    for (const row of typeMappingRows) {
      const source = row.source.trim().toUpperCase();
      if (!source) {
        continue;
      }
      if (questionTypeMapping[source]) {
        setMarkingMessage(`Duplicate source type mapping for ${source}.`);
        return;
      }
      questionTypeMapping[source] = row.target;
    }
    try {
      setIsSaving(true);
      const result = await updateMarkingScheme({
        testId: test.id,
        scheme,
        questionTypeMapping,
      });
      if (!result.ok) {
        setMarkingMessage(result.message ?? "Failed to save marking scheme.");
        return;
      }
      setMarkingMessage(result.message ?? "Marking scheme updated.");
      setMsFormEdited(false); // Reset edited state so we can accept new updates from DB

      // Optional: Auto-clear message after 3 seconds
      setTimeout(() => setMarkingMessage(null), 3000);
    } catch (error) {
      console.error(error);
      setMarkingMessage("Failed to save marking scheme.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (
    qtype: QuestionType,
    field: "correct" | "incorrect" | "unattempted",
    value: string,
  ) => {
    setMsFormEdited(true); // Mark form as edited when user types
    setMarkingDraft((prev) => ({
      ...prev,
      [qtype]: {
        ...prev[qtype],
        [field]: value,
      },
    }));
  };

  const handleMappingRowChange = (
    id: string,
    field: "source" | "target",
    value: string,
  ) => {
    setMsFormEdited(true);
    setTypeMappingRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: field === "target" ? (value as QuestionType) : value,
            }
          : row,
      ),
    );
  };

  const handleAddMappingRow = () => {
    setMsFormEdited(true);
    setTypeMappingRows((prev) => [...prev, createMappingRow("", "MCQ")]);
  };

  const handleRemoveMappingRow = (id: string) => {
    setMsFormEdited(true);
    setTypeMappingRows((prev) => prev.filter((row) => row.id !== id));
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
      },
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

  useEffect(() => {
    if (!test) {
      setLeaderboard([]);
      setLeaderboardMessage(null);
      setIsLoadingLeaderboard(false);
      return;
    }
    let active = true;
    setIsLoadingLeaderboard(true);
    setLeaderboardMessage(null);
    void fetchTestLeaderboard(test.id)
      .then((result) => {
        if (!active) {
          return;
        }
        if (!result.ok) {
          setLeaderboard([]);
          setLeaderboardMessage(
            result.message ?? "Unable to load leaderboard.",
          );
          return;
        }
        setLeaderboard(result.leaderboard ?? []);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setLeaderboard([]);
        setLeaderboardMessage("Unable to load leaderboard.");
      })
      .finally(() => {
        if (active) {
          setIsLoadingLeaderboard(false);
        }
      });
    return () => {
      active = false;
    };
  }, [fetchTestLeaderboard, test]);

  const selectedLeaderboardEntry = useMemo(
    () =>
      selectedLeaderboardKey
        ? leaderboard.find(
            (entry) => entry.participantKey === selectedLeaderboardKey,
          ) ?? null
        : null,
    [leaderboard, selectedLeaderboardKey],
  );
  const selectedLeaderboardAnalysis = useMemo(
    () =>
      selectedLeaderboardEntry ? buildAnalysis(selectedLeaderboardEntry.test) : null,
    [selectedLeaderboardEntry],
  );
  const leaderboardRows = useMemo(() => {
    const sorted = [...leaderboard].sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.externalUsername.localeCompare(b.externalUsername);
    });
    let previousScore: number | null = null;
    let previousRank = 1;
    return sorted.map((entry, index) => {
      const rank =
        previousScore !== null && entry.score === previousScore
          ? previousRank
          : index + 1;
      previousScore = entry.score;
      previousRank = rank;
      return { ...entry, computedRank: rank };
    });
  }, [leaderboard]);

  const openLeaderboardQuestions = (entry: LeaderboardEntry) => {
    const first = buildDisplayQuestions(entry.test.questions)[0];
    const firstQuestionId = first?.question.id;
    if (!firstQuestionId) {
      return;
    }
    const raw = sessionStorage.getItem(LEADERBOARD_PREVIEW_TESTS_KEY);
    const parsed =
      raw && typeof raw === "string"
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {};
    parsed[entry.test.id] = entry.test;
    sessionStorage.setItem(LEADERBOARD_PREVIEW_TESTS_KEY, JSON.stringify(parsed));
    const params = new URLSearchParams({
      readonly: "1",
      participantKey: entry.participantKey,
      viewerName: entry.displayName,
      viewerUsername: entry.externalUsername,
    });
    navigate(`/app/questions/${entry.test.id}/${firstQuestionId}?${params.toString()}`);
  };

  if (!test || !analysis) {
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
                    Update marks and remap source question-type tokens to the fixed
                    internal types used by the app.
                  </p>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  form="marking-scheme-form"
                  disabled={!isAdmin || isSaving} // Disabled while saving
                >
                  {isSaving ? "Saving..." : "Save scheme"}
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
                          onChange={(e) =>
                            handleInputChange(qtype, "correct", e.target.value)
                          }
                          className="h-8 text-right"
                          disabled={!isAdmin}
                        />
                        <Input
                          type="number"
                          step="1"
                          value={markingDraft[qtype].incorrect}
                          onChange={(e) =>
                            handleInputChange(qtype, "incorrect", e.target.value)
                          }
                          className="h-8 text-right"
                          disabled={!isAdmin}
                        />
                        <Input
                          type="number"
                          step="1"
                          value={markingDraft[qtype].unattempted}
                          onChange={(e) =>
                            handleInputChange(
                              qtype,
                              "unattempted",
                              e.target.value,
                            )
                          }
                          className="h-8 text-right"
                          disabled={!isAdmin}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Source type mapping
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Example: map `B` to `MAQ` to rescrape those questions as
                        multiple correct with partial marking.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddMappingRow}
                      disabled={!isAdmin}
                    >
                      Add mapping
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {typeMappingRows.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,180px)_80px] gap-2"
                      >
                        <Input
                          value={row.source}
                          onChange={(event) =>
                            handleMappingRowChange(
                              row.id,
                              "source",
                              event.target.value,
                            )
                          }
                          placeholder="Source token, e.g. B"
                          disabled={!isAdmin}
                        />
                        <Select
                          value={row.target}
                          onValueChange={(value) =>
                            handleMappingRowChange(row.id, "target", value)
                          }
                          disabled={!isAdmin}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {questionTypes.map((qtype) => (
                              <SelectItem key={qtype} value={qtype}>
                                {qtype} - {formatQuestionType(qtype)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMappingRow(row.id)}
                          disabled={!isAdmin || typeMappingRows.length <= 1}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Saving a changed mapping will rescrape this exam when the
                    external account is connected, so old questions are reclassified
                    from source data.
                  </p>
                </div>
                {markingMessage ? (
                  <p className="text-xs text-muted-foreground">{markingMessage}</p>
                ) : null}
              </form>
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
              This will replace your current attempt with the latest data, but
              your bookmarks, notes, and key changes will remain intact.
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

      <Dialog
        open={Boolean(selectedLeaderboardEntry)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLeaderboardKey(null);
          }
        }}
      >
        <DialogContent className="max-w-7xl w-[95vw] h-[88vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {selectedLeaderboardEntry
                ? `${selectedLeaderboardEntry.displayName} summary`
                : "Summary"}
            </DialogTitle>
            <DialogDescription>
              @{selectedLeaderboardEntry?.externalUsername ?? "participant"}
              {selectedLeaderboardEntry &&
              selectedLeaderboardEntry.akaNames.length > 0
                ? ` - a.k.a. ${selectedLeaderboardEntry.akaNames.join(", ")}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (selectedLeaderboardEntry) {
                  openLeaderboardQuestions(selectedLeaderboardEntry);
                  setSelectedLeaderboardKey(null);
                }
              }}
            >
              Open questions
            </Button>
          </div>
          <div className="mt-2 h-[calc(100%-110px)] overflow-y-auto pr-1">
            {selectedLeaderboardEntry && selectedLeaderboardAnalysis ? (
              <TestSummaryCard
                test={selectedLeaderboardEntry.test}
                analysis={selectedLeaderboardAnalysis}
                defaultExpanded
                actions={<></>}
                collapsedAction={<></>}
                reviewAction={<></>}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <section>
        <Card className="app-panel">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Leaderboard
              </p>
              <p className="text-sm text-muted-foreground">
                Ranked by best score per external account for this exam.
              </p>
            </div>

            {isLoadingLeaderboard ? (
              <p className="text-sm text-muted-foreground">
                Loading leaderboard...
              </p>
            ) : leaderboardMessage ? (
              <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                {leaderboardMessage}
              </div>
            ) : leaderboardRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No leaderboard entries available yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <div className="grid grid-cols-[72px_minmax(0,220px)_minmax(0,220px)_minmax(240px,1fr)_120px] gap-3 bg-muted/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <span>Rank</span>
                  <span>Name</span>
                  <span className="text-right">Linked</span>
                  <span className="text-right">Score</span>
                  <span className="text-right">Summary</span>
                </div>
                <div className="divide-y divide-border/60">
                  {leaderboardRows.map((entry) => (
                    <div
                      key={entry.participantKey}
                      className="grid grid-cols-[72px_minmax(0,220px)_minmax(0,220px)_minmax(240px,1fr)_120px] items-start gap-3 px-3 py-2 text-xs text-muted-foreground"
                    >
                      <span className="font-semibold text-foreground">
                        #{entry.computedRank}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {entry.displayName}
                          </span>
                          {entry.isCurrentUserParticipant ? (
                            <Badge variant="secondary">You</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="truncate text-[11px] text-muted-foreground">
                          @{entry.externalUsername}
                        </p>
                        {entry.akaNames.length > 0 ? (
                          <p className="truncate text-[11px] text-muted-foreground">
                            a.k.a. {entry.akaNames.join(", ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="justify-self-end w-full max-w-[280px]">
                        <span className="block text-right text-foreground/90">
                          {entry.score}/{entry.totalScore}
                        </span>
                        <SegmentedProgressBar
                          className="mt-1 h-2"
                          segments={[
                            {
                              value: Math.max(0, entry.score),
                              className: "bg-emerald-500",
                            },
                            {
                              value: Math.max(0, entry.totalScore - entry.score),
                              className: "bg-zinc-300 dark:bg-zinc-700",
                            },
                          ]}
                        />
                      </div>
                      <div className="justify-self-end text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setSelectedLeaderboardKey(entry.participantKey)
                          }
                        >
                          View
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

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
                        ),
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



