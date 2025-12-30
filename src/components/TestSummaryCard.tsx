import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { getQuestionStatus, type buildAnalysis } from "@/lib/analysis";
import type { TestRecord } from "@/lib/types";
import { SegmentedProgressBar } from "@/components/SegmentedProgressBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatQuestionType } from "@/lib/utils";
import { buildDisplayQuestions } from "@/lib/questionDisplay";

type TestAnalysis = ReturnType<typeof buildAnalysis>;

type TestSummaryCardProps = {
  test: TestRecord;
  analysis?: TestAnalysis | null;
  actions?: ReactNode;
  className?: string;
  collapsedAction?: ReactNode;
  defaultExpanded?: boolean;
  reviewAction?: ReactNode;
};

const subjectOrder = [
  { id: "PHYSICS", label: "Physics" },
  { id: "CHEMISTRY", label: "Chemistry" },
  { id: "MATHEMATICS", label: "Mathematics" },
];

const questionTypes = ["MCQ", "MAQ", "NAT", "VMAQ"] as const;

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const buildSegments = (
  correct: number,
  partial: number,
  incorrect: number,
  unattempted: number
) => [
  { value: correct, className: "bg-emerald-500" },
  { value: partial, className: "bg-amber-400" },
  { value: incorrect, className: "bg-rose-500" },
  { value: unattempted, className: "bg-white" },
];

export const TestSummaryCard = ({
  test,
  analysis,
  actions,
  className,
  collapsedAction,
  defaultExpanded = false,
  reviewAction,
}: TestSummaryCardProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const overallTypeStats = useMemo(() => {
    const typeMap = {} as Record<
      (typeof questionTypes)[number],
      { correct: number; partial: number; incorrect: number; unattempted: number }
    >;
    questionTypes.forEach((type) => {
      typeMap[type] = { correct: 0, partial: 0, incorrect: 0, unattempted: 0 };
    });

    test.questions.forEach((question) => {
      const type = question.qtype as (typeof questionTypes)[number];
      if (!questionTypes.includes(type)) {
        return;
      }
      const status = getQuestionStatus(test, question);
      const bucket = typeMap[type];
      if (status === "Correct") {
        bucket.correct += 1;
      } else if (status === "Partial") {
        bucket.partial += 1;
      } else if (status === "Incorrect") {
        bucket.incorrect += 1;
      } else {
        bucket.unattempted += 1;
      }
    });

    return typeMap;
  }, [test]);
  const hasPartialQuestions = useMemo(
    () => Object.values(overallTypeStats).some((stats) => stats.partial > 0),
    [overallTypeStats],
  );
  const subjectTypeStats = useMemo(() => {
    const stats = new Map<
      string,
      Record<
        (typeof questionTypes)[number],
        { correct: number; partial: number; incorrect: number; unattempted: number }
      >
    >();

    subjectOrder.forEach((subject) => {
      const typeMap = {} as Record<
        (typeof questionTypes)[number],
        { correct: number; partial: number; incorrect: number; unattempted: number }
      >;
      questionTypes.forEach((type) => {
        typeMap[type] = { correct: 0, partial: 0, incorrect: 0, unattempted: 0 };
      });
      stats.set(subject.id, typeMap);
    });

    test.questions.forEach((question) => {
      const type = question.qtype as (typeof questionTypes)[number];
      const subjectStats = stats.get(question.subject);
      if (!subjectStats || !questionTypes.includes(type)) {
        return;
      }
      const status = getQuestionStatus(test, question);
      const bucket = subjectStats[type];
      if (status === "Correct") {
        bucket.correct += 1;
      } else if (status === "Partial") {
        bucket.partial += 1;
      } else if (status === "Incorrect") {
        bucket.incorrect += 1;
      } else {
        bucket.unattempted += 1;
      }
    });

    return stats;
  }, [test]);
  const totalScore = test.questions.reduce(
    (sum, question) => sum + question.correctMarking,
    0
  );
  const subjectTotals = test.questions.reduce((map, question) => {
    const current = map.get(question.subject) ?? 0;
    map.set(question.subject, current + question.correctMarking);
    return map;
  }, new Map<string, number>());
  const subjectSummary = subjectOrder.map((subject) => {
    const section = analysis?.perSection.find(
      (entry) => entry.id === subject.id || entry.name === subject.id
    );
    return {
      label: subject.label,
      score: section?.score ?? 0,
      total: subjectTotals.get(subject.id) ?? 0,
      correct: section?.correct ?? 0,
      partial: section?.partial ?? 0,
      incorrect: section?.incorrect ?? 0,
      unattempted: section?.unattempted ?? 0,
      typeStats: subjectTypeStats.get(subject.id),
    };
  });

  const scoreLabel = analysis
    ? `${analysis.scoreCurrent}/${totalScore}`
    : "n/a";
  const accuracyLabel = analysis ? `${analysis.accuracy}%` : "n/a";
  const rankValue = test.rank === null ? "n/a" : String(test.rank);
  const rankBadgeLabel = test.rank === null ? null : `Rank ${test.rank}`;
  const totalSegments = buildSegments(
    analysis?.correct ?? 0,
    analysis?.partial ?? 0,
    analysis?.incorrect ?? 0,
    analysis?.unattempted ?? 0
  );
  const openReview = (
    <Button asChild variant="outline" size="sm">
      <Link to={`/app/tests/${test.id}`}>Open review</Link>
    </Button>
  );
  const firstQuestionId = useMemo(() => {
    const first = buildDisplayQuestions(test.questions)[0]
    return first?.question.id ?? ""
  }, [test.questions])
  const headerReviewAction = reviewAction ?? openReview;
  const actionContent = actions ?? (
    <>
      {headerReviewAction}
      <Button asChild size="sm">
        <Link to={`/app/questions/${test.id}/${firstQuestionId}`}>
          Open questions
        </Link>
      </Button>
    </>
  );
  const collapsedActionContent = collapsedAction ?? openReview;

  if (!isExpanded) {
    return (
      <Card
        className={cn("app-panel cursor-pointer", className)}
        onClick={() => setIsExpanded(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsExpanded(true);
          }
        }}
      >
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-base font-semibold text-foreground">
              {test.title}
            </p>
            {analysis?.keyChanges.length ? (
              <Badge variant="destructive">New key changes</Badge>
            ) : (
              <Badge variant="secondary">Key changes verified</Badge>
            )}
            {rankBadgeLabel ? (
              <Badge variant="outline">{rankBadgeLabel}</Badge>
            ) : null}
            <SegmentedProgressBar className="h-1.5 w-32" segments={totalSegments} />
            <div onClick={(event) => event.stopPropagation()}>
              {collapsedActionContent}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(true)}
              aria-label="Expand details"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("app-panel", className)}>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-foreground">{test.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(test.examDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {analysis?.keyChanges.length ? (
              <Badge variant="destructive">New key changes</Badge>
            ) : (
              <Badge variant="secondary">Key changes verified</Badge>
            )}
            {headerReviewAction}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronDown className="h-4 w-4 rotate-180" />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-3 sm:grid-rows-2">
            <div
              className="rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="grid grid-cols-2 gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <span>Score</span>
                <span className="text-right">Rank</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <p className="text-2xl font-semibold">{scoreLabel}</p>
                <p className="text-2xl font-semibold text-right">
                  {rankValue}
                </p>
              </div>
              {analysis && analysis.keyChanges.length > 0 && analysis.scoreDelta !== 0 ? (
                <p className="mt-1 text-xs text-emerald-300">
                  Bonus {analysis.scoreDelta > 0 ? '+' : ''}
                  {analysis.scoreDelta}
                </p>
              ) : null}
              <hr className="my-2 border-t border-border" />
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Accuracy
              </p>
              <p className="mt-2 text-xl font-semibold">
                {accuracyLabel}
              </p>
              <div className="mt-3 overflow-hidden rounded-md border border-border/60">
                <div
                  className={cn(
                    'grid gap-3 bg-muted/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground',
                    hasPartialQuestions
                      ? 'grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,88px))]'
                      : 'grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,88px))]',
                  )}
                >
                  <span>Type</span>
                  <span className="text-right">Correct</span>
                  {hasPartialQuestions ? (
                    <span className="text-right">Partial</span>
                  ) : null}
                  <span className="text-right">Incorrect</span>
                  <span className="text-right">Unattempted</span>
                </div>
                <div className="divide-y divide-border/60">
                  {questionTypes.map((type) => {
                    const stats = overallTypeStats[type] ?? {
                      correct: 0,
                      partial: 0,
                      incorrect: 0,
                      unattempted: 0,
                    };
                    const total =
                      stats.correct + stats.partial + stats.incorrect + stats.unattempted;
                    if (total === 0) {
                      return null;
                    }
                    return (
                      <div
                        key={type}
                        className={cn(
                          'grid gap-3 px-3 py-2 text-[11px] text-muted-foreground',
                          hasPartialQuestions
                            ? 'grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,88px))]'
                            : 'grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,88px))]',
                        )}
                      >
                        <span className="text-foreground/90">
                          {formatQuestionType(type)}
                        </span>
                        <span className="text-right text-emerald-400">
                          {stats.correct}
                        </span>
                        {hasPartialQuestions ? (
                          <span className="text-right text-amber-400">
                            {stats.partial}
                          </span>
                        ) : null}
                        <span className="text-right text-rose-400">
                          {stats.incorrect}
                        </span>
                        <span className="text-right text-muted-foreground">
                          {stats.unattempted}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Attempted</span>
                <span>
                  {analysis ? `${analysis.attempted}/${analysis.total}` : "n/a"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-foreground/80">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {analysis ? `${analysis.correct} correct` : "n/a"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  {analysis ? `${analysis.incorrect} incorrect` : "n/a"}
                </span>
              </div>
              <SegmentedProgressBar
                className="h-2.5"
                segments={totalSegments}
              />
            </div>
          </div>
          <div
            className="grid gap-3 md:grid-cols-1"
          >
            {subjectSummary.map((subject) => (
              <div
                key={subject.label}
                className="rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {subject.label}
                  </span>
                  <span>
                    {subject.score}/{subject.total}
                  </span>
                </div>
                <SegmentedProgressBar
                  className="mt-2"
                  segments={buildSegments(
                    subject.correct,
                    subject.partial,
                    subject.incorrect,
                    subject.unattempted
                  )}
                />
                <div className="mt-2 overflow-hidden rounded-md border border-border/60">
                  <div
                    className={cn(
                      'grid gap-3 bg-muted/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground',
                      hasPartialQuestions
                        ? 'grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,88px))]'
                        : 'grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,88px))]',
                    )}
                  >
                    <span>Type</span>
                    <span className="text-right">Correct</span>
                    {hasPartialQuestions ? (
                      <span className="text-right">Partial</span>
                    ) : null}
                    <span className="text-right">Incorrect</span>
                    <span className="text-right">Unattempted</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {questionTypes.map((type) => {
                      const stats = subject.typeStats?.[type] ?? {
                        correct: 0,
                        partial: 0,
                        incorrect: 0,
                        unattempted: 0,
                      };
                      const total =
                        stats.correct + stats.partial + stats.incorrect + stats.unattempted;
                      if (total === 0) {
                        return null;
                      }
                      return (
                        <div
                          key={type}
                          className={cn(
                            'grid gap-3 px-3 py-2 text-[11px] text-muted-foreground',
                            hasPartialQuestions
                              ? 'grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,88px))]'
                              : 'grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,88px))]',
                          )}
                        >
                          <span className="text-foreground/90">
                            {formatQuestionType(type)}
                          </span>
                          <span className="text-right text-emerald-400">
                            {stats.correct}
                          </span>
                          {hasPartialQuestions ? (
                            <span className="text-right text-amber-400">
                              {stats.partial}
                            </span>
                          ) : null}
                          <span className="text-right text-rose-400">
                            {stats.incorrect}
                          </span>
                          <span className="text-right text-muted-foreground">
                            {stats.unattempted}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {actionContent}
        </div>
      </CardContent>
    </Card>
  );
};
