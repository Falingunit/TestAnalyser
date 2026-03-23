import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ChevronDown } from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  formatAnswerValue,
  getAnswerForQuestion,
  getQuestionMark,
  getQuestionStatus,
  getTimeForQuestion,
} from "@/lib/analysis";
import { buildDisplayQuestions } from "@/lib/questionDisplay";
import type { QuestionType, Subject, TestRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatQuestionType } from "@/lib/utils";

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

const getStatusVariant = (status: string) => {
  if (status === "Correct") {
    return "secondary";
  }
  if (status === "Incorrect") {
    return "destructive";
  }
  return "outline";
};

type BookmarkedQuestion = {
  id: string;
  displayNumber: number;
  subject: Subject;
  qtype: QuestionType;
  questionContent: string;
  status: string;
  score: number;
  timeSpent: number;
  answer: string;
  correctAnswer: string;
};

type BookmarkGroup = {
  test: TestRecord;
  bookmarkedQuestions: BookmarkedQuestion[];
};

export const Bookmarks = () => {
  const { state, currentUser } = useAppStore();
  const [query, setQuery] = useState("");
  const [collapsedTests, setCollapsedTests] = useState<Record<string, boolean>>({});
  const mode = currentUser?.preferences.mode ?? state.ui.mode;

  const bookmarkGroups = useMemo<BookmarkGroup[]>(
    () =>
      [...state.tests]
        .map((test) => {
          const bookmarkedQuestions = buildDisplayQuestions(test.questions)
            .filter(({ question }) => Boolean(test.bookmarks?.[question.id]))
            .map(({ question, displayNumber }) => ({
              id: question.id,
              displayNumber,
              subject: question.subject,
              qtype: question.qtype,
              questionContent: question.questionContent,
              status: getQuestionStatus(test, question),
              score: getQuestionMark(test, question),
              timeSpent: getTimeForQuestion(test, question),
              answer: formatAnswerValue(getAnswerForQuestion(test, question)),
              correctAnswer: formatAnswerValue(question.keyUpdate),
            }));

          return {
            test,
            bookmarkedQuestions,
          };
        })
        .filter((group) => group.bookmarkedQuestions.length > 0)
        .sort(
          (a, b) =>
            new Date(b.test.examDate).getTime() - new Date(a.test.examDate).getTime(),
        ),
    [state.tests],
  );
  const visibleGroups = useMemo(() => {
    const queryValue = query.trim().toLowerCase();
    if (!queryValue) {
      return bookmarkGroups;
    }
    return bookmarkGroups.filter(({ test }) =>
      test.title.toLowerCase().includes(queryValue),
    );
  }, [bookmarkGroups, query]);

  return (
    <div className="space-y-6">
      <section className="app-surface space-y-6 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Saved review queue
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Bookmarks</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Review bookmarked questions grouped by test.
            </p>
          </div>
          <div className="rounded-full border border-border/60 bg-background px-4 py-2 text-sm text-muted-foreground">
            {bookmarkGroups.reduce(
              (total, group) => total + group.bookmarkedQuestions.length,
              0,
            )}{" "}
            bookmarks
          </div>
        </div>
        <div className="max-w-md space-y-2">
          <label className="text-xs text-muted-foreground">Search tests</label>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by test name"
          />
        </div>

        {bookmarkGroups.length === 0 ? (
          <Card className="app-panel">
            <CardContent className="space-y-3 p-6">
              <p className="text-sm text-muted-foreground">
                No bookmarked questions yet.
              </p>
              <Button asChild variant="outline">
                <Link to="/app/tests">Open tests</Link>
              </Button>
            </CardContent>
          </Card>
        ) : visibleGroups.length === 0 ? (
          <Card className="app-panel">
            <CardContent className="space-y-3 p-6">
              <p className="text-sm text-muted-foreground">
                No bookmarked tests match the current search.
              </p>
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {visibleGroups.map(({ test, bookmarkedQuestions }) => {
              const isCollapsed = collapsedTests[test.id] ?? true;
              return (
              <Card key={test.id} className="app-panel">
                <CardContent className="space-y-5 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {new Date(test.examDate).toLocaleDateString()}
                      </p>
                      <h2 className="text-xl font-semibold text-foreground">
                        {test.title}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {bookmarkedQuestions.length} bookmarked question
                        {bookmarkedQuestions.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          to={`/app/questions/${test.id}/${bookmarkedQuestions[0].id}?bookmarks=1`}
                        >
                          View
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/app/tests/${test.id}`}>Open review</Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setCollapsedTests((prev) => ({
                            ...prev,
                            [test.id]: !isCollapsed,
                          }))
                        }
                        aria-expanded={!isCollapsed}
                      >
                        {isCollapsed ? "Show" : "Hide"}
                        <ChevronDown
                          className={cn(
                            "ml-1 h-4 w-4 transition-transform",
                            isCollapsed && "-rotate-90",
                          )}
                        />
                      </Button>
                    </div>
                  </div>

                  {!isCollapsed ? (
                    <div className="grid gap-3">
                      {bookmarkedQuestions.map((item) => (
                      <Link
                        key={item.id}
                        to={`/app/questions/${test.id}/${item.id}?bookmarks=1`}
                        className="rounded-2xl border border-border/60 bg-background/80 p-4 transition hover:border-sky-500/60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Bookmark
                                className="h-4 w-4 text-sky-500"
                                fill="currentColor"
                              />
                              <p className="text-sm font-semibold text-foreground">
                                Q{item.displayNumber} - {item.subject}
                              </p>
                            </div>
                          </div>
                          <Badge variant={getStatusVariant(item.status)}>
                            {item.status}
                          </Badge>
                        </div>

                        <div
                          className={cn(
                            "question-html mt-4 rounded-lg bg-transparent leading-relaxed text-sm",
                            mode === "dark"
                              ? "question-html--blend-dark"
                              : "question-html--blend-light",
                          )}
                          dangerouslySetInnerHTML={{
                            __html: item.questionContent,
                          }}
                        />

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatQuestionType(item.qtype)}</span>
                          <span>{formatSeconds(item.timeSpent)}</span>
                          <span>Score {item.score}</span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>Answer {item.answer}</span>
                          <span>Correct {item.correctAnswer}</span>
                        </div>
                      </Link>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
