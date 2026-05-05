import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import {
  ArrowBigDown,
  ArrowBigUp,
  ClipboardPaste,
  Copy,
  ImagePlus,
  Loader2,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import { toBlob } from "html-to-image";

import { MarkdownRenderer } from "@/components/MarkdownRenderer";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/store";
import { typesetMathInElement } from "@/lib/mathJax";

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read the image."));
    reader.readAsDataURL(file);
  });

const insertTextAtSelection = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  text: string,
) => ({
  value: `${value.slice(0, selectionStart)}${text}${value.slice(selectionEnd)}`,
  cursor: selectionStart + text.length,
});

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  return parsed.toLocaleString();
};

type EditorResult = {
  ok: boolean;
  message?: string;
};

type CommunityMarkdownEditorProps = {
  defaultValue?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
  onSubmit: (contentMarkdown: string) => Promise<EditorResult>;
  placeholder: string;
  questionId: string;
  submitLabel: string;
  testId: string;
};

const CommunityMarkdownEditor = ({
  defaultValue = "",
  onCancel,
  onSuccess,
  onSubmit,
  placeholder,
  questionId,
  submitLabel,
  testId,
}: CommunityMarkdownEditorProps) => {
  const { discardTemporaryCommunityImages, uploadTemporaryCommunityImage } =
    useAppStore();
  const [draft, setDraft] = useState(defaultValue);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("write");
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempImageUrls, setTempImageUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const tempImageUrlsRef = useRef<string[]>([]);
  const shouldCleanupOnUnmountRef = useRef(true);

  const discardTemporaryImages = useCallback(async (urls: string[]) => {
    await discardTemporaryCommunityImages({
      testId,
      questionId,
      urls,
    });
  }, [discardTemporaryCommunityImages, questionId, testId]);

  useEffect(() => {
    queueMicrotask(() => {
      setDraft(defaultValue);
      setMessage(null);
      setActiveTab("write");
    });
  }, [defaultValue]);

  useEffect(() => {
    tempImageUrlsRef.current = tempImageUrls;
  }, [tempImageUrls]);

  useEffect(() => {
    return () => {
      if (!shouldCleanupOnUnmountRef.current) {
        return;
      }
      const urls = tempImageUrlsRef.current;
      if (urls.length === 0) {
        return;
      }
      void discardTemporaryImages(urls);
    };
  }, [discardTemporaryImages]); // Only run on unmount

  const cleanupTemporaryImages = async () => {
    const pending = tempImageUrlsRef.current;
    if (pending.length === 0) {
      return;
    }
    tempImageUrlsRef.current = [];
    setTempImageUrls([]);
    await discardTemporaryImages(pending);
  };

  const handleCancel = async () => {
    await cleanupTemporaryImages();
    setDraft(defaultValue);
    setMessage(null);
    onCancel?.();
  };

  const uploadImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setMessage("Only image files can be uploaded.");
      return;
    }

    setIsUploadingImages(true);

    const textarea = textareaRef.current;
    let nextValue = textarea?.value ?? draft;
    let cursor = textarea?.selectionStart ?? nextValue.length;

    try {
      for (const file of imageFiles) {
        const dataUrl = await fileToDataUrl(file);
        const result = await uploadTemporaryCommunityImage({
          testId,
          questionId,
          dataUrl,
        });

        const imageUrl = result.url;
        if (!result.ok || !imageUrl) {
          setMessage(result.message ?? "Unable to upload image.");
          return;
        }

        const altText = file.name.replace(/\.[a-z0-9]+$/i, "").trim() || "image";
        const insertion = insertTextAtSelection(
          nextValue,
          cursor,
          cursor,
          `\n\n![${altText}](${imageUrl})\n\n`,
        );
        nextValue = insertion.value;
        cursor = insertion.cursor;
        setTempImageUrls((current) =>
          current.includes(imageUrl) ? current : [...current, imageUrl],
        );
      }

      setDraft(nextValue);
      setMessage(null);

      window.requestAnimationFrame(() => {
        const target = textareaRef.current;
        if (!target) {
          return;
        }
        target.focus();
        target.selectionStart = cursor;
        target.selectionEnd = cursor;
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to upload image.",
      );
    } finally {
      setIsUploadingImages(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleTextareaPaste = async (
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((item): item is File => Boolean(item));

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    setIsUploadingImages(true);

    const textarea = event.currentTarget;
    let nextValue = textarea.value;
    let cursor = textarea.selectionStart ?? nextValue.length;

    try {
      for (const file of imageFiles) {
        const dataUrl = await fileToDataUrl(file);
        const result = await uploadTemporaryCommunityImage({
          testId,
          questionId,
          dataUrl,
        });

        const imageUrl = result.url;
        if (!result.ok || !imageUrl) {
          setMessage(result.message ?? "Unable to upload pasted image.");
          return;
        }

        const altText = file.name.replace(/\.[a-z0-9]+$/i, "").trim() || "image";
        const insertion = insertTextAtSelection(
          nextValue,
          cursor,
          cursor,
          `\n\n![${altText}](${imageUrl})\n\n`,
        );
        nextValue = insertion.value;
        cursor = insertion.cursor;
        setTempImageUrls((current) =>
          current.includes(imageUrl) ? current : [...current, imageUrl],
        );
      }

      setDraft(nextValue);
      setMessage(null);

      window.requestAnimationFrame(() => {
        const target = textareaRef.current;
        if (!target) {
          return;
        }
        target.focus();
        target.selectionStart = cursor;
        target.selectionEnd = cursor;
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to upload pasted image.",
      );
    } finally {
      setIsUploadingImages(false);
    }
  };

  const handlePasteButton = async () => {
    if (!navigator.clipboard?.read) {
      setMessage("Clipboard image paste is not supported in this browser.");
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];

      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) {
          continue;
        }
        const blob = await item.getType(imageType);
        files.push(
          new File(
            [blob],
            `clipboard-image.${imageType.split("/")[1] ?? "png"}`,
            { type: imageType },
          ),
        );
      }

      if (files.length === 0) {
        setMessage("No image was found on the clipboard.");
        return;
      }

      await uploadImageFiles(files);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to paste image from clipboard.",
      );
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "m") {
      event.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      const { selectionStart, selectionEnd, value: currentValue } = textarea;
      const selectedText = currentValue.slice(selectionStart, selectionEnd);

      let newValue: string;
      let newCursorPos: number;

      if (selectionStart !== selectionEnd) {
        // Wrap selected text
        newValue =
          currentValue.slice(0, selectionStart) +
          "$" +
          selectedText +
          "$" +
          currentValue.slice(selectionEnd);
        newCursorPos = selectionEnd + 1; // Put cursor after the closing $
      } else {
        // Insert $$ and move cursor to middle
        newValue =
          currentValue.slice(0, selectionStart) +
          "$$" +
          currentValue.slice(selectionEnd);
        newCursorPos = selectionStart + 1;
      }

      setDraft(newValue);

      window.requestAnimationFrame(() => {
        const target = textareaRef.current;
        if (!target) {
          return;
        }
        target.focus();
        target.selectionStart = newCursorPos;
        target.selectionEnd = newCursorPos;
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) =>
            void uploadImageFiles(Array.from(event.target.files ?? []))
          }
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploadingImages || isSubmitting}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploadingImages ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-2 h-4 w-4" />
          )}
          Upload image
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploadingImages || isSubmitting}
          onClick={() => void handlePasteButton()}
        >
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Paste image
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview" disabled={isUploadingImages}>
            Preview
          </TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="mt-0">
          <Textarea
            ref={textareaRef}
            value={draft}
            disabled={isSubmitting}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(event) => void handleTextareaPaste(event)}
            placeholder={placeholder}
            className="min-h-[180px] resize-y"
          />
        </TabsContent>
        <TabsContent value="preview" className="mt-0">
          <div className="min-h-[180px] rounded-xl border border-border/60 bg-muted/20 p-4">
            {draft.trim() ? (
              <MarkdownRenderer
                markdown={draft}
                className="space-y-3 text-sm leading-7 text-foreground"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing to preview yet.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={isSubmitting || isUploadingImages}
          onClick={async () => {
            setIsSubmitting(true);
            const result = await onSubmit(draft);
            setIsSubmitting(false);
            setMessage(result.ok ? null : result.message ?? "Unable to save.");
            if (!result.ok) {
              shouldCleanupOnUnmountRef.current = true;
              return;
            }
            shouldCleanupOnUnmountRef.current = false;
            tempImageUrlsRef.current = [];
            setTempImageUrls([]);
            onSuccess?.();
          }}
        >
          {isUploadingImages ? "Uploading image..." : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={() => void handleCancel()}>
            Cancel
          </Button>
        ) : null}
      </div>

      {message ? (
        <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
          {message}
        </div>
      ) : null}
{/* 
      {tempImageUrls.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Uploaded images
          </p>
          <div className="flex flex-wrap gap-3">
            {tempImageUrls.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="h-24 w-auto rounded-lg border border-border/60 bg-background object-contain"
              />
            ))}
          </div>
        </div>
      ) : null} */}
    </div>
  );
};

type QuestionCommunitySectionProps = {
  enabled: boolean;
  questionId: string;
  testId: string;
};

export const QuestionCommunitySection = ({
  enabled,
  questionId,
  testId,
}: QuestionCommunitySectionProps) => {
  const {
    currentUser,
    createQuestionCommunityComment,
    createQuestionCommunitySolution,
    deleteQuestionCommunityComment,
    deleteQuestionCommunitySolution,
    fetchQuestionCommunity,
    pinQuestionCommunitySolution,
    questionCommunityByQuestionId,
    updateQuestionCommunityComment,
    updateQuestionCommunitySolution,
    voteQuestionCommunitySolution,
    state,
  } = useAppStore();
  const thread = questionCommunityByQuestionId[questionId];
  const mode = currentUser?.preferences.mode ?? state.ui.mode;
  const [activeSolutionId, setActiveSolutionId] = useState<string | null>(null);
  const [editorSolutionId, setEditorSolutionId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [replyingSolutionId, setReplyingSolutionId] = useState<string | null>(null);
  const activeSolutionRef = useRef<HTMLDivElement | null>(null);

  const handleCopySolutionImage = async (node: HTMLElement | null) => {
    if (!node) return;

    setIsCopying(true);
    setMessage(null);

    const unwanted = node.querySelectorAll(
      ".hide-in-copy",
    ) as NodeListOf<HTMLElement>;
    const styleTag = document.createElement("style");

    try {
      await typesetMathInElement(node);

      // Hide broken images that cause capture to fail
      const images = node.querySelectorAll("img");
      images.forEach((img) => {
        if (img.complete && img.naturalWidth === 0) {
          img.style.display = "none";
          img.dataset.hiddenByCapture = "true";
        }
      });

      unwanted.forEach((el) => {
        el.dataset.capturePrevDisplay = el.style.display;
        el.style.display = "none";
      });

      const textColor = mode === "dark" ? "#f3f4f6" : "#111827";
      const bgColor = mode === "dark" ? "#0a0a0a" : "#ffffff";

      styleTag.innerHTML = `
        mjx-container { color: ${textColor} !important; }
        .markdown-body, .markdown-body *, .question-html, .question-html * { color: ${textColor} !important; }
        svg { fill: currentColor !important; }
      `;
      node.appendChild(styleTag);

      const paddingX = 32;
      const paddingY = 32;
      const width = node.clientWidth + paddingX * 2;
      const height = node.scrollHeight + paddingY * 2;

      const blob = await toBlob(node, {
        backgroundColor: bgColor,
        pixelRatio: 2,
        width,
        height,
        style: {
          zoom: "1",
          padding: `${paddingY}px ${paddingX}px`,
          margin: "0",
          color: textColor,
          backgroundColor: bgColor,
        },
        fontEmbedCSS: "",
        filter: (domNode: Node) => {
          if (domNode.nodeType !== 1) return true;
          const el = domNode as HTMLElement;
          if (el.classList?.contains("hide-in-copy")) return false;
          return true;
        },
      });

      if (blob) {
        const data = [new window.ClipboardItem({ "image/png": blob })];
        await navigator.clipboard.write(data);
        setMessage("Solution image copied to clipboard.");
      }
    } catch (error) {
      console.error("Copy failed", error);
      setMessage("Unable to copy solution image.");
    } finally {
      if (styleTag.parentNode) {
        node.removeChild(styleTag);
      }
      unwanted.forEach((el) => {
        el.style.display = el.dataset.capturePrevDisplay ?? "";
        delete el.dataset.capturePrevDisplay;
      });
      const images = node.querySelectorAll("img");
      images.forEach((img) => {
        if (img.dataset.hiddenByCapture) {
          img.style.display = "";
          delete img.dataset.hiddenByCapture;
        }
      });
      setIsCopying(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setIsLoading(true);
      }
    });

    void (async () => {
      const result = await fetchQuestionCommunity({ testId, questionId });
      if (cancelled) {
        return;
      }

      setIsLoading(false);
      setMessage(
        result.ok ? null : result.message ?? "Unable to load community solutions.",
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, fetchQuestionCommunity, questionId, testId]);

  const ownSolution = useMemo(
    () =>
      thread?.solutions.find((solution) => solution.author.id === currentUser?.id) ??
      null,
    [currentUser?.id, thread?.solutions],
  );

  const activeSolution = useMemo(
    () =>
      activeSolutionId
        ? thread?.solutions.find((solution) => solution.id === activeSolutionId) ?? null
        : null,
    [activeSolutionId, thread?.solutions],
  );

  const editorSolution = useMemo(
    () =>
      editorSolutionId
        ? thread?.solutions.find((solution) => solution.id === editorSolutionId) ?? null
        : null,
    [editorSolutionId, thread?.solutions],
  );

  useEffect(() => {
    queueMicrotask(() => {
      setEditingCommentId(null);
      setReplyingSolutionId(null);
    });
  }, [activeSolutionId]);

  useEffect(() => {
    if (activeSolutionId && !activeSolution) {
      queueMicrotask(() => {
        setActiveSolutionId(null);
      });
    }
  }, [activeSolution, activeSolutionId]);

  if (!enabled) {
    return null;
  }

  const openCreateDialog = () => {
    setEditorSolutionId(null);
    setIsEditorOpen(true);
  };

  const openEditDialog = (solutionId: string) => {
    setActiveSolutionId(null);
    setEditorSolutionId(solutionId);
    setIsEditorOpen(true);
  };

  const closeEditorDialog = () => {
    setIsEditorOpen(false);
    setEditorSolutionId(null);
  };

  return (
    <section
      id="question-community-solutions"
      className="hide-in-no-answer-copy space-y-4 rounded-xl border border-border/60 bg-background/70 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Community Solutions
          </p>
          <p className="text-sm text-muted-foreground">
            {thread?.solutionCount ?? 0} solution
            {(thread?.solutionCount ?? 0) === 1 ? "" : "s"} for this question
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ownSolution ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEditDialog(ownSolution.id)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit your solution
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add solution
            </Button>
          )}
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
          {message}
        </div>
      ) : null}

      {isLoading && !thread ? (
        <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
          Loading community solutions...
        </div>
      ) : null}

      {!isLoading && thread && thread.solutions.length === 0 ? (
        <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
          No community solutions yet.
        </div>
      ) : null}

      <div className="space-y-4">
        {thread?.solutions.map((solution) => (
          <Card
            key={solution.id}
            className="solution-card border-border/60 transition-colors hover:border-foreground/30"
          >
            <button
              type="button"
              className="block w-full text-left"
              onClick={() => setActiveSolutionId(solution.id)}
            >
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="hide-in-copy space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {solution.author.name}
                      </p>
                      {solution.author.id === currentUser?.id ? (
                        <Badge variant="secondary">You</Badge>
                      ) : null}
                      {solution.pinnedAt ? (
                        <Badge variant="outline" className="gap-1">
                          <Pin className="h-3.5 w-3.5" />
                          Pinned
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Updated {formatDateTime(solution.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={
                        solution.currentUserVote === 1 ? "default" : "outline"
                      }
                      size="sm"
                      className="hide-in-copy"
                      onClick={async (event) => {
                        event.stopPropagation();
                        const result = await voteQuestionCommunitySolution({
                          testId,
                          questionId,
                          solutionId: solution.id,
                          value: 1,
                        });
                        if (!result.ok) {
                          setMessage(result.message ?? "Unable to vote.");
                        }
                      }}
                    >
                      <ArrowBigUp className="mr-1 h-4 w-4" />
                      {solution.upvoteCount}
                    </Button>
                    <Button
                      type="button"
                      variant={
                        solution.currentUserVote === -1 ? "default" : "outline"
                      }
                      size="sm"
                      className="hide-in-copy"
                      onClick={async (event) => {
                        event.stopPropagation();
                        const result = await voteQuestionCommunitySolution({
                          testId,
                          questionId,
                          solutionId: solution.id,
                          value: -1,
                        });
                        if (!result.ok) {
                          setMessage(result.message ?? "Unable to vote.");
                        }
                      }}
                    >
                      <ArrowBigDown className="mr-1 h-4 w-4" />
                      {solution.downvoteCount}
                    </Button>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-foreground hide-in-copy">
                      Score {solution.score}
                    </span>
                    <Badge variant="outline" className="hide-in-copy">
                      {solution.comments.length} comment
                      {solution.comments.length === 1 ? "" : "s"}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isCopying}
                      className="hide-in-copy"
                      title="Copy solution as image"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCopySolutionImage(
                          event.currentTarget.closest(".solution-card"),
                        );
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {solution.canPin ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="hide-in-copy"
                        onClick={async (event) => {
                          event.stopPropagation();
                          const result = await pinQuestionCommunitySolution({
                            testId,
                            questionId,
                            solutionId: solution.id,
                            pinned: solution.pinnedAt === null,
                          });
                          if (!result.ok) {
                            setMessage(
                              result.message ?? "Unable to update pin.",
                            );
                          }
                        }}
                      >
                        <Pin className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {solution.canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="hide-in-copy"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditDialog(solution.id);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {solution.canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="hide-in-copy"
                        onClick={async (event) => {
                          event.stopPropagation();
                          if (!window.confirm("Delete this solution?")) {
                            return;
                          }
                          const result = await deleteQuestionCommunitySolution({
                            testId,
                            questionId,
                            solutionId: solution.id,
                          });
                          if (!result.ok) {
                            setMessage(
                              result.message ?? "Unable to delete solution.",
                            );
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <MarkdownRenderer
                    markdown={solution.contentMarkdown}
                    className="space-y-3 text-sm leading-7 text-foreground"
                  />
                </div>
              </CardContent>
            </button>
          </Card>
        ))}
      </div>

      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => (!open ? closeEditorDialog() : setIsEditorOpen(true))}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editorSolution ? "Edit your solution" : "Add your solution"}
            </DialogTitle>
            <DialogDescription>
              Use markdown, uploads, or paste images directly into the editor.
            </DialogDescription>
          </DialogHeader>
          <CommunityMarkdownEditor
            key={
              editorSolution
                ? `${editorSolution.id}-${editorSolution.updatedAt}`
                : "create-solution"
            }
            defaultValue={editorSolution?.contentMarkdown ?? ""}
            testId={testId}
            questionId={questionId}
            submitLabel={editorSolution ? "Save changes" : "Post solution"}
            placeholder="Explain your approach, add images, and use markdown."
            onCancel={closeEditorDialog}
            onSuccess={closeEditorDialog}
            onSubmit={(contentMarkdown) =>
              editorSolution
                ? updateQuestionCommunitySolution({
                    testId,
                    questionId,
                    solutionId: editorSolution.id,
                    contentMarkdown,
                  })
                : createQuestionCommunitySolution({
                    testId,
                    questionId,
                    contentMarkdown,
                  })
            }
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeSolutionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveSolutionId(null);
          }
        }}
      >
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden">
          {activeSolution ? (
            <>
              <DialogHeader>
                <DialogTitle>Community Solution</DialogTitle>
                <DialogDescription>
                  View the full solution, votes, and discussion for this question.
                </DialogDescription>
              </DialogHeader>

              <div
                ref={activeSolutionRef}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="hide-in-copy space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">
                        {activeSolution.author.name}
                      </p>
                      {activeSolution.author.id === currentUser?.id ? (
                        <Badge variant="secondary">You</Badge>
                      ) : null}
                      {activeSolution.pinnedAt ? (
                        <Badge variant="outline" className="gap-1">
                          <Pin className="h-3.5 w-3.5" />
                          Pinned
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDateTime(activeSolution.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Updated {formatDateTime(activeSolution.updatedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={
                        activeSolution.currentUserVote === 1
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className="hide-in-copy"
                      onClick={async () => {
                        const result = await voteQuestionCommunitySolution({
                          testId,
                          questionId,
                          solutionId: activeSolution.id,
                          value: 1,
                        });
                        if (!result.ok) {
                          setMessage(result.message ?? "Unable to vote.");
                        }
                      }}
                    >
                      <ArrowBigUp className="mr-1 h-4 w-4" />
                      {activeSolution.upvoteCount}
                    </Button>
                    <Button
                      type="button"
                      variant={
                        activeSolution.currentUserVote === -1
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className="hide-in-copy"
                      onClick={async () => {
                        const result = await voteQuestionCommunitySolution({
                          testId,
                          questionId,
                          solutionId: activeSolution.id,
                          value: -1,
                        });
                        if (!result.ok) {
                          setMessage(result.message ?? "Unable to vote.");
                        }
                      }}
                    >
                      <ArrowBigDown className="mr-1 h-4 w-4" />
                      {activeSolution.downvoteCount}
                    </Button>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-xs font-semibold text-foreground hide-in-copy">
                      Score {activeSolution.score}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isCopying}
                      className="hide-in-copy"
                      title="Copy solution as image"
                      onClick={() =>
                        handleCopySolutionImage(activeSolutionRef.current)
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {activeSolution.canPin ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="hide-in-copy"
                        onClick={async () => {
                          const result = await pinQuestionCommunitySolution({
                            testId,
                            questionId,
                            solutionId: activeSolution.id,
                            pinned: activeSolution.pinnedAt === null,
                          });
                          if (!result.ok) {
                            setMessage(
                              result.message ?? "Unable to update pin.",
                            );
                          }
                        }}
                      >
                        <Pin className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {activeSolution.canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="hide-in-copy"
                        onClick={() => openEditDialog(activeSolution.id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {activeSolution.canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="hide-in-copy"
                        onClick={async () => {
                          if (!window.confirm("Delete this solution?")) {
                            return;
                          }
                          const result = await deleteQuestionCommunitySolution({
                            testId,
                            questionId,
                            solutionId: activeSolution.id,
                          });
                          if (!result.ok) {
                            setMessage(
                              result.message ?? "Unable to delete solution.",
                            );
                            return;
                          }
                          setActiveSolutionId(null);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <MarkdownRenderer
                    markdown={activeSolution.contentMarkdown}
                    className="space-y-3 text-sm leading-7 text-foreground"
                  />
                </div>

                <div className="space-y-4 rounded-xl border border-border/60 bg-background p-4 hide-in-copy">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Comments
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {activeSolution.comments.length} comment
                        {activeSolution.comments.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setReplyingSolutionId((current) =>
                          current === activeSolution.id ? null : activeSolution.id,
                        )
                      }
                    >
                      {replyingSolutionId === activeSolution.id
                        ? "Hide comment form"
                        : "Add comment"}
                    </Button>
                  </div>

                  {activeSolution.comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No comments yet.
                    </p>
                  ) : null}

                  <div className="space-y-3">
                    {activeSolution.comments.map((comment) => {
                      const isEditingComment = editingCommentId === comment.id;
                      return (
                        <div
                          key={comment.id}
                          className="rounded-xl border border-border/60 bg-muted/20 p-3"
                        >
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {comment.author.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(comment.updatedAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {comment.canEdit ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setEditingCommentId((current) =>
                                      current === comment.id ? null : comment.id,
                                    )
                                  }
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              ) : null}
                              {comment.canDelete ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    if (!window.confirm("Delete this comment?")) {
                                      return;
                                    }
                                    const result = await deleteQuestionCommunityComment({
                                      testId,
                                      questionId,
                                      solutionId: activeSolution.id,
                                      commentId: comment.id,
                                    });
                                    if (!result.ok) {
                                      setMessage(
                                        result.message ?? "Unable to delete comment.",
                                      );
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>

                          {isEditingComment ? (
                            <CommunityMarkdownEditor
                              key={`${comment.id}-${comment.updatedAt}`}
                              defaultValue={comment.contentMarkdown}
                              testId={testId}
                              questionId={questionId}
                              submitLabel="Save comment"
                              placeholder="Update your comment."
                              onCancel={() => setEditingCommentId(null)}
                              onSuccess={() => setEditingCommentId(null)}
                              onSubmit={(contentMarkdown) =>
                                updateQuestionCommunityComment({
                                  testId,
                                  questionId,
                                  solutionId: activeSolution.id,
                                  commentId: comment.id,
                                  contentMarkdown,
                                })
                              }
                            />
                          ) : (
                            <MarkdownRenderer
                              markdown={comment.contentMarkdown}
                              className="space-y-3 text-sm leading-7 text-foreground"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {replyingSolutionId === activeSolution.id ? (
                    <div className="rounded-xl border border-border/60 bg-background p-3">
                      <CommunityMarkdownEditor
                        testId={testId}
                        questionId={questionId}
                        submitLabel="Post comment"
                        placeholder="Discuss this solution."
                        onCancel={() => setReplyingSolutionId(null)}
                        onSuccess={() => setReplyingSolutionId(null)}
                        onSubmit={(contentMarkdown) =>
                          createQuestionCommunityComment({
                            testId,
                            questionId,
                            solutionId: activeSolution.id,
                            contentMarkdown,
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
};
