import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buildAnalysis } from "@/lib/analysis";
import { buildDisplayQuestions } from "@/lib/questionDisplay";
import { useAppStore } from "@/lib/store";
import { collectKnownTags, matchesTagFilter } from "@/lib/tags";
import { TestSummaryCard } from "@/components/TestSummaryCard";
import { TagInput } from "@/components/TagInput";
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

type SortOption = "date-desc" | "date-asc" | "bookmarks-desc" | "bookmarks-asc";

export const Bookmarks = () => {
  const { state } = useAppStore();
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("date-desc");

  const availableTags = useMemo(() => collectKnownTags(state.tests), [state.tests]);
  const analysisMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildAnalysis>>();
    state.tests.forEach((test) => {
      map.set(test.id, buildAnalysis(test));
    });
    return map;
  }, [state.tests]);

  const bookmarkGroups = useMemo(
    () =>
      state.tests
        .map((test) => {
          const bookmarkedQuestions = buildDisplayQuestions(test.questions)
            .filter(({ question }) => Boolean(test.bookmarks?.[question.id]))
            .map(({ question, displayNumber }) => ({
              id: question.id,
              displayNumber,
              subject: question.subject,
              tags: question.tags,
              lockedTags: question.lockedTags,
            }));

          return { test, bookmarkedQuestions };
        })
        .filter((group) => group.bookmarkedQuestions.length > 0),
    [state.tests],
  );

  const visibleGroups = useMemo(() => {
    const queryValue = query.trim().toLowerCase();
    const filtered = bookmarkGroups
      .filter(({ test }) =>
        queryValue.length === 0 || test.title.toLowerCase().includes(queryValue),
      )
      .map((group) => ({
        ...group,
        bookmarkedQuestions: group.bookmarkedQuestions.filter((item) =>
          matchesTagFilter(item, group.test.title, selectedTags),
        ),
      }))
      .filter((group) => group.bookmarkedQuestions.length > 0);

    return [...filtered].sort((a, b) => {
      if (sort === "date-asc") {
        return new Date(a.test.examDate).getTime() - new Date(b.test.examDate).getTime();
      }
      if (sort === "bookmarks-desc") {
        return b.bookmarkedQuestions.length - a.bookmarkedQuestions.length;
      }
      if (sort === "bookmarks-asc") {
        return a.bookmarkedQuestions.length - b.bookmarkedQuestions.length;
      }
      return new Date(b.test.examDate).getTime() - new Date(a.test.examDate).getTime();
    });
  }, [bookmarkGroups, query, selectedTags, sort]);

  const totalBookmarks = useMemo(
    () =>
      bookmarkGroups.reduce(
        (count, group) => count + group.bookmarkedQuestions.length,
        0,
      ),
    [bookmarkGroups],
  );

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
              Filter, sort, and jump back into bookmarked questions by test.
            </p>
          </div>
          <div className="rounded-full border border-border/60 bg-background px-4 py-2 text-sm text-muted-foreground">
            {totalBookmarks} bookmarks
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <Card className="app-panel">
            <CardContent className="space-y-4 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Filters
              </p>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Search</label>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by test name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Tags</label>
                <TagInput
                  value={selectedTags}
                  suggestions={availableTags}
                  onChange={setSelectedTags}
                  allowCustom={false}
                  placeholder="Filter by existing tags"
                  emptyMessage="No matching tags"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Sort by</label>
                <Select value={sort} onValueChange={(value) => setSort(value as SortOption)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-desc">Newest first</SelectItem>
                    <SelectItem value="date-asc">Oldest first</SelectItem>
                    <SelectItem value="bookmarks-desc">Most bookmarks</SelectItem>
                    <SelectItem value="bookmarks-asc">Fewest bookmarks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {visibleGroups.map(({ test, bookmarkedQuestions }) => (
              <TestSummaryCard
                key={test.id}
                test={test}
                analysis={analysisMap.get(test.id)}
                reviewAction={
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/app/questions/${test.id}/${bookmarkedQuestions[0].id}?bookmarks=1`}>
                      View bookmarks
                    </Link>
                  </Button>
                }
                collapsedAction={
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/app/questions/${test.id}/${bookmarkedQuestions[0].id}?bookmarks=1`}>
                      {bookmarkedQuestions.length} saved
                    </Link>
                  </Button>
                }
                actions={
                  <>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/app/tests/${test.id}`}>Open review</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link to={`/app/questions/${test.id}/${bookmarkedQuestions[0].id}?bookmarks=1`}>
                        View bookmarks
                      </Link>
                    </Button>
                  </>
                }
              />
            ))}

            {bookmarkGroups.length === 0 ? (
              <Card className="app-panel">
                <CardContent className="space-y-2 p-6">
                  <p className="text-sm text-muted-foreground">
                    No bookmarked questions yet.
                  </p>
                  <Button asChild variant="outline">
                    <Link to="/app/tests">Open tests</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {bookmarkGroups.length > 0 && visibleGroups.length === 0 ? (
              <Card className="app-panel">
                <CardContent className="space-y-2 p-6">
                  <p className="text-sm text-muted-foreground">
                    No bookmarked tests match the current filters.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setSelectedTags([]);
                    }}
                  >
                    Clear filters
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
};
