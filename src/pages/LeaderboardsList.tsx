import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Leaderboard = {
  id: string;
  title: string;
  examIds: string;
  createdAt: string;
};

export const LeaderboardsList = () => {
  const { state, isAdmin, fetchLeaderboards, createLeaderboard } = useAppStore();
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Filter state
  const [query, setQuery] = useState("");

  // Dialog state
  const [title, setTitle] = useState("");
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());

  const loadLeaderboards = async () => {
    const result = await fetchLeaderboards();
    if (result.ok) {
      setLeaderboards(result.leaderboards);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadLeaderboards();
  }, []);

  const handleCreate = async () => {
    if (!title || selectedTests.size === 0) return;
    const result = await createLeaderboard({
      title,
      examIds: Array.from(selectedTests),
    });
    if (result.ok) {
      setIsDialogOpen(false);
      setTitle("");
      setSelectedTests(new Set());
      loadLeaderboards();
    } else {
      alert(result.message || "Failed to create leaderboard");
    }
  };

  const toggleTest = (id: string) => {
    const next = new Set(selectedTests);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTests(next);
  };

  const visibleLeaderboards = useMemo(() => {
    return leaderboards.filter((lb) => {
      const inQuery =
        query.trim().length === 0 ||
        lb.title.toLowerCase().includes(query.trim().toLowerCase());
      return inQuery;
    });
  }, [leaderboards, query]);

  if (loading) {
    return <div className="p-4">Loading leaderboards...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="app-surface space-y-6 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Leaderboards
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Custom Leaderboards</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Aggregate results from multiple tests into a single ranked list.
            </p>
          </div>
          {isAdmin && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg">Create Leaderboard</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Leaderboard</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter leaderboard title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Select Tests</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 border rounded-md">
                      {state.tests.map((test) => (
                        <div
                          key={test.examId}
                          className="flex items-center space-x-2"
                        >
                          <input
                            type="checkbox"
                            id={test.examId}
                            checked={selectedTests.has(test.examId)}
                            onChange={() => toggleTest(test.examId)}
                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                          />
                          <Label
                            htmlFor={test.examId}
                            className="text-sm font-medium truncate"
                          >
                            {test.title}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={handleCreate}
                    disabled={!title || selectedTests.size === 0}
                    className="w-full"
                  >
                    Create
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
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
                  placeholder="Search by title"
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {visibleLeaderboards.map((lb) => (
              <Card key={lb.id} className="app-panel">
                <CardContent className="flex flex-row items-center justify-between p-6">
                  <div className="flex-1">
                    <p className="text-lg font-semibold text-foreground">
                      <Link
                        to={`/app/leaderboards/${lb.id}`}
                        className="hover:underline"
                      >
                        {lb.title}
                      </Link>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Created on {new Date(lb.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="outline" asChild>
                    <Link to={`/app/leaderboards/${lb.id}`}>View Ranking</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}

            {visibleLeaderboards.length === 0 && (
              <Card className="app-panel">
                <CardContent className="p-8 text-center text-muted-foreground">
                  No custom leaderboards found.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
