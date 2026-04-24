import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, ArrowLeft, Loader2 } from "lucide-react";
import { cn, LEADERBOARD_PREVIEW_TESTS_KEY } from "@/lib/utils";
import { TestSummaryCard } from "@/components/TestSummaryCard";
import { buildAnalysis } from "@/lib/analysis";
import { buildDisplayQuestions } from "@/lib/questionDisplay";
import { SegmentedProgressBar } from "@/components/SegmentedProgressBar";
import { Badge } from "@/components/ui/badge";
import type { TestRecord, Subject, CustomLeaderboardEntry } from "@/lib/types";

type LeaderboardSortKey = "rank" | "name" | "total" | "attempts" | Subject;
type LeaderboardSortDirection = "asc" | "desc";

const leaderboardSubjects: Subject[] = ["PHYSICS", "CHEMISTRY", "MATHEMATICS"];
const subjectLabels: Record<Subject, string> = {
  PHYSICS: "Phy",
  CHEMISTRY: "Chem",
  MATHEMATICS: "Math",
};

export const CustomLeaderboardDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    state,
    currentUser,
    fetchCustomLeaderboard,
    fetchCustomLeaderboardParticipant,
  } = useAppStore();
  const showComparison = currentUser?.preferences.showComparison ?? true;
  const [leaderboard, setLeaderboard] = useState<CustomLeaderboardEntry[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [examTitles, setExamTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isLeaderboardCollapsed, setIsLeaderboardCollapsed] = useState(false);
  const [selectedLeaderboardKey, setSelectedLeaderboardKey] =
    useState<string | null>(null);
  const [participantAttempts, setParticipantAttempts] = useState<
    Record<string, TestRecord[]>
  >({});
  const [loadingParticipant, setLoadingParticipant] = useState(false);

  const [leaderboardSort, setLeaderboardSort] = useState<{
    key: LeaderboardSortKey;
    direction: LeaderboardSortDirection;
  }>({
    key: "rank",
    direction: "desc",
  });

  useEffect(() => {
    let active = true;
    if (!id || !showComparison) return;

    setLoading(true);
    fetchCustomLeaderboard(id)
      .then((data) => {
        if (!active) return;
        if (data.ok) {
          setLeaderboard(data.leaderboard || []);
          setTitle(data.title || "");
          setDescription(data.description || null);
          setExamTitles(data.examTitles || []);
        } else {
          setError(data.message || "Failed to load leaderboard.");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Failed to load leaderboard.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, fetchCustomLeaderboard, state.tests, showComparison]);

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
    if (leaderboardSort.key !== key) return null;
    return leaderboardSort.direction === "asc" ? "↑" : "↓";
  };

  const leaderboardRows = useMemo(() => {
    const direction = leaderboardSort.direction === "asc" ? 1 : -1;
    return [...leaderboard].sort((a, b) => {
      if (leaderboardSort.key === "name") {
        const byName =
          a.displayName.localeCompare(b.displayName) ||
          a.externalUsername.localeCompare(b.externalUsername);
        if (byName !== 0) return byName * direction;
      } else if (leaderboardSort.key === "attempts") {
        const diff = a.attemptCount - b.attemptCount;
        if (diff !== 0) return diff * direction;
      } else if (
        leaderboardSort.key === "rank" ||
        leaderboardSort.key === "total"
      ) {
        const diff = a.score - b.score;
        if (diff !== 0) return diff * direction;
      } else {
        const subjKey = leaderboardSort.key as Subject;
        const scoreA = a.subjectScores[subjKey]?.score ?? 0;
        const scoreB = b.subjectScores[subjKey]?.score ?? 0;
        const diff = scoreA - scoreB;
        if (diff !== 0) return diff * direction;
      }
      return a.externalUsername.localeCompare(b.externalUsername);
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
      selectedLeaderboardKey &&
      id &&
      !participantAttempts[selectedLeaderboardKey] &&
      showComparison
    ) {
      setLoadingParticipant(true);
      fetchCustomLeaderboardParticipant(id, selectedLeaderboardKey)
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
    }
  }, [
    selectedLeaderboardKey,
    id,
    fetchCustomLeaderboardParticipant,
    participantAttempts,
    showComparison,
  ]);

  const openLeaderboardQuestions = (
    entry: CustomLeaderboardEntry,
    testRecord: TestRecord,
  ) => {
    const first = buildDisplayQuestions(testRecord.questions)[0];
    const firstQuestionId = first?.question.id;
    if (!firstQuestionId) return;

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
      viewerUsername: entry.externalUsername,
    });
    navigate(
      `/app/questions/${testRecord.id}/${firstQuestionId}?${params.toString()}`,
    );
  };

  if (!showComparison) {
    return (
      <div className="flex h-[50vh] items-center justify-center p-8 text-center text-muted-foreground">
        Comparison features are disabled in your preferences.
      </div>
    );
  }

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="space-y-6">
      <section className="app-surface space-y-6 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <Button variant="ghost" onClick={() => navigate("/app/leaderboards")} className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Leaderboards
            </Button>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Leaderboard ranking
              </p>
              <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
              <div className="mt-2 space-y-2">
                {description && (
                  <p className="text-sm text-muted-foreground max-w-3xl whitespace-pre-wrap">
                    {description}
                  </p>
                )}
                {examTitles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground self-center">Included tests:</span>
                    {examTitles.map((t, idx) => (
                      <Badge key={idx} variant="outline" className="text-[10px] font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <Dialog
          open={Boolean(selectedLeaderboardKey)}
          onOpenChange={(open) => {
            if (!open) setSelectedLeaderboardKey(null);
          }}
        >
          <DialogContent className="max-w-7xl w-[95vw] h-[88vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {selectedLeaderboardEntry ? `${selectedLeaderboardEntry.displayName} summary` : "Summary"}
              </DialogTitle>
              <DialogDescription>
                @{selectedLeaderboardEntry?.externalUsername ?? "participant"}
                {selectedLeaderboardEntry && selectedLeaderboardEntry.akaNames.length > 0
                  ? ` - a.k.a. ${selectedLeaderboardEntry.akaNames.join(", ")}`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 mt-2 overflow-y-auto pr-2 space-y-4">
              {loadingParticipant && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  <p>Loading participant results...</p>
                </div>
              )}
              {!loadingParticipant && selectedLeaderboardKey && participantAttempts[selectedLeaderboardKey]?.map((testRecord) => {
                const analysis = buildAnalysis(testRecord);
                return (
                  <TestSummaryCard
                    key={testRecord.id}
                    test={testRecord}
                    analysis={analysis}
                    defaultExpanded={false}
                    actions={<></>}
                    collapsedAction={
                      <Button size="sm" onClick={(e) => {
                        e.stopPropagation();
                        openLeaderboardQuestions(selectedLeaderboardEntry!, testRecord);
                      }}>
                        Open questions
                      </Button>
                    }
                    reviewAction={<></>}
                  />
                );
              })}
              {!loadingParticipant && selectedLeaderboardKey && (!participantAttempts[selectedLeaderboardKey] || participantAttempts[selectedLeaderboardKey].length === 0) && (
                <p className="text-center py-12 text-muted-foreground">No attempts found for this participant.</p>
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
                  className={cn("ml-1 h-4 w-4 transition-transform", isLeaderboardCollapsed ? "-rotate-90" : "rotate-0")}
                />
              </Button>
            </div>

            {isLeaderboardCollapsed ? (
              <p className="text-sm text-muted-foreground">{leaderboardRows.length} entries</p>
            ) : leaderboardRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leaderboard entries available yet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <div className="grid grid-cols-[72px_minmax(220px,1fr)_minmax(0,220px)_100px_minmax(0,160px)_minmax(0,160px)_minmax(0,160px)_minmax(0,180px)_120px] gap-3 bg-muted/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <button type="button" className="cursor-pointer text-left transition-colors hover:text-foreground" onClick={() => handleLeaderboardSort("rank")}>
                    <span className="inline-flex items-center gap-1">Rank {getLeaderboardSortIndicator("rank")}</span>
                  </button>
                  <button type="button" className="cursor-pointer text-left transition-colors hover:text-foreground" onClick={() => handleLeaderboardSort("name")}>
                    <span className="inline-flex items-center gap-1">Name {getLeaderboardSortIndicator("name")}</span>
                  </button>
                  <span className="text-right">Linked</span>
                  <button type="button" className="cursor-pointer text-right transition-colors hover:text-foreground" onClick={() => handleLeaderboardSort("attempts")}>
                    <span className="inline-flex items-center justify-end gap-1">Attempts {getLeaderboardSortIndicator("attempts")}</span>
                  </button>
                  {leaderboardSubjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      className="cursor-pointer text-right transition-colors hover:text-foreground"
                      onClick={() => handleLeaderboardSort(subject)}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {subjectLabels[subject]} {getLeaderboardSortIndicator(subject)}
                      </span>
                    </button>
                  ))}
                  <button type="button" className="cursor-pointer text-right transition-colors hover:text-foreground" onClick={() => handleLeaderboardSort("total")}>
                    <span className="inline-flex items-center justify-end gap-1">Total {getLeaderboardSortIndicator("total")}</span>
                  </button>
                  <span className="text-right">Summary</span>
                </div>
                <div className="divide-y divide-border/60">
                  {leaderboardRows.map((entry) => (
                    <div
                      key={entry.participantKey}
                      className="grid grid-cols-[72px_minmax(220px,1fr)_minmax(0,220px)_100px_minmax(0,160px)_minmax(0,160px)_minmax(0,160px)_minmax(0,180px)_120px] items-start gap-3 px-3 py-3 text-xs text-muted-foreground"
                    >
                      <span className="font-semibold text-foreground">#{entry.rank}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {entry.displayName}
                          </span>
                          {entry.isCurrentUserParticipant && (
                            <Badge variant="secondary">You</Badge>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="truncate text-[11px] text-muted-foreground">@{entry.externalUsername}</p>
                        {entry.akaNames.length > 0 && (
                          <p className="truncate text-[11px] text-muted-foreground">a.k.a. {entry.akaNames.join(", ")}</p>
                        )}
                      </div>
                      <div className="text-right text-foreground/90 font-medium">
                        {entry.attemptCount}
                      </div>
                      {leaderboardSubjects.map((subject) => {
                        const item = entry.subjectScores[subject] || { score: 0, total: 0 };
                        return (
                          <div key={`${entry.participantKey}-${subject}`} className="w-full">
                            <span className="block text-right text-foreground/90 font-medium">
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
                        <span className="block text-right text-foreground/90 font-semibold text-sm">
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
