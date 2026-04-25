import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";

type Leaderboard = {
  id: string;
  title: string;
  description: string | null;
  examIds: string;
  createdAt: string;
};
export const LeaderboardsList = () => {
  const {
    state,
    isAdmin,
    fetchLeaderboards,
    createLeaderboard,
    updateCustomLeaderboard,
    deleteCustomLeaderboard,
    showComparison,
  } = useAppStore();
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filter state
  const [query, setQuery] = useState("");

  // Dialog state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());

  const loadLeaderboards = async () => {
    const result = await fetchLeaderboards();
    if (result.ok) {
      setLeaderboards(result.leaderboards);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (showComparison) {
      loadLeaderboards();
    }
  }, [showComparison]);

  const visibleLeaderboards = useMemo(() => {
    return leaderboards.filter((lb) => {
      const inQuery =
        query.trim().length === 0 ||
        lb.title.toLowerCase().includes(query.trim().toLowerCase()) ||
        (lb.description?.toLowerCase().includes(query.trim().toLowerCase()) ?? false);
      return inQuery;
    });
  }, [leaderboards, query]);

  if (!showComparison) {
    return (
      <div className="flex h-[50vh] items-center justify-center p-8 text-center text-muted-foreground">
        Comparison features are disabled in your preferences.
      </div>
    );
  }

  if (loading) {
    return <div className="p-4">Loading leaderboards...</div>;
  }

  const handleOpenCreate = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setSelectedTests(new Set());
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (lb: Leaderboard) => {
    setEditingId(lb.id);
    setTitle(lb.title);
    setDescription(lb.description || "");
    try {
      const ids = JSON.parse(lb.examIds) as string[];
      setSelectedTests(new Set(ids));
    } catch {
      setSelectedTests(new Set());
    }
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this leaderboard?")) return;
    const result = await deleteCustomLeaderboard(id);
    if (result.ok) {
      loadLeaderboards();
    } else {
      alert(result.message || "Failed to delete leaderboard");
    }
  };

  const handleSubmit = async () => {
    if (!title || selectedTests.size === 0) return;
    
    let result;
    if (editingId) {
      result = await updateCustomLeaderboard(editingId, {
        title,
        description,
        examIds: Array.from(selectedTests),
      });
    } else {
      result = await createLeaderboard({
        title,
        description,
        examIds: Array.from(selectedTests),
      });
    }

    if (result.ok) {
      setIsDialogOpen(false);
      loadLeaderboards();
    } else {
      alert(result.message || "Failed to save leaderboard");
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
            <Button size="lg" onClick={handleOpenCreate}>Create Leaderboard</Button>
          )}
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Leaderboard" : "Create New Leaderboard"}</DialogTitle>
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
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What tests are included?"
                  rows={3}
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
                onClick={handleSubmit}
                disabled={!title || selectedTests.size === 0}
                className="w-full"
              >
                {editingId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
                  placeholder="Search by title or description"
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {visibleLeaderboards.map((lb) => (
              <Card key={lb.id} className="app-panel">
                <CardContent className="flex flex-row items-center justify-between p-6">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-lg font-semibold text-foreground truncate">
                      <Link
                        to={`/app/leaderboards/${lb.id}`}
                        className="hover:underline"
                      >
                        {lb.title}
                      </Link>
                    </p>
                    {lb.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {lb.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created on {new Date(lb.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(lb)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(lb.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button variant="outline" asChild>
                      <Link to={`/app/leaderboards/${lb.id}`}>View Ranking</Link>
                    </Button>
                  </div>
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
