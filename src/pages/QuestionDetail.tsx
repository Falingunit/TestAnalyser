import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Bookmark, ChevronDown, Copy, CopyX, Menu, Pencil, X } from "lucide-react";
import { toBlob } from "html-to-image";
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
import {
  buildDisplayQuestions,
  subjectDisplayOrder,
} from "@/lib/questionDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MathHtml } from "@/components/MathHtml";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cn,
  formatQuestionType,
  loadLeaderboardPreviewTest,
} from "@/lib/utils";
import { TagInput } from "@/components/TagInput";
import { collectPersistedTags } from "@/lib/tags";

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

const splitByOr = (value: string) =>
  value
    .split(/\s+(?:OR)\s+|\s*\|\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);

const toOptionArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim().toUpperCase())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const segments = splitByOr(value);
    if (segments.length === 0) {
      return [];
    }
    return segments.flatMap((segment) => {
      const normalized = segment.trim().toUpperCase();
      if (!normalized) {
        return [];
      }
      if (normalized.includes(",")) {
        return normalized
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean);
      }
      if (/^[A-Z]+$/.test(normalized)) {
        return normalized.split("");
      }
      return [normalized];
    });
  }
  return [];
};

const htmlHasVisibleContent = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }
  if (/<img\b/i.test(value)) {
    return true;
  }
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .trim().length > 0;
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read the pasted image."));
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

type ContentDraftField =
  | "sharedPassageContent"
  | "questionContent"
  | "optionContentA"
  | "optionContentB"
  | "optionContentC"
  | "optionContentD"
  | "solutionContent";

type QuestionContentDraft = Record<ContentDraftField, string>;

type ChatMessage = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  pinned?: boolean;
};

type KeyAnswerGroup = {
  id: string;
  single: string;
  multi: string[];
  min: string;
  max: string;
};

const buildKeyGroup = (): KeyAnswerGroup => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  single: "",
  multi: [],
  min: "",
  max: "",
});

const parseNumberValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNumericGroup = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const rangeMatch = trimmed.match(
    /(-?\d+(?:\.\d+)?)\s*(?:to|-)\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (rangeMatch) {
    return { min: rangeMatch[1], max: rangeMatch[2] };
  }
  return { min: trimmed, max: "" };
};

const buildQuestionContentDraft = (
  question: {
    sharedPassageContent?: string | null;
    questionContent: string;
    optionContentA: string | null;
    optionContentB: string | null;
    optionContentC: string | null;
    optionContentD: string | null;
    solutionContent?: string | null;
  } | null,
): QuestionContentDraft => ({
  sharedPassageContent: question?.sharedPassageContent ?? "",
  questionContent: question?.questionContent ?? "",
  optionContentA: question?.optionContentA ?? "",
  optionContentB: question?.optionContentB ?? "",
  optionContentC: question?.optionContentC ?? "",
  optionContentD: question?.optionContentD ?? "",
  solutionContent: question?.solutionContent ?? "",
});

const keyOptionLabels = ["A", "B", "C", "D"] as const;
const questionTypes: QuestionType[] = ["MCQ", "MAQ", "NAT", "VMAQ"];

export const QuestionDetail = () => {
  const { testId, questionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    state,
    updateAnswerKey,
    updateQuestionContent,
    uploadTemporaryQuestionImage,
    discardTemporaryQuestionImages,
    toggleQuestionBookmark,
    updateQuestionTags,
    updateGlobalQuestionTags,
    currentUser,
    isAdmin,
    showComparison,
  } = useAppStore();
  const isReadonlyView = searchParams.get("readonly") === "1";
  const isBookmarkView = searchParams.get("bookmarks") === "1";
  const previewParticipantName = searchParams.get("viewerName")?.trim() ?? "";
  const previewParticipantUsername =
    searchParams.get("viewerUsername")?.trim() ?? "";
  const previewParticipantKey = searchParams.get("participantKey")?.trim() ?? "";
  const ownedTestId = searchParams.get("ownedTestId")?.trim() || "";
  const previewTest = useMemo(() => loadLeaderboardPreviewTest(testId), [testId]);
  const ownedTest = useMemo(() => {
    // 1. If we have a direct match by ID, use it
    const direct = state.tests.find((item) => item.id === (ownedTestId || testId));
    if (direct) return direct;

    // 2. If we're previewing another user's test, find OUR test for the same exam
    if (isReadonlyView && previewTest?.externalExamId) {
      return state.tests.find(
        (item) => item.externalExamId === previewTest.externalExamId,
      );
    }
    return null;
  }, [state.tests, testId, ownedTestId, isReadonlyView, previewTest]);

  const test = isReadonlyView
    ? (previewTest ?? ownedTest)
    : (ownedTest ?? previewTest);
  const mode = currentUser?.preferences.mode ?? state.ui.mode;
  const displayQuestions = useMemo(() => {
    if (!test) {
      return [];
    }
    return buildDisplayQuestions(test.questions).filter(
      ({ question }) => !isBookmarkView || Boolean(test.bookmarks?.[question.id]),
    );
  }, [isBookmarkView, test]);

  const paletteSections = useMemo(() => {
    if (!test) {
      return [];
    }
    const map = new Map<
      Subject,
      Array<{
        id: string;
        number: number;
        status: string;
        bonus: boolean;
        bookmarked: boolean;
      }>
    >();
    displayQuestions.forEach((entry) => {
      const { question: item, displayNumber } = entry;
      const subject = item.subject as Subject;
      const current = map.get(subject) ?? [];
      current.push({
        id: item.id,
        number: displayNumber,
        status: getQuestionStatus(test, item),
        bonus: isBonusKey(item.keyUpdate),
        bookmarked: Boolean(test.bookmarks?.[item.id]),
      });
      map.set(subject, current);
    });
    return subjectDisplayOrder
      .map((subject) => ({
        subject,
        items: map.get(subject) ?? [],
      }))
      .filter((section) => section.items.length > 0);
  }, [displayQuestions, test]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [keyUpdateBonus, setKeyUpdateBonus] = useState(false);
  const [questionTypeDraft, setQuestionTypeDraft] = useState<QuestionType>("MCQ");
  const [markingDraft, setMarkingDraft] = useState({
    correct: "",
    incorrect: "",
    unattempted: "",
  });
  const [keyAnswerGroups, setKeyAnswerGroups] = useState<KeyAnswerGroup[]>([
    buildKeyGroup(),
  ]);
  const [notes, setNotes] = useState("");
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isSavingGlobalTags, setIsSavingGlobalTags] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatKeyLoaded, setChatKeyLoaded] = useState<string | null>(null);
  const [isBookmarking, setIsBookmarking] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [contentDraft, setContentDraft] = useState<QuestionContentDraft>(
    buildQuestionContentDraft(null),
  );
  const [tempImageUrls, setTempImageUrls] = useState<string[]>([]);
  const [isUploadingDraftImage, setIsUploadingDraftImage] = useState(false);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [isSolutionOpen, setIsSolutionOpen] = useState(false);
  const [isImageOpen, setIsImageOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const questionCopyRef = useRef<HTMLDivElement | null>(null);
  const availableTags = useMemo(
    () => collectPersistedTags(state.tests),
    [state.tests],
  );
  const draftFieldRefs = useRef<
    Partial<Record<ContentDraftField, HTMLTextAreaElement | null>>
  >({});
  const tempImageUrlsRef = useRef<string[]>([]);
  const dragState = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchState = useRef<{
    startDistance: number;
    startZoom: number;
  } | null>(null);
  const clickSuppressRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--zoom-scale",
      zoomLevel.toString(),
    );
  }, [zoomLevel]);

  useEffect(() => {
    tempImageUrlsRef.current = tempImageUrls;
  }, [tempImageUrls]);

  const analysis = test ? buildAnalysis(test) : null;
  const totalScore = test
    ? test.questions.reduce((sum, question) => sum + question.correctMarking, 0)
    : 0;
  const scoreLabel = analysis
    ? `${analysis.scoreCurrent}/${totalScore}`
    : "n/a";

  const currentIndex = displayQuestions.findIndex(
    (item) => item.question.id === questionId,
  );
  const questionEntry =
    currentIndex >= 0 ? displayQuestions[currentIndex] : null;
  const question = questionEntry?.question ?? null;
  const hasSharedPassage = htmlHasVisibleContent(question?.sharedPassageContent);
  const hasSolution = htmlHasVisibleContent(question?.solutionContent);
  const hasAdminPrivileges = isAdmin;
  const timeSpent = question && test ? getTimeForQuestion(test, question) : 0;
  const peerTimeSpent =
    question && test ? test.peerTimings?.[question.id] : undefined;
  const peerTimeLabel =
    typeof peerTimeSpent === "number" && Number.isFinite(peerTimeSpent)
      ? formatSeconds(peerTimeSpent)
      : "n/a";
  const peerAnswerStats = question
    ? test?.peerAnswerStats?.[question.id]
    : undefined;
  const hasPeerAnswerStats =
    Boolean(peerAnswerStats) && (peerAnswerStats?.total ?? 0) > 0;
  const answer = question && test ? getAnswerForQuestion(test, question) : null;
  const questionStatus =
    test && question ? getQuestionStatus(test, question) : "Unattempted";
  const userAnswerValue =
    questionStatus === "Unattempted" ? "" : formatAnswerValue(answer);
  const answerBorderClass =
    questionStatus === "Correct"
      ? "border-emerald-500"
      : questionStatus === "Incorrect"
        ? "border-rose-500"
        : "border-border";
  const answerTextClass =
    questionStatus === "Correct"
      ? "text-emerald-500"
      : questionStatus === "Incorrect"
        ? "text-rose-500"
        : "text-muted-foreground";
  const score = question && test ? getQuestionMark(test, question) : 0;
  const displayNumber = questionEntry?.displayNumber ?? 0;
  const isBookmarked = Boolean(
    test && question ? test.bookmarks?.[question.id] : false,
  );
  const editableTags = question?.tags ?? [];
  const lockedTags = question?.lockedTags ?? [];
  const keyOptions = keyOptionLabels;
  const keyOptionOrder: readonly string[] = keyOptionLabels;

  useEffect(() => {
    setContentDraft(buildQuestionContentDraft(question));
    setTempImageUrls([]);
    setIsEditDialogOpen(false);
    setIsSolutionOpen(false);
  }, [question]);

  const addKeyAnswerGroup = () => {
    setKeyAnswerGroups((prev) => [...prev, buildKeyGroup()]);
  };

  const removeKeyAnswerGroup = (groupId: string) => {
    setKeyAnswerGroups((prev) =>
      prev.length > 1 ? prev.filter((group) => group.id !== groupId) : prev,
    );
  };

  const updateSingleGroup = (groupId: string, value: string) => {
    setKeyAnswerGroups((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, single: value } : group,
      ),
    );
  };

  const toggleMultiGroupOption = (groupId: string, value: string) => {
    setKeyAnswerGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) {
          return group;
        }
        const exists = group.multi.includes(value);
        return {
          ...group,
          multi: exists
            ? group.multi.filter((item) => item !== value)
            : [...group.multi, value],
        };
      }),
    );
  };

  const updateRangeGroup = (
    groupId: string,
    field: "min" | "max",
    value: string,
  ) => {
    setKeyAnswerGroups((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, [field]: value } : group,
      ),
    );
  };

  const sortOptions = (values: string[]) => {
    if (values.length === 0) {
      return values;
    }
    return [...values].sort((a, b) => {
      const ai = keyOptionOrder.indexOf(a);
      const bi = keyOptionOrder.indexOf(b);
      const safeA = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
      const safeB = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
      return safeA - safeB;
    });
  };

  const buildKeyUpdateValue = () => {
    if (!question) {
      return null;
    }

    if (questionTypeDraft === "NAT") {
      const ranges: string[] = [];
      let hasInvalid = false;
      keyAnswerGroups.forEach((group) => {
        const minRaw = group.min.trim();
        const maxRaw = group.max.trim();
        if (!minRaw && !maxRaw) {
          return;
        }
        const minValue = parseNumberValue(minRaw);
        if (minValue === null) {
          hasInvalid = true;
          return;
        }
        const maxValue =
          maxRaw.length > 0 ? parseNumberValue(maxRaw) : minValue;
        if (maxValue === null) {
          hasInvalid = true;
          return;
        }
        ranges.push(
          minValue === maxValue ? String(minValue) : `${minValue}-${maxValue}`,
        );
      });
      if (hasInvalid) {
        return null;
      }
      return ranges.length > 0 ? ranges.join(" OR ") : null;
    }

    if (questionTypeDraft === "MAQ") {
      const groups = keyAnswerGroups
        .map((group) => {
          const selections = group.multi.map((item) =>
            item.trim().toUpperCase(),
          );
          if (selections.length === 0) {
            return null;
          }
          return sortOptions(selections).join("");
        })
        .filter((value): value is string => Boolean(value));
      return groups.length > 0 ? groups.join(" OR ") : null;
    }

    const singles = keyAnswerGroups
      .map((group) => group.single.trim().toUpperCase())
      .filter(Boolean);
    return singles.length > 0 ? singles.join(" OR ") : null;
  };

  const handleKeyUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (!hasAdminPrivileges) {
      setMessage("Only admins can update answer keys.");
      return;
    }
    if (!test || !question) {
      return;
    }
    const keyValue = buildKeyUpdateValue();
    if (!keyUpdateBonus && !keyValue) {
      setMessage("Enter a valid key or mark this question as bonus.");
      return;
    }
    const correctMarking = parseNumberValue(markingDraft.correct);
    const incorrectMarking = parseNumberValue(markingDraft.incorrect);
    const unattemptedMarking = parseNumberValue(markingDraft.unattempted);
    if (
      correctMarking === null ||
      incorrectMarking === null ||
      unattemptedMarking === null
    ) {
      setMessage("Enter valid marking values for this question.");
      return;
    }
    if (
      !Number.isInteger(correctMarking) ||
      !Number.isInteger(incorrectMarking) ||
      !Number.isInteger(unattemptedMarking)
    ) {
      setMessage("Marking values must be whole numbers.");
      return;
    }
    const result = await updateAnswerKey({
      testId: test.id,
      questionId: question.id,
      newKey: keyUpdateBonus ? { bonus: true } : keyValue,
      qtype: questionTypeDraft,
      markingScheme: {
        correct: correctMarking,
        incorrect: incorrectMarking,
        unattempted: unattemptedMarking,
      },
    });
    if (!result.ok) {
      setMessage(result.message ?? "Unable to update this question.");
      return;
    }
    setMessage("Answer key, question type, and marking scheme updated.");
    setKeyUpdateBonus(false);
  };

  const handleBookmarkToggle = async () => {
    if (!test || !question || isBookmarking || isReadonlyView) {
      return;
    }
    setIsBookmarking(true);
    const result = await toggleQuestionBookmark({
      testId: test.id,
      questionId: question.id,
      bookmarked: !isBookmarked,
    });
    if (!result.ok) {
      setMessage(result.message ?? "Unable to update bookmark.");
    }
    setIsBookmarking(false);
  };

  const handleQuestionTagsChange = async (nextTags: string[]) => {
    if (!test || !question || isReadonlyView) {
      return;
    }
    setIsSavingTags(true);
    const result = await updateQuestionTags({
      testId: test.id,
      questionId: question.id,
      tags: nextTags,
    });
    if (!result.ok) {
      setMessage(result.message ?? "Unable to update tags.");
    }
    setIsSavingTags(false);
  };

  const handleGlobalTagsChange = async (nextTags: string[]) => {
    if (!test || !question || !hasAdminPrivileges) {
      return;
    }
    setIsSavingGlobalTags(true);
    const result = await updateGlobalQuestionTags({
      testId: test.id,
      questionId: question.id,
      tags: nextTags,
    });
    if (!result.ok) {
      setMessage(result.message ?? "Unable to update admin tags.");
    }
    setIsSavingGlobalTags(false);
  };

  const cleanupTemporaryImages = async (urls: string[]) => {
    if (!test || !question || urls.length === 0) {
      return;
    }
    await discardTemporaryQuestionImages({
      testId: test.id,
      questionId: question.id,
      urls,
    });
  };

  useEffect(() => {
    const currentTestId = test?.id;
    const currentQuestionId = question?.id;

    return () => {
      const urls = tempImageUrlsRef.current;
      if (!currentTestId || !currentQuestionId || urls.length === 0) {
        return;
      }
      void discardTemporaryQuestionImages({
        testId: currentTestId,
        questionId: currentQuestionId,
        urls,
      });
    };
  }, [discardTemporaryQuestionImages, question?.id, test?.id]);

  const handleEditDialogOpenChange = (open: boolean) => {
    if (open) {
      setContentDraft(buildQuestionContentDraft(question));
      setTempImageUrls([]);
      setIsEditDialogOpen(true);
      return;
    }

    const pendingUrls = tempImageUrls;
    setIsEditDialogOpen(false);
    setContentDraft(buildQuestionContentDraft(question));
    setTempImageUrls([]);
    void cleanupTemporaryImages(pendingUrls);
  };

  const updateContentDraftField = (
    field: ContentDraftField,
    value: string,
  ) => {
    setContentDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleDraftImagePaste = (field: ContentDraftField) => {
    return async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((item): item is File => Boolean(item));

      if (!test || !question || imageFiles.length === 0) {
        return;
      }

      event.preventDefault();
      setIsUploadingDraftImage(true);

      const textarea = event.currentTarget;
      let nextValue = textarea.value;
      let cursor = textarea.selectionStart ?? nextValue.length;

      try {
        for (const file of imageFiles) {
          const dataUrl = await fileToDataUrl(file);
          const result = await uploadTemporaryQuestionImage({
            testId: test.id,
            questionId: question.id,
            dataUrl,
          });

          const imageUrl = result.url;
          if (!result.ok || !imageUrl) {
            setMessage(result.message ?? "Unable to upload pasted image.");
            return;
          }

          const insertion = insertTextAtSelection(
            nextValue,
            cursor,
            cursor,
            `<img src="${imageUrl}" alt="" />`,
          );
          nextValue = insertion.value;
          cursor = insertion.cursor;
          setTempImageUrls((prev) =>
            prev.includes(imageUrl) ? prev : [...prev, imageUrl],
          );
        }

        setContentDraft((prev) => ({ ...prev, [field]: nextValue }));
        setMessage(null);

        window.requestAnimationFrame(() => {
          const target = draftFieldRefs.current[field];
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
        setIsUploadingDraftImage(false);
      }
    };
  };

  const handleContentSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!test || !question) {
      return;
    }
    if (!isAdmin) {
      setMessage("Only admins can edit question content.");
      return;
    }

    setIsSavingContent(true);
    const result = await updateQuestionContent({
      testId: test.id,
      questionId: question.id,
      sharedPassageContent: contentDraft.sharedPassageContent || null,
      questionContent: contentDraft.questionContent,
      optionContentA: contentDraft.optionContentA || null,
      optionContentB: contentDraft.optionContentB || null,
      optionContentC: contentDraft.optionContentC || null,
      optionContentD: contentDraft.optionContentD || null,
      solutionContent: contentDraft.solutionContent || null,
    });
    setIsSavingContent(false);

    if (!result.ok) {
      setMessage(result.message ?? "Unable to update question content.");
      return;
    }

    setMessage("Question content updated.");
    const pendingUrls = tempImageUrls;
    setTempImageUrls([]);
    setIsEditDialogOpen(false);
    void cleanupTemporaryImages(pendingUrls);
  };

  const prev = currentIndex > 0 ? displayQuestions[currentIndex - 1] : null;
  const next =
    currentIndex < displayQuestions.length - 1
      ? displayQuestions[currentIndex + 1]
      : null;
  const selectedOptions = toOptionArray(answer);
  const correctOptions = question ? toOptionArray(question.keyUpdate) : [];
  const isMultiSelect = question?.qtype === "MAQ";
  const notesKey =
    !isReadonlyView && test && question
      ? `testanalyser-question-notes-${test.id}-${question.id}`
      : null;
  const chatKey =
    !isReadonlyView && test && question
      ? `testanalyser-question-chat-${test.id}-${question.id}`
      : null;
  const readonlySearch = useMemo(() => {
    const params = new URLSearchParams();
    if (isBookmarkView) {
      params.set("bookmarks", "1");
    }
    if (!isReadonlyView) {
      return params.size > 0 ? `?${params.toString()}` : "";
    }
    params.set("readonly", "1");
    if (previewParticipantKey) {
      params.set("participantKey", previewParticipantKey);
    }
    if (previewParticipantName) {
      params.set("viewerName", previewParticipantName);
    }
    if (previewParticipantUsername) {
      params.set("viewerUsername", previewParticipantUsername);
    }
    return `?${params.toString()}`;
  }, [
    isBookmarkView,
    isReadonlyView,
    previewParticipantKey,
    previewParticipantName,
    previewParticipantUsername,
  ]);
  const resolvedTestId = test?.id ?? testId ?? "";
  const questionLink = (targetQuestionId: string) =>
    `/app/questions/${resolvedTestId}/${targetQuestionId}${readonlySearch}`;
  const navigateToQuestion = (targetQuestionId: string | undefined) => {
    if (!targetQuestionId) {
      return;
    }
    navigate(questionLink(targetQuestionId));
  };
  const orderedMessages = useMemo(() => {
    return [...chatMessages].sort((a, b) => {
      const pinDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinDelta !== 0) {
        return pinDelta;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [chatMessages]);
  const activeMessages = chatKeyLoaded === chatKey ? orderedMessages : [];

  useEffect(() => {
    if (!question && isBookmarkView && displayQuestions.length > 0) {
      navigate(questionLink(displayQuestions[0].question.id), { replace: true });
    }
  }, [displayQuestions, isBookmarkView, navigate, question, questionLink]);

  useEffect(() => {
    if (!notesKey) {
      setNotes("");
      return;
    }
    const saved = localStorage.getItem(notesKey);
    setNotes(saved ?? "");
  }, [notesKey]);

  useEffect(() => {
    if (!question) {
      setKeyAnswerGroups([buildKeyGroup()]);
      setKeyUpdateBonus(false);
      setQuestionTypeDraft("MCQ");
      setMarkingDraft({ correct: "", incorrect: "", unattempted: "" });
      return;
    }
    setQuestionTypeDraft(question.qtype);
    setMarkingDraft({
      correct: String(question.correctMarking),
      incorrect: String(question.incorrectMarking),
      unattempted: String(question.unattemptedMarking),
    });
    const bonusActive = isBonusKey(question.keyUpdate);
    setKeyUpdateBonus(bonusActive);
    if (bonusActive) {
      setKeyAnswerGroups([buildKeyGroup()]);
      return;
    }

    const nextGroups: KeyAnswerGroup[] = [];
    const rawKey = question.keyUpdate ?? question.correctAnswer;

    if (question.qtype === "NAT") {
      if (typeof rawKey === "number") {
        nextGroups.push({ ...buildKeyGroup(), min: String(rawKey), max: "" });
      } else if (
        rawKey &&
        typeof rawKey === "object" &&
        "min" in rawKey &&
        "max" in rawKey
      ) {
        nextGroups.push({
          ...buildKeyGroup(),
          min: String(rawKey.min ?? ""),
          max: String(rawKey.max ?? ""),
        });
      } else if (typeof rawKey === "string") {
        splitByOr(rawKey).forEach((segment) => {
          const parsed = parseNumericGroup(segment);
          if (parsed) {
            nextGroups.push({
              ...buildKeyGroup(),
              min: parsed.min,
              max: parsed.max,
            });
          }
        });
      }
    } else if (question.qtype === "MAQ") {
      if (Array.isArray(rawKey)) {
        nextGroups.push({
          ...buildKeyGroup(),
          multi: rawKey.map((item) => String(item).trim().toUpperCase()),
        });
      } else if (typeof rawKey === "string") {
        splitByOr(rawKey).forEach((segment) => {
          const selections = toOptionArray(segment);
          if (selections.length > 0) {
            nextGroups.push({ ...buildKeyGroup(), multi: selections });
          }
        });
      }
    } else if (typeof rawKey === "string") {
      splitByOr(rawKey).forEach((segment) => {
        const selection = toOptionArray(segment)[0];
        if (selection) {
          nextGroups.push({ ...buildKeyGroup(), single: selection });
        }
      });
    } else if (Array.isArray(rawKey)) {
      const selection = rawKey[0] ? String(rawKey[0]).trim().toUpperCase() : "";
      nextGroups.push({ ...buildKeyGroup(), single: selection });
    }

    setKeyAnswerGroups(nextGroups.length > 0 ? nextGroups : [buildKeyGroup()]);
  }, [question]);

  useEffect(() => {
    if (!notesKey) {
      return;
    }
    localStorage.setItem(notesKey, notes);
  }, [notes, notesKey]);

  useEffect(() => {
    if (!chatKey) {
      setChatMessages([]);
      setChatKeyLoaded(null);
      return;
    }
    const raw = localStorage.getItem(chatKey);
    if (!raw) {
      setChatMessages([]);
      setChatKeyLoaded(chatKey);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as ChatMessage[];
      setChatMessages(Array.isArray(parsed) ? parsed : []);
    } catch {
      setChatMessages([]);
    }
    setChatKeyLoaded(chatKey);
  }, [chatKey]);

  useEffect(() => {
    if (!chatKey || chatKeyLoaded !== chatKey) {
      return;
    }
    localStorage.setItem(chatKey, JSON.stringify(chatMessages));
  }, [chatKey, chatKeyLoaded, chatMessages]);

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) {
      return;
    }
    const author = currentUser?.name ?? "User";
    const nextMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      author,
      body: trimmed,
      createdAt: new Date().toISOString(),
      pinned: false,
    };
    setChatMessages((prevMessages) => [...prevMessages, nextMessage]);
    setChatInput("");
  };

  const clampZoom = (value: number) => Math.min(4, Math.max(0.1, value));
  const dragThreshold = 4;

  const resetImageView = () => {
    setImageZoom(1);
    setImageOffset({ x: 0, y: 0 });
    activePointers.current.clear();
    pinchState.current = null;
    dragState.current = null;
  };

  const handleImageOpen = (src: string) => {
    setImageSrc(src);
    resetImageView();
    setIsImageOpen(true);
  };

  const handleRichContentClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (target instanceof HTMLImageElement) {
      const src = target.currentSrc || target.src;
      if (src) {
        event.preventDefault();
        handleImageOpen(src);
      }
    }
  };

  const handleImageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.15 : -0.15;
    setImageZoom((prev) => clampZoom(prev + delta));
  };

  const handleImagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    clickSuppressRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    activePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointers.current.size === 2) {
      clickSuppressRef.current = true;
      const points = Array.from(activePointers.current.values());
      const distance = Math.hypot(
        points[0].x - points[1].x,
        points[0].y - points[1].y,
      );
      pinchState.current = {
        startDistance: distance || 1,
        startZoom: imageZoom,
      };
      dragState.current = null;
      return;
    }

    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: imageOffset.x,
      originY: imageOffset.y,
    };
  };

  const handleImagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!activePointers.current.has(event.pointerId)) {
      return;
    }
    activePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointers.current.size === 2) {
      clickSuppressRef.current = true;
      const points = Array.from(activePointers.current.values());
      const distance = Math.hypot(
        points[0].x - points[1].x,
        points[0].y - points[1].y,
      );
      const start = pinchState.current?.startDistance ?? (distance || 1);
      const startZoom = pinchState.current?.startZoom ?? imageZoom;
      setImageZoom(clampZoom(startZoom * (distance / start)));
      return;
    }

    if (!dragState.current) {
      return;
    }
    if (pointerStartRef.current) {
      const deltaX = event.clientX - pointerStartRef.current.x;
      const deltaY = event.clientY - pointerStartRef.current.y;
      if (Math.hypot(deltaX, deltaY) > dragThreshold) {
        clickSuppressRef.current = true;
      }
    }
    const nextX =
      dragState.current.originX + (event.clientX - dragState.current.startX);
    const nextY =
      dragState.current.originY + (event.clientY - dragState.current.startY);
    setImageOffset({ x: nextX, y: nextY });
  };

  const handleImagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size < 2) {
      pinchState.current = null;
    }
    if (activePointers.current.size === 0) {
      pointerStartRef.current = null;
    }
    dragState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (clickSuppressRef.current) {
      setTimeout(() => {
        clickSuppressRef.current = false;
      }, 0);
    }
  };

  const togglePin = (id: string) => {
    if (!hasAdminPrivileges) {
      return;
    }
    setChatMessages((prevMessages) =>
      prevMessages.map((message) =>
        message.id === id ? { ...message, pinned: !message.pinned } : message,
      ),
    );
  };

  const deleteMessage = (id: string, author: string) => {
    if (!hasAdminPrivileges && currentUser?.name !== author) {
      return;
    }
    setChatMessages((prevMessages) =>
      prevMessages.filter((message) => message.id !== id),
    );
  };
  const handleCopyQuestionImage = async (withoutAnswers = false) => {
    const node = questionCopyRef.current;
    if (!node) return;

    setIsCopying(true);
    setMessage(null);

    // Identify elements to hide
    const unwanted = node.querySelectorAll(
      withoutAnswers
        ? ".hide-in-copy, .hide-in-no-answer-copy"
        : ".hide-in-copy",
    ) as NodeListOf<HTMLElement>;
    // Create a temporary style tag to force MathJax colors in the clone
    const styleTag = document.createElement("style");

    try {
      if (withoutAnswers) {
        node.classList.add("no-answer-copy-mode");
      }
      // 1. Ensure MathJax is finished
      if (window.MathJax && window.MathJax.typesetPromise) {
        await window.MathJax.typesetPromise([node]);
      }

      // 2. Prepare node: Hide unwanted UI elements
      unwanted.forEach((el) => {
        (el as any)._prevDisplay = el.style.display;
        el.style.display = "none";
      });

      // 2b. Force colors for MathJax and text via injected style
      const textColor = mode === "dark" ? "#f3f4f6" : "#111827";
      const bgColor = mode === "dark" ? "#0a0a0a" : "#ffffff";
      const borderColor = mode === "dark" ? "#262626" : "#e5e7eb";
      const mutedTextColor = mode === "dark" ? "#a3a3a3" : "#6b7280";

      let extraStyles = "";
      if (withoutAnswers) {
        extraStyles = `
          .no-answer-copy-mode .option-container {
            border-color: ${borderColor} !important;
            background-color: ${bgColor} !important;
            color: ${textColor} !important;
            border-style: solid !important;
          }
          .no-answer-copy-mode .option-label {
            border-color: ${borderColor} !important;
            background-color: transparent !important;
            color: ${mutedTextColor} !important;
          }
        `;
      }

      styleTag.innerHTML = `
        mjx-container { color: ${textColor} !important; }
        .question-html, .question-html * { color: ${textColor} !important; }
        svg { fill: currentColor !important; }
        ${extraStyles}
      `;
      node.appendChild(styleTag);

      // 3. Measure content precisely for the canvas
      // Adding padding here ensures the canvas is sized to include the margins
      const paddingX = 32;
      const paddingY = 32;

      // Use scrollHeight to capture the full content even if clipped by a scroll container
      const contentWidth = node.clientWidth;
      const contentHeight = node.scrollHeight;

      const width = contentWidth + paddingX * 2;
      const height = contentHeight + paddingY * 2;

      // 4. Generate the Image
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
      });

      // 5. Write to Clipboard
      if (blob) {
        const data = [new window.ClipboardItem({ "image/png": blob })];
        await navigator.clipboard.write(data);
        setMessage("Question image copied to clipboard.");
      }
    } catch (error) {
      console.error("Copy failed", error);
      const fallbackText = node.innerText?.trim() ?? "";
      if (navigator.clipboard && fallbackText) {
        try {
          await navigator.clipboard.writeText(fallbackText);
          setMessage("Image copy failed. Question text copied instead.");
        } catch {
          setMessage("Unable to copy question.");
        }
      } else {
        setMessage("Unable to copy question.");
      }
    } finally {
      // Cleanup: Remove style tag and restore hidden elements
      if (styleTag.parentNode) {
        node.removeChild(styleTag);
      }
      unwanted.forEach((el) => {
        el.style.display = (el as any)._prevDisplay || "";
      });
      setIsCopying(false);
    }
  };

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      if (target.isContentEditable) {
        return true;
      }
      return Boolean(
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"]',
        ),
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[role="dialog"]')
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        if (!prev) {
          return;
        }
        event.preventDefault();
        navigateToQuestion(prev.question.id);
        return;
      }

      if (event.key === "ArrowRight") {
        if (!next) {
          return;
        }
        event.preventDefault();
        navigateToQuestion(next.question.id);
        return;
      }

      if (
        event.key === "s" ||
        event.key === "S" ||
        event.key === "b" ||
        event.key === "B"
      ) {
        if (isReadonlyView || isBookmarking) {
          return;
        }
        event.preventDefault();
        void handleBookmarkToggle();
        return;
      }

      if (event.key === "c" || event.key === "C") {
        if (isCopying) {
          return;
        }
        event.preventDefault();
        void handleCopyQuestionImage();
      }

      if (event.key === "x" || event.key === "X") {
        if (isCopying) {
          return;
        }
        event.preventDefault();
        void handleCopyQuestionImage(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isBookmarking,
    isCopying,
    isReadonlyView,
    next,
    prev,
    navigate,
    readonlySearch,
    resolvedTestId,
  ]);

  if (!test || !question) {
    return (
      <Card className="app-panel">
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">Question not found.</p>
          <Button asChild variant="outline">
            <Link to="/app/tests">Back to tests</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-[calc(100vh-90px)] flex-col gap-1 overflow-hidden">
      {/* Question Detail Helper Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 lg:hidden"
            onClick={() => setIsSidebarOpen(true)}
            title="Show questions"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link
              to={
                isBookmarkView
                  ? "/app/bookmarks"
                  : `/app/tests/${ownedTest?.id ?? test.id}`
              }
            >
              {isBookmarkView ? "Back to bookmarks" : "Back to test"}
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {!isReadonlyView ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleBookmarkToggle}
              disabled={isBookmarking}
              aria-pressed={isBookmarked}
              title={isBookmarked ? "Remove bookmark" : "Bookmark question"}
              className="h-8 w-8"
            >
              <Bookmark
                className={cn(
                  "h-4 w-4",
                  isBookmarked ? "text-sky-500" : "text-muted-foreground",
                )}
                fill={isBookmarked ? "currentColor" : "none"}
              />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleCopyQuestionImage()}
            disabled={isCopying}
            title={
              isCopying ? "Copying question image" : "Copy question as image (c)"
            }
            aria-label="Copy question as image"
            className="h-8 w-8"
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleCopyQuestionImage(true)}
            disabled={isCopying}
            title={
              isCopying
                ? "Copying question image"
                : "Copy question without answers (x)"
            }
            aria-label="Copy question without answers"
            className="h-8 w-8"
          >
            <CopyX className="h-4 w-4 text-muted-foreground" />
          </Button>

          {/* Image, Text size zoom */}
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
            <span>Size</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setZoomLevel((p) => Math.max(p - 0.1, 0.7))}
              title="Decrease font size"
            >
              A-
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setZoomLevel((p) => Math.min(p + 0.1, 1.7))}
              title="Increase font size"
            >
              A+
            </Button>
          </div>
        </div>
      </div>
      {isReadonlyView ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Viewing leaderboard attempt:
          <span className="ml-1 font-semibold text-foreground">
            {previewParticipantName || "Participant"}
          </span>
          {previewParticipantUsername ? (
            <span className="ml-1">@{previewParticipantUsername}</span>
          ) : null}
          <span className="ml-2">Read-only mode.</span>
        </div>
      ) : null}

      <section className="grid min-h-0 flex-1 gap-1 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,320px)]">
        {/* Question Side Panel */}
        <Card
          className={cn(
            "app-panel h-full min-h-0 border-none transition-transform duration-300",
            "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-3/4 max-lg:max-w-xs max-lg:shadow-2xl",
            !isSidebarOpen && "max-lg:-translate-x-full",
          )}
        >
          <CardContent className="flex h-full min-h-0 flex-col gap-4 p-2 py-5">
            <div className="flex items-center justify-between lg:hidden">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Questions
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground max-lg:hidden">
              Questions
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-3">
                {paletteSections.map((section) => (
                  <div key={section.subject} className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                      {section.subject}
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      {section.items.map((item) => (
                        <Link
                          key={item.id}
                          to={questionLink(item.id)}
                          onClick={() => setIsSidebarOpen(false)}
                          className={cn(
                            "relative flex aspect-square w-full items-center justify-center rounded-md border text-xs font-medium",
                            item.id === question.id
                              ? "border-primary bg-primary text-primary-foreground"
                              : item.bonus
                                ? "border-sky-500/60 bg-sky-500/15 text-foreground hover:border-sky-400"
                                : item.status === "Correct"
                                  ? "border-emerald-500/60 bg-emerald-500/15 text-foreground hover:border-emerald-400"
                                  : item.status === "Partial"
                                    ? "border-amber-400/60 bg-amber-400/15 text-foreground hover:border-amber-300"
                                    : item.status === "Incorrect"
                                      ? "border-rose-500/60 bg-rose-500/15 text-foreground hover:border-rose-400"
                                      : "border-border/60 text-muted-foreground hover:border-primary/60",
                          )}
                        >
                          <span>{item.number}</span>
                          {!isReadonlyView && item.bookmarked ? (
                            <Bookmark
                              className="absolute right-0 top-0 h-3 w-3 text-sky-500"
                              fill="currentColor"
                            />
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            <div className="p-2 py-0">
              <div className="grid grid-cols-2 gap-y-2">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-neutral-800 dark:text-neutral-400 uppercase tracking-tight">
                    Correct
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <span className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                      {analysis?.correct || 0}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-neutral-800 dark:text-neutral-400 uppercase tracking-tight">
                    Partial
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                    <span className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                      {analysis?.partial || 0}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-y-2">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-neutral-800 dark:text-neutral-400 uppercase tracking-tight">
                    Incorrect
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                    <span className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                      {analysis?.incorrect || 0}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-neutral-800 dark:text-neutral-400 uppercase tracking-tight">
                    Unattmpted
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-300"></div>
                    <span className="text-xs font-black text-neutral-700 dark:text-neutral-300">
                      {analysis?.unattempted || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Separator className="mt-3" />
            <div className="flex items-center justify-between transition-colors">
              <span className="text-[9px] font-bold text-neutral-800 dark:text-neutral-300 uppercase tracking-widest">
                Total Score
              </span>
              <div className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                {scoreLabel}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Question detailed view */}
        <Card className="app-panel h-full min-h-0 border-0">
          <CardContent className="flex h-full min-h-0 flex-col gap-5 p-3 py-5 max-lg:pb-20">
            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
              <div ref={questionCopyRef} className="space-y-5">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Q{displayNumber} - {question.subject}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-border/60 px-2 py-1">
                      Source type: {question.sourceQtypeRaw?.trim() || "Unknown"}
                    </span>
                    <span className="rounded-full border border-border/60 px-2 py-1">
                      Current type: {formatQuestionType(question.qtype)}
                    </span>
                  </div>
                  {hasSharedPassage ? (
                    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Shared passage
                      </p>
                      <MathHtml
                        className={cn(
                          "question-html rounded-lg bg-transparent leading-relaxed",
                          mode === "dark"
                            ? "question-html--blend-dark"
                            : "question-html--blend-light",
                        )}
                        style={{ fontSize: zoomLevel + "rem" }}
                        html={question.sharedPassageContent ?? ""}
                        onClick={handleRichContentClick}
                      />
                    </div>
                  ) : null}
                  <MathHtml
                    className={cn(
                      "question-html rounded-lg bg-transparent leading-relaxed",
                      mode === "dark"
                        ? "question-html--blend-dark"
                        : "question-html--blend-light",
                    )}
                    style={{ fontSize: zoomLevel + "rem" }}
                    html={question.questionContent}
                    onClick={handleRichContentClick}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground hide-in-no-answer-copy">
                    {question.qtype === "NAT" ? "Answer" : "Options"}
                  </p>
                  {question.qtype === "NAT" ? (
                    <div className="relative hide-in-no-answer-copy">
                      <Input
                        readOnly
                        value={userAnswerValue}
                        placeholder="Unattempted"
                        className={cn(
                          "h-10 border-2 bg-background pr-28 text-sm font-semibold text-foreground",
                          answerBorderClass,
                        )}
                      />
                      <span
                        className={cn(
                          "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold",
                          answerTextClass,
                        )}
                      >
                        Correct: {formatAnswerValue(question.keyUpdate)}
                      </span>
                    </div>
                  ) : (
                    <div className="grid gap-3 hide-in-no-answer-copy">
                      {[
                        { label: "A", value: question.optionContentA },
                        { label: "B", value: question.optionContentB },
                        { label: "C", value: question.optionContentC },
                        { label: "D", value: question.optionContentD },
                      ]
                        .filter((item) => item.value)
                        .map((item) => {
                          const isSelected = selectedOptions.includes(
                            item.label,
                          );
                          const isCorrect = correctOptions.includes(item.label);
                          const isSelectedCorrect = isSelected && isCorrect;
                          const isSelectedIncorrect = isSelected && !isCorrect;
                          const isUnselectedCorrect = !isSelected && isCorrect;
                          const optionCount = hasPeerAnswerStats
                            ? (peerAnswerStats?.options?.[item.label] ?? 0)
                            : null;
                          return (
                            <div
                              key={item.label}
                              className={cn(
                                "option-container flex gap-3 rounded-lg border p-2 text-sm",
                                isSelectedCorrect &&
                                  "border-emerald-500/70 bg-emerald-500/20 text-foreground",
                                isSelectedIncorrect &&
                                  "border-rose-500/70 bg-rose-500/20 text-foreground",
                                isUnselectedCorrect &&
                                  "border-emerald-500/70 border-dashed bg-emerald-500/10 text-foreground",
                                !isSelectedCorrect &&
                                  !isSelectedIncorrect &&
                                  !isUnselectedCorrect &&
                                  "border-border bg-background text-foreground",
                              )}
                            >
                              <span
                                className={cn(
                                  "option-label flex h-7 w-7 flex-shrink-0 items-center justify-center border text-xs font-semibold",
                                  isMultiSelect ? "rounded-md" : "rounded-full",
                                  isSelectedCorrect &&
                                    "border-emerald-500 bg-emerald-500 text-emerald-950",
                                  isSelectedIncorrect &&
                                    "border-rose-500 bg-rose-500 text-white",
                                  isUnselectedCorrect &&
                                    "border-emerald-500 text-emerald-500",
                                  !isSelectedCorrect &&
                                    !isSelectedIncorrect &&
                                    !isUnselectedCorrect &&
                                    "border-border text-muted-foreground",
                                  "place-self-center",
                                )}
                              >
                                {item.label}
                              </span>
                              <div className="flex min-w-0 flex-1 items-end justify-between gap-3">
                                <MathHtml
                                  className={cn(
                                    "question-html min-w-0 flex-1 leading-relaxed",
                                    mode === "dark"
                                      ? "question-html--blend-dark"
                                      : "question-html--blend-light",
                                  )}
                                  style={{ fontSize: zoomLevel * 1.15 + "rem" }}
                                  html={item.value ?? ""}
                                  onClick={handleRichContentClick}
                                />
                                {showComparison && optionCount !== null ? (
                                  <div className="hide-in-no-answer-copy flex flex-col items-end text-[10px] uppercase tracking-wide text-muted-foreground">
                                    <span>Others picked</span>
                                    <span className="text-xs font-black text-foreground">
                                      {optionCount}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                  {showComparison && hasPeerAnswerStats ? (
                    <div className="hide-in-no-answer-copy flex items-center justify-end text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>Unattempted (Others)</span>
                      <span className="ml-2 text-xs font-black text-foreground">
                        {peerAnswerStats?.unattempted ?? 0}
                      </span>
                    </div>
                  ) : null}
                  {showComparison && hasPeerAnswerStats && question.qtype === "NAT" ? (
                    <div className="hide-in-no-answer-copy flex items-center justify-end gap-4 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>Correct</span>
                      <span className="text-xs font-black text-foreground">
                        {peerAnswerStats?.correct ?? 0}
                      </span>
                      <span>Incorrect</span>
                      <span className="text-xs font-black text-foreground">
                        {peerAnswerStats?.incorrect ?? 0}
                      </span>
                    </div>
                  ) : null}
                </div>

                {hasSolution ? (
                  <div className="hide-in-no-answer-copy space-y-3 rounded-xl border border-border/60 bg-background/70 p-3">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-left hide-in-copy"
                      onClick={() => setIsSolutionOpen((prev) => !prev)}
                    >
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          Solution
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isSolutionOpen ? "Hide worked solution" : "Show worked solution"}
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isSolutionOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {isSolutionOpen ? (
                      <MathHtml
                        className={cn(
                          "question-html rounded-lg bg-transparent leading-relaxed",
                          mode === "dark"
                            ? "question-html--blend-dark"
                            : "question-html--blend-light",
                        )}
                        style={{ fontSize: zoomLevel + "rem" }}
                        html={question.solutionContent ?? ""}
                        onClick={handleRichContentClick}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button asChild variant="outline" disabled={!prev}>
                {prev ? (
                  <Link to={questionLink(prev.question.id)}>
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
              </Button>
              <Button asChild variant="outline" disabled={!next}>
                {next ? (
                  <Link to={questionLink(next.question.id)}>
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Answer review */}
        <Card
          className={cn(
            "app-panel h-full min-h-0 border-none transition-transform duration-300",
            "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:h-[80vh] max-lg:rounded-t-2xl max-lg:shadow-2xl",
            !isReviewOpen && "max-lg:translate-y-full",
          )}
        >
          <CardContent className="flex h-full min-h-0 flex-col gap-4 p-2 py-5">
            <div className="flex items-center justify-between lg:hidden">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Answer review
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsReviewOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground max-lg:hidden">
              Answer review
            </p>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Summary
                  </p>
                </div>
                <div className="space-y-2 text-base">
                  <div className="p-2 py-0">
                    <div className="grid grid-cols-2 gap-y-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-normal text-neutral-800 dark:text-neutral-300 uppercase tracking-tight">
                          Your Answer
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                          <span className="text-sm font-black text-neutral-700 dark:text-neutral-300">
                            {formatAnswerValue(answer)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-normal text-neutral-800 dark:text-neutral-300 uppercase tracking-tight">
                          Correct Answer
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                          <span className="text-sm font-black text-neutral-700 dark:text-neutral-300">
                            {formatAnswerValue(question.keyUpdate)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-normal text-neutral-800 dark:text-neutral-300 uppercase tracking-tight">
                          Original Answer
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                          <span className="text-sm font-black text-neutral-700 dark:text-neutral-300">
                            {formatAnswerValue(question.correctAnswer)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-normal text-neutral-800 dark:text-neutral-300 uppercase tracking-tight">
                          Marks
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-neutral-300"></div>
                          <span className="text-sm font-black text-neutral-700 dark:text-neutral-300">
                            {score}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between transition-colors">
                    <span className="text-xs font-normal text-neutral-800 dark:text-neutral-300 uppercase tracking-widest">
                      Time Spent
                    </span>
                    <div className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 dark:bg-emerald-900/30 text-blue-600 dark:text-blue-400">
                      {formatSeconds(timeSpent)}
                    </div>
                  </div>
                  {showComparison && (
                    <div className="flex items-center justify-between transition-colors">
                      <span className="text-xs font-normal text-neutral-800 dark:text-neutral-300 uppercase tracking-widest">
                        Avg Time (Others)
                      </span>
                      <div className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 dark:bg-emerald-900/30 text-blue-600 dark:text-blue-400">
                        {peerTimeLabel}
                      </div>
                    </div>
                  )}
                </div>
                <Separator />
              </div>

              {!isReadonlyView ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Tags
                      </p>
                      {isSavingTags ? (
                        <span className="text-xs text-muted-foreground">
                          Saving...
                        </span>
                      ) : null}
                    </div>
                    <TagInput
                      value={editableTags}
                      lockedTags={lockedTags}
                      suggestions={availableTags}
                      onChange={handleQuestionTagsChange}
                      placeholder="Type tags and press space"
                      emptyMessage="No matching existing tags"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Notes
                    </p>
                    <Textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Add your notes for this question"
                    />
                  </div>
                  <Separator />
                </div>
              ) : null}

              {!isReadonlyView ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Key discussion
                    </p>
                  </div>
                  <div className="space-y-2">
                    {activeMessages.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No messages yet. Start the discussion.
                      </p>
                    ) : (
                      activeMessages.map((chat) => (
                        <div
                          key={chat.id}
                          className={cn(
                            "rounded-lg border border-border p-3 text-xs",
                            chat.pinned ? "bg-amber-500/10" : "bg-background",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="space-y-1">
                              <p className="font-semibold text-foreground">
                                {chat.author}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {new Date(chat.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => togglePin(chat.id)}
                                disabled={!hasAdminPrivileges}
                                title={
                                  hasAdminPrivileges
                                    ? "Toggle pin"
                                    : "Admins only"
                                }
                              >
                                {chat.pinned ? "Unpin" : "Pin"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  deleteMessage(chat.id, chat.author)
                                }
                                disabled={
                                  !hasAdminPrivileges &&
                                  currentUser?.name !== chat.author
                                }
                                title={
                                  hasAdminPrivileges ||
                                  currentUser?.name === chat.author
                                    ? "Delete message"
                                    : "Admins or message author only"
                                }
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-foreground/90">
                            {chat.body}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  <form className="flex gap-2" onSubmit={handleChatSubmit}>
                    <Input
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder="Add a message"
                    />
                    <Button type="submit">Send</Button>
                  </form>
                  <Separator />
                </div>
              ) : null}
              {!isReadonlyView && currentUser && hasAdminPrivileges ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Admin tools
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Dialog
                      open={isEditDialogOpen}
                      onOpenChange={handleEditDialogOpenChange}
                    >
                      <DialogTrigger asChild>
                        <Button variant="secondary">
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit content
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                      <DialogHeader>
                        <DialogTitle>Edit question content</DialogTitle>
                        <DialogDescription>
                          Paste HTML for the shared passage, question, options, and solution. Pasted images upload immediately as temporary assets and are finalized only when you save.
                        </DialogDescription>
                      </DialogHeader>
                      <form className="space-y-4" onSubmit={handleContentSave}>
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">
                            Shared passage HTML
                          </label>
                          <Textarea
                            ref={(node) => {
                              draftFieldRefs.current.sharedPassageContent = node;
                            }}
                            value={contentDraft.sharedPassageContent}
                            onChange={(event) =>
                              updateContentDraftField(
                                "sharedPassageContent",
                                event.target.value,
                              )
                            }
                            onPaste={handleDraftImagePaste("sharedPassageContent")}
                            className="min-h-32 font-mono text-xs"
                            placeholder="Leave empty when this question has no shared passage."
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">
                            Question HTML
                          </label>
                          <Textarea
                            ref={(node) => {
                              draftFieldRefs.current.questionContent = node;
                            }}
                            value={contentDraft.questionContent}
                            onChange={(event) =>
                              updateContentDraftField(
                                "questionContent",
                                event.target.value,
                              )
                            }
                            onPaste={handleDraftImagePaste("questionContent")}
                            className="min-h-36 font-mono text-xs"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {(
                            [
                              ["optionContentA", "Option A"],
                              ["optionContentB", "Option B"],
                              ["optionContentC", "Option C"],
                              ["optionContentD", "Option D"],
                            ] as const
                          ).map(([field, label]) => (
                            <div key={field} className="space-y-2">
                              <label className="text-xs text-muted-foreground">
                                {label}
                              </label>
                              <Textarea
                                ref={(node) => {
                                  draftFieldRefs.current[field] = node;
                                }}
                                value={contentDraft[field]}
                                onChange={(event) =>
                                  updateContentDraftField(
                                    field,
                                    event.target.value,
                                  )
                                }
                                onPaste={handleDraftImagePaste(field)}
                                className="min-h-28 font-mono text-xs"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">
                            Solution HTML
                          </label>
                          <Textarea
                            ref={(node) => {
                              draftFieldRefs.current.solutionContent = node;
                            }}
                            value={contentDraft.solutionContent}
                            onChange={(event) =>
                              updateContentDraftField(
                                "solutionContent",
                                event.target.value,
                              )
                            }
                            onPaste={handleDraftImagePaste("solutionContent")}
                            className="min-h-32 font-mono text-xs"
                            placeholder="Leave empty to hide the solution section."
                          />
                        </div>
                        {isUploadingDraftImage ? (
                          <p className="text-xs text-muted-foreground">
                            Uploading pasted image...
                          </p>
                        ) : null}
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleEditDialogOpenChange(false)}
                            disabled={isSavingContent}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" disabled={isSavingContent}>
                            {isSavingContent ? "Saving..." : "Save content"}
                          </Button>
                        </DialogFooter>
                      </form>
                      </DialogContent>
                    </Dialog>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="secondary">Update key/marking</Button>
                      </DialogTrigger>
                      <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Update answer key and marking</DialogTitle>
                        <DialogDescription>
                          Add one or more valid answers and set question-level
                          marking values.
                        </DialogDescription>
                      </DialogHeader>
                      <form className="space-y-4" onSubmit={handleKeyUpdate}>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Answer options
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Add multiple answers to represent OR alternatives.
                          </p>
                        </div>
                        <div
                          className={cn(
                            "space-y-3",
                            keyUpdateBonus && "opacity-60",
                          )}
                        >
                          {keyAnswerGroups.map((group, index) => (
                            <div
                              key={group.id}
                              className="space-y-3 rounded-lg border border-border/60 p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                  Answer {index + 1}
                                </span>
                                {index > 0 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      removeKeyAnswerGroup(group.id)
                                    }
                                    disabled={keyUpdateBonus}
                                  >
                                    Remove
                                  </Button>
                                ) : null}
                              </div>

                              {questionTypeDraft === "NAT" ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-2">
                                    <label className="text-xs text-muted-foreground">
                                      Lower range
                                    </label>
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      step="any"
                                      value={group.min}
                                      onChange={(event) =>
                                        updateRangeGroup(
                                          group.id,
                                          "min",
                                          event.target.value,
                                        )
                                      }
                                      disabled={keyUpdateBonus}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs text-muted-foreground">
                                      Upper range
                                    </label>
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      step="any"
                                      value={group.max}
                                      onChange={(event) =>
                                        updateRangeGroup(
                                          group.id,
                                          "max",
                                          event.target.value,
                                        )
                                      }
                                      placeholder={
                                        group.min.trim() || "Same as start"
                                      }
                                      disabled={keyUpdateBonus}
                                    />
                                  </div>
                                </div>
                              ) : questionTypeDraft === "MAQ" ? (
                                <div className="flex flex-wrap gap-2">
                                  {keyOptions.length > 0 ? (
                                    keyOptions.map((option) => (
                                      <label
                                        key={option}
                                        className={cn(
                                          "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                                          group.multi.includes(option)
                                            ? "border-primary/60 bg-primary/10 text-foreground"
                                            : "border-border text-muted-foreground",
                                          keyUpdateBonus &&
                                            "pointer-events-none",
                                        )}
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-3 w-3"
                                          checked={group.multi.includes(option)}
                                          onChange={() =>
                                            toggleMultiGroupOption(
                                              group.id,
                                              option,
                                            )
                                          }
                                          disabled={keyUpdateBonus}
                                        />
                                        <span className="font-semibold">
                                          {option}
                                        </span>
                                      </label>
                                    ))
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      No options available for this question.
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {keyOptions.length > 0 ? (
                                    keyOptions.map((option) => (
                                      <label
                                        key={option}
                                        className={cn(
                                          "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                                          group.single === option
                                            ? "border-primary/60 bg-primary/10 text-foreground"
                                            : "border-border text-muted-foreground",
                                          keyUpdateBonus &&
                                            "pointer-events-none",
                                        )}
                                      >
                                        <input
                                          type="radio"
                                          name={`key-single-${group.id}`}
                                          className="h-3 w-3"
                                          checked={group.single === option}
                                          onChange={() =>
                                            updateSingleGroup(group.id, option)
                                          }
                                          disabled={keyUpdateBonus}
                                        />
                                        <span className="font-semibold">
                                          {option}
                                        </span>
                                      </label>
                                    ))
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      No options available for this question.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addKeyAnswerGroup}
                        disabled={keyUpdateBonus}
                      >
                        Add another answer (OR)
                      </Button>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">
                            Bonus question
                          </p>
                          <p>Give full marks to everyone for this question.</p>
                        </div>
                        <Switch
                          checked={keyUpdateBonus}
                          onCheckedChange={setKeyUpdateBonus}
                        />
                      </div>
                      <div className="space-y-3 rounded-lg border border-border/60 p-3">
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Question marking scheme
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Override this question&apos;s marks without changing
                            other questions.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">
                            Question type
                          </label>
                          <Select
                            value={questionTypeDraft}
                            onValueChange={(value) => {
                              setQuestionTypeDraft(value as QuestionType);
                              setKeyAnswerGroups([buildKeyGroup()]);
                              setKeyUpdateBonus(false);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {questionTypes.map((qtype) => (
                                <SelectItem key={qtype} value={qtype}>
                                  {formatQuestionType(qtype)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">
                              Correct
                            </label>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="1"
                              value={markingDraft.correct}
                              onChange={(event) =>
                                setMarkingDraft((prev) => ({
                                  ...prev,
                                  correct: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">
                              Incorrect
                            </label>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="1"
                              value={markingDraft.incorrect}
                              onChange={(event) =>
                                setMarkingDraft((prev) => ({
                                  ...prev,
                                  incorrect: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">
                              Unattempted
                            </label>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="1"
                              value={markingDraft.unattempted}
                              onChange={(event) =>
                                setMarkingDraft((prev) => ({
                                  ...prev,
                                  unattempted: event.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                        <DialogFooter>
                          <DialogClose>
                            <Button type="submit">Save update</Button>
                          </DialogClose>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                  </div>
                  <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Admin tags
                      </p>
                      <p className="text-xs text-muted-foreground">
                        These tags are shared with every user and cannot be
                        removed from personal tag fields.
                      </p>
                    </div>
                    {isSavingGlobalTags ? (
                      <span className="text-xs text-muted-foreground">
                        Saving...
                      </span>
                    ) : null}
                  </div>
                  <TagInput
                    value={lockedTags}
                    suggestions={availableTags}
                    onChange={handleGlobalTagsChange}
                    placeholder="Add global tags"
                    emptyMessage="No matching existing tags"
                  />
                  </div>
                </div>
              ) : !isReadonlyView ? (
                <p className="text-xs text-muted-foreground">
                  Only admins can edit question content or answer keys.
                </p>
              ) : null}

              {message ? (
                <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                  {message}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Mobile Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between border-t bg-background/90 px-4 py-2 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className={cn(
              "flex flex-col items-start rounded-md border px-2 py-1",
              answerBorderClass,
            )}
          >
            <span className="text-[10px] uppercase font-bold leading-none text-muted-foreground">
              Your Answer
            </span>
            <span className={cn("text-xs font-black", answerTextClass)}>
              {userAnswerValue || "N/A"}
            </span>
          </div>
          <div className="flex flex-col items-start rounded-md border border-amber-500/50 bg-amber-500/5 px-2 py-1">
            <span className="text-[10px] uppercase font-bold leading-none text-amber-600 dark:text-amber-400">
              Correct
            </span>
            <span className="text-xs font-black text-amber-600 dark:text-amber-400">
              {formatAnswerValue(question.keyUpdate)}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setIsReviewOpen(true)}
          className="flex-shrink-0"
        >
          Review & Tags
        </Button>
      </div>

      {/* Backdrops */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-[45] bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      {isReviewOpen && (
        <div
          className="fixed inset-0 z-[35] bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setIsReviewOpen(false)}
        />
      )}

      <Dialog
        open={isImageOpen}
        onOpenChange={(open) => {
          setIsImageOpen(open);
          if (!open) {
            setImageSrc(null);
            resetImageView();
          }
        }}
      >
        <DialogContent
          className="inset-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-transparent p-0 shadow-none"
          overlayClassName="bg-black/30 backdrop-blur-none"
        >
          <div className="relative h-full w-full">
            <div className="absolute right-10 top-2 z-10">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  resetImageView();
                }}
              >
                Reset
              </Button>
            </div>
            <div
              className={cn(
                "relative flex h-full w-full touch-none items-center justify-center overflow-hidden cursor-grab",
              )}
              onClick={(event) => {
                if (event.target !== event.currentTarget) {
                  return;
                }
                if (clickSuppressRef.current) {
                  clickSuppressRef.current = false;
                  return;
                }
                setIsImageOpen(false);
                setImageSrc(null);
                resetImageView();
              }}
              onWheel={handleImageWheel}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerUp}
              onPointerLeave={handleImagePointerUp}
              onPointerCancel={handleImagePointerUp}
            >
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt="Question attachment"
                  className={
                    "max-h-full max-w-full select-none" +
                    (mode === "dark" ? " invert" : "")
                  }
                  draggable={false}
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageZoom})`,
                    transformOrigin: "center",
                  }}
                />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
