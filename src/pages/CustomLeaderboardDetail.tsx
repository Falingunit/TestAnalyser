import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react";
import { buildAnalysis } from "@/lib/analysis";
import { useAppStore } from "@/lib/store";
import type { CustomLeaderboardEntry, Subject, TestRecord } from "@/lib/types";
import { cn, LEADERBOARD_PREVIEW_TESTS_KEY } from "@/lib/utils";
import { buildDisplayQuestions } from "@/lib/questionDisplay";
import { TestSummaryCard } from "@/components/TestSummaryCard";
import { SegmentedProgressBar } from "@/components/SegmentedProgressBar";
import { ParticipantNameWithTooltip } from "@/components/ParticipantNameWithTooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type LeaderboardSortKey = "rank" | "name" | "total" | "attempts" | Subject;
type LeaderboardSortDirection = "asc" | "desc";

const leaderboardSubjects: Subject[] = [
  "PHYSICS",
  "CHEMISTRY",
  "MATHEMATICS",
];

const subjectLabels: Record<Subject, string> = {
  PHYSICS: "Phy",
  CHEMISTRY: "Chem",
  MATHEMATICS: "Math",
};

const getSortableTime = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sortAttempts = (attempts: TestRecord[]) =>
  [...attempts].sort((a, b) => {
    const timeDiff = getSortableTime(b.examDate) - getSortableTime(a.examDate);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.title.localeCompare(b.title, undefined, {
      sensitivity: "base",
    });
  });

const buildCombinedLeaderboardTest = (
  entry: CustomLeaderboardEntry,
  attempts: TestRecord[],
  leaderboardTitle: string,
): TestRecord => {
  const orderedAttempts = sortAttempts(attempts);
  const answers: TestRecord["answers"] = {};
  const timings: TestRecord["timings"] = {};
  const bookmarks: TestRecord["bookmarks"] = {};
  const questions: TestRecord["questions"] = [];
  let questionNumber = 1;

  orderedAttempts.forEach((attempt) => {
    attempt.questions.forEach((question) => {
      const combinedQuestionId = `combined:${attempt.id}:${question.id}`;
      questions.push({
        ...question,
        id: combinedQuestionId,
        questionNumber,
      });
      answers[combinedQuestionId] = attempt.answers[question.id] ?? null;
      timings[combinedQuestionId] = attempt.timings[question.id] ?? 0;
      if (attempt.bookmarks[question.id]) {
        bookmarks[combinedQuestionId] = true;
      }
      questionNumber += 1;
    });
  });

  const latestExamDate =
    orderedAttempts.reduce((latest, attempt) => {
      if (!latest || getSortableTime(attempt.examDate) > getSortableTime(latest)) {
        return attempt.examDate;
      }
      return latest;
    }, orderedAttempts[0]?.examDate ?? "") || new Date().toISOString();

  return {
    id: `leaderboard:${entry.participantKey}`,
    userId: orderedAttempts[0]?.userId ?? "",
    examId: `leaderboard:${entry.participantKey}`,
    title: `${leaderboardTitle} net overview`,
    examDate: latestExamDate,
    rank: entry.rank,
    calculatedRank: entry.rank,
    answers,
    timings,
    bookmarks,
    questions,
  };
};

export const CustomLeaderboardDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    state,
    isAdmin,
    fetchCustomLeaderboard,
    fetchCustomLeaderboardParticipant,
    updateCustomLeaderboard,
    showComparison,
  } = useAppStore();
  const [leaderboard, setLeaderboard] = useState<CustomLeaderboardEntry[]>([]);
  const [title, setTitle] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [examTitles, setExamTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [titleMessage, setTitleMessage] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isLeaderboardCollapsed, setIsLeaderboardCollapsed] = useState(false);
  const [selectedLeaderboardKey, setSelectedLeaderboardKey] = useState<
    string | null
  >(null);
  const [participantAttempts, setParticipantAttempts] = useState<
    Record<string, TestRecord[]>
  >({});
  const [loadingParticipant, setLoadingParticipant] = useState(false);
  const [isSelectedTestsCollapsed, setIsSelectedTestsCollapsed] =
    useState(true);
  const [leaderboardSort, setLeaderboardSort] = useState<{
    key: LeaderboardSortKey;
    direction: LeaderboardSortDirection;
  }>({
    key: "rank",
    direction: "desc",
  });

  useEffect(() => {
    let active = true;
    if (!id || !showComparison) {
      return;
    }

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setError(null);
      }
    });
    void fetchCustomLeaderboard(id)
      .then((data) => {
        if (!active) {
          return;
        }
        if (data.ok) {
          const nextTitle = data.title || "";
          setLeaderboard(data.leaderboard || []);
          setTitle(nextTitle);
          setTitleDraft(nextTitle);
          setDescription(data.description || null);
          setExamTitles(data.examTitles || []);
        } else {
          setError(data.message || "Failed to load leaderboard.");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setError("Failed to load leaderboard.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, fetchCustomLeaderboard, state.tests, showComparison]);

  useEffect(() => {
    queueMicrotask(() => {
      setIsSelectedTestsCollapsed(true);
    });
  }, [selectedLeaderboardKey]);

  const handleLeaderboardSort = (key: LeaderboardSortKey) => {
    setLeaderboardSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        key,
        direction: key === "name" ? "asc" : "desc",
      };
    });
  };

  const getLeaderboardSortIndicator = (key: LeaderboardSortKey) => {
    if (leaderboardSort.key !== key) {
      return null;
    }
    return leaderboardSort.direction === "asc" ? "^" : "v";
  };

  const leaderboardRows = useMemo(() => {
    const direction = leaderboardSort.direction === "asc" ? 1 : -1;
    return [...leaderboard].sort((a, b) => {
      if (leaderboardSort.key === "name") {
        const byName =
          a.displayName.localeCompare(b.displayName, undefined, {
            sensitivity: "base",
          }) ||
          a.externalUsername.localeCompare(b.externalUsername, undefined, {
            sensitivity: "base",
          });
        if (byName !== 0) {
          return byName * direction;
        }
      } else if (leaderboardSort.key === "attempts") {
        const diff = a.attemptCount - b.attemptCount;
        if (diff !== 0) {
          return diff * direction;
        }
      } else if (
        leaderboardSort.key === "rank" ||
        leaderboardSort.key === "total"
      ) {
        const diff = a.score - b.score;
        if (diff !== 0) {
          return diff * direction;
        }
      } else {
        const subjectKey = leaderboardSort.key as Subject;
        const scoreA = a.subjectScores[subjectKey]?.score ?? 0;
        const scoreB = b.subjectScores[subjectKey]?.score ?? 0;
        const diff = scoreA - scoreB;
        if (diff !== 0) {
          return diff * direction;
        }
      }

      return a.externalUsername.localeCompare(b.externalUsername, undefined, {
        sensitivity: "base",
      });
    });
  }, [leaderboard, leaderboardSort]);

  const selectedLeaderboardEntry = useMemo(
    () =>
      selectedLeaderboardKey
        ? leaderboard.find(
            (entry) => entry.participantKey === selectedLeaderboardKey,
          ) ?? null
        : null,
    [leaderboard, selectedLeaderboardKey],
  );

  useEffect(() => {
    if (
      !selectedLeaderboardKey ||
      !id ||
      participantAttempts[selectedLeaderboardKey] ||
      !showComparison
    ) {
      return;
    }

    queueMicrotask(() => {
      setLoadingParticipant(true);
    });
    void fetchCustomLeaderboardParticipant(id, selectedLeaderboardKey)
      .then((data) => {
        if (data.ok && data.attempts) {
          setParticipantAttempts((prev) => ({
            ...prev,
            [selectedLeaderboardKey]: data.attempts || [],
          }));
        }
        setLoadingParticipant(false);
      })
      .catch(() => {
        setLoadingParticipant(false);
      });
  }, [
    selectedLeaderboardKey,
    id,
    fetchCustomLeaderboardParticipant,
    participantAttempts,
    showComparison,
  ]);

  const selectedLeaderboardAttempts = useMemo(
    () =>
      selectedLeaderboardKey
        ? sortAttempts(participantAttempts[selectedLeaderboardKey] ?? [])
        : [],
    [participantAttempts, selectedLeaderboardKey],
  );

  const selectedLeaderboardCombinedTest = useMemo(
    () =>
      selectedLeaderboardEntry && selectedLeaderboardAttempts.length > 0
        ? buildCombinedLeaderboardTest(
            selectedLeaderboardEntry,
            selectedLeaderboardAttempts,
            title,
          )
        : null,
    [selectedLeaderboardAttempts, selectedLeaderboardEntry, title],
  );

  const selectedLeaderboardAnalysis = useMemo(
    () =>
      selectedLeaderboardCombinedTest
        ? buildAnalysis(selectedLeaderboardCombinedTest)
        : null,
    [selectedLeaderboardCombinedTest],
  );

  const openLeaderboardQuestions = (
    entry: CustomLeaderboardEntry,
    testRecord: TestRecord,
  ) => {
    const first = buildDisplayQuestions(testRecord.questions)[0];
    const firstQuestionId = first?.question.id;
    if (!firstQuestionId) {
      return;
    }

    const raw = sessionStorage.getItem(LEADERBOARD_PREVIEW_TESTS_KEY);
    const parsed =
      raw && typeof raw === "string"
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {};
    parsed[testRecord.id] = testRecord;
    sessionStorage.setItem(
      LEADERBOARD_PREVIEW_TESTS_KEY,
      JSON.stringify(parsed),
    );

    const params = new URLSearchParams({
      readonly: "1",
      participantKey: entry.participantKey,
      viewerName: entry.displayName,
      viewerRemoteName: entry.remoteDisplayName ?? "",
      viewerUsername: entry.externalUsername,
    });
    navigate(
      `/app/questions/${testRecord.id}/${firstQuestionId}?${params.toString()}`,
    );
  };

  const handleTitleSave = async () => {
    if (!id) {
      return;
    }

    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleMessage("Title is required.");
      return;
    }

    setIsSavingTitle(true);
    setTitleMessage(null);
    const result = await updateCustomLeaderboard(id, { title: nextTitle });
    setIsSavingTitle(false);

    if (!result.ok) {
      setTitleMessage(result.message || "Failed to update leaderboard title.");
      return;
    }

    setTitle(nextTitle);
    setTitleDraft(nextTitle);
    setIsEditingTitle(false);
    setTitleMessage("Title updated.");
  };

  if (!showComparison) {
    return (
      <div className="flex h-[50vh] items-center justify-center p-8 text-center text-muted-foreground">
        Comparison features are disabled in your preferences.
      </div>
    );
  }

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <section className="app-surface space-y-6 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/app/leaderboards")}
              className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Leaderboards
            </Button>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Leaderboard ranking
              </p>
              {isAdmin && isEditingTitle ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    className="max-w-xl"
                    placeholder="Leaderboard title"
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleTitleSave()}
                    disabled={isSavingTitle}
                  >
                    {isSavingTitle ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTitleDraft(title);
                      setTitleMessage(null);
                      setIsEditingTitle(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-semibold">{title}</h1>
                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditingTitle(true)}
                    >
                      Edit title
                    </Button>
                  ) : null}
                </div>
              )}
              <div className="mt-2 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Compare combined performance across selected tests.
                </p>
                {description ? (
                  <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">
                    {description}
                  </p>
                ) : null}
                {examTitles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <span className="self-center text-xs text-muted-foreground">
                      Included tests:
                    </span>
                    {examTitles.map((examTitle, index) => (
                      <Badge
                        key={`${examTitle}-${index}`}
                        variant="outline"
                        className="text-[10px] font-normal"
                      >
                        {examTitle}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {titleMessage ? (
                  <p className="text-xs text-muted-foreground">{titleMessage}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <Dialog
          open={Boolean(selectedLeaderboardKey)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedLeaderboardKey(null);
            }
          }}
        >
          <DialogContent className="flex h-[88vh] w-[95vw] max-w-7xl flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                {selectedLeaderboardEntry
                  ? (
                      <>
                        <ParticipantNameWithTooltip
                          visibleName={selectedLeaderboardEntry.displayName}
                          remoteDisplayName={selectedLeaderboardEntry.remoteDisplayName}
                        />{" "}
                        summary
                      </>
                    )
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

            <div className="mt-2 flex-1 space-y-4 overflow-y-auto pr-2">
              {loadingParticipant ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mb-4 h-8 w-8 animate-spin" />
                  <p>Loading participant results...</p>
                </div>
              ) : (
                <>
                  {selectedLeaderboardCombinedTest && selectedLeaderboardAnalysis ? (
                    <TestSummaryCard
                      test={selectedLeaderboardCombinedTest}
                      analysis={selectedLeaderboardAnalysis}
                      defaultExpanded
                      actions={<></>}
                      collapsedAction={<></>}
                      reviewAction={<></>}
                    />
                  ) : null}

                  {selectedLeaderboardEntry ? (
                    <Card className="app-panel">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              Included tests
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Best attempt from each leaderboard test.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setIsSelectedTestsCollapsed((current) => !current)
                            }
                          >
                            {isSelectedTestsCollapsed ? "Show" : "Hide"}
                            <ChevronDown
                              className={cn(
                                "ml-1 h-4 w-4 transition-transform",
                                isSelectedTestsCollapsed
                                  ? "-rotate-90"
                                  : "rotate-0",
                              )}
                            />
                          </Button>
                        </div>

                        {isSelectedTestsCollapsed ? (
                          <p className="text-sm text-muted-foreground">
                            {selectedLeaderboardAttempts.length} test overviews
                          </p>
                        ) : selectedLeaderboardAttempts.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No attempts found for this participant.
                          </p>
                        ) : (
                          <div className="grid gap-4 xl:grid-cols-2">
                            {selectedLeaderboardAttempts.map((testRecord) => {
                              const analysis = buildAnalysis(testRecord);
                              const openQuestionsAction = (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    openLeaderboardQuestions(
                                      selectedLeaderboardEntry,
                                      testRecord,
                                    )
                                  }
                                >
                                  Open questions
                                </Button>
                              );

                              return (
                                <TestSummaryCard
                                  key={testRecord.id}
                                  test={testRecord}
                                  analysis={analysis}
                                  defaultExpanded={false}
                                  actions={openQuestionsAction}
                                  collapsedAction={openQuestionsAction}
                                  reviewAction={<></>}
                                />
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : null}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Card className="app-panel">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Participants
                </p>
                <p className="text-sm text-muted-foreground">
                  Ranked by sum of best scores.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsLeaderboardCollapsed((current) => !current)}
              >
                {isLeaderboardCollapsed ? "Show" : "Hide"}
                <ChevronDown
                  className={cn(
                    "ml-1 h-4 w-4 transition-transform",
                    isLeaderboardCollapsed ? "-rotate-90" : "rotate-0",
                  )}
                />
              </Button>
            </div>

            {isLeaderboardCollapsed ? (
              <p className="text-sm text-muted-foreground">
                {leaderboardRows.length} entries
              </p>
            ) : leaderboardRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No leaderboard entries available yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <div className="grid grid-cols-[72px_minmax(220px,1fr)_minmax(0,220px)_100px_minmax(0,160px)_minmax(0,160px)_minmax(0,160px)_minmax(0,180px)_120px] gap-3 bg-muted/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <button
                    type="button"
                    className="cursor-pointer text-left transition-colors hover:text-foreground"
                    onClick={() => handleLeaderboardSort("rank")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Rank
                      {getLeaderboardSortIndicator("rank") ? (
                        <span>{getLeaderboardSortIndicator("rank")}</span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer text-left transition-colors hover:text-foreground"
                    onClick={() => handleLeaderboardSort("name")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Name
                      {getLeaderboardSortIndicator("name") ? (
                        <span>{getLeaderboardSortIndicator("name")}</span>
                      ) : null}
                    </span>
                  </button>
                  <span className="text-right">Linked</span>
                  <button
                    type="button"
                    className="cursor-pointer text-right transition-colors hover:text-foreground"
                    onClick={() => handleLeaderboardSort("attempts")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Attempts
                      {getLeaderboardSortIndicator("attempts") ? (
                        <span>{getLeaderboardSortIndicator("attempts")}</span>
                      ) : null}
                    </span>
                  </button>
                  {leaderboardSubjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      className="cursor-pointer text-right transition-colors hover:text-foreground"
                      onClick={() => handleLeaderboardSort(subject)}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {subjectLabels[subject]}
                        {getLeaderboardSortIndicator(subject) ? (
                          <span>{getLeaderboardSortIndicator(subject)}</span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="cursor-pointer text-right transition-colors hover:text-foreground"
                    onClick={() => handleLeaderboardSort("total")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Total
                      {getLeaderboardSortIndicator("total") ? (
                        <span>{getLeaderboardSortIndicator("total")}</span>
                      ) : null}
                    </span>
                  </button>
                  <span className="text-right">Summary</span>
                </div>
                <div className="divide-y divide-border/60">
                  {leaderboardRows.map((entry) => (
                    <div
                      key={entry.participantKey}
                      className="grid grid-cols-[72px_minmax(220px,1fr)_minmax(0,220px)_100px_minmax(0,160px)_minmax(0,160px)_minmax(0,160px)_minmax(0,180px)_120px] items-start gap-3 px-3 py-3 text-xs text-muted-foreground"
                    >
                      <span className="font-semibold text-foreground">
                        #{entry.rank}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ParticipantNameWithTooltip
                            visibleName={entry.displayName}
                            remoteDisplayName={entry.remoteDisplayName}
                            className="truncate text-sm font-semibold text-foreground"
                          />
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
                      <div className="text-right font-medium text-foreground/90">
                        {entry.attemptCount}
                      </div>
                      {leaderboardSubjects.map((subject) => {
                        const item = entry.subjectScores[subject] || {
                          score: 0,
                          total: 0,
                        };
                        return (
                          <div
                            key={`${entry.participantKey}-${subject}`}
                            className="w-full"
                          >
                            <span className="block text-right font-medium text-foreground/90">
                              {item.score}/{item.total}
                            </span>
                            <SegmentedProgressBar
                              className="mt-1.5 h-1.5"
                              segments={[
                                {
                                  value: Math.max(0, item.score),
                                  className: "bg-sky-500",
                                },
                                {
                                  value: Math.max(0, item.total - item.score),
                                  className: "bg-zinc-300 dark:bg-zinc-700",
                                },
                              ]}
                            />
                          </div>
                        );
                      })}
                      <div className="w-full">
                        <span className="block text-right text-sm font-semibold text-foreground/90">
                          {entry.score}/{entry.totalScore}
                        </span>
                        <SegmentedProgressBar
                          className="mt-1.5 h-2"
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
                          onClick={() => setSelectedLeaderboardKey(entry.participantKey)}
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
    </div>
  );
};
