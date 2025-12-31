import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import { Copy, Star } from "lucide-react";
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
import type { Subject } from "@/lib/types";
import {
  buildDisplayQuestions,
  subjectDisplayOrder,
} from "@/lib/questionDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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
    /(-?\d+(?:\.\d+)?)\s*(?:to|-)\s*(-?\d+(?:\.\d+)?)/i
  );
  if (rangeMatch) {
    return { min: rangeMatch[1], max: rangeMatch[2] };
  }
  return { min: trimmed, max: "" };
};

const keyOptionLabels = ["A", "B", "C", "D"] as const;

export const QuestionDetail = () => {
  const { testId, questionId } = useParams();
  const {
    state,
    updateAnswerKey,
    toggleQuestionBookmark,
    currentUser,
    isAdmin,
  } = useAppStore();
  const test = state.tests.find((item) => item.id === testId);
  const mode = currentUser?.preferences.mode ?? state.ui.mode;
  const displayQuestions = useMemo(() => {
    if (!test) {
      return [];
    }
    return buildDisplayQuestions(test.questions);
  }, [test]);

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

  const [message, setMessage] = useState<string | null>(null);
  const [keyUpdateBonus, setKeyUpdateBonus] = useState(false);
  const [keyAnswerGroups, setKeyAnswerGroups] = useState<KeyAnswerGroup[]>([
    buildKeyGroup(),
  ]);
  const [notes, setNotes] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatKeyLoaded, setChatKeyLoaded] = useState<string | null>(null);
  const [isBookmarking, setIsBookmarking] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isImageOpen, setIsImageOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const questionCopyRef = useRef<HTMLDivElement | null>(null);
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
      zoomLevel.toString()
    );
  }, [zoomLevel]);

  const analysis = test ? buildAnalysis(test) : null;
  const totalScore = test
    ? test.questions.reduce((sum, question) => sum + question.correctMarking, 0)
    : 0;
  const scoreLabel = analysis
    ? `${analysis.scoreCurrent}/${totalScore}`
    : "n/a";

  const currentIndex = displayQuestions.findIndex(
    (item) => item.question.id === questionId
  );
  const questionEntry =
    currentIndex >= 0 ? displayQuestions[currentIndex] : null;
  const question = questionEntry?.question ?? null;
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
      : "border-white";
  const answerTextClass =
    questionStatus === "Correct"
      ? "text-emerald-500"
      : questionStatus === "Incorrect"
      ? "text-rose-500"
      : "text-muted-foreground";
  const score = question && test ? getQuestionMark(test, question) : 0;
  const displayNumber = questionEntry?.displayNumber ?? 0;
  const isBookmarked = Boolean(
    test && question ? test.bookmarks?.[question.id] : false
  );
  const keyOptions = keyOptionLabels;
  const keyOptionOrder: readonly string[] = keyOptionLabels;

  const addKeyAnswerGroup = () => {
    setKeyAnswerGroups((prev) => [...prev, buildKeyGroup()]);
  };

  const removeKeyAnswerGroup = (groupId: string) => {
    setKeyAnswerGroups((prev) =>
      prev.length > 1 ? prev.filter((group) => group.id !== groupId) : prev
    );
  };

  const updateSingleGroup = (groupId: string, value: string) => {
    setKeyAnswerGroups((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, single: value } : group
      )
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
      })
    );
  };

  const updateRangeGroup = (
    groupId: string,
    field: "min" | "max",
    value: string
  ) => {
    setKeyAnswerGroups((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, [field]: value } : group
      )
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

    if (question.qtype === "NAT") {
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
          minValue === maxValue ? String(minValue) : `${minValue}-${maxValue}`
        );
      });
      if (hasInvalid) {
        return null;
      }
      return ranges.length > 0 ? ranges.join(" OR ") : null;
    }

    if (question.qtype === "MAQ") {
      const groups = keyAnswerGroups
        .map((group) => {
          const selections = group.multi.map((item) =>
            item.trim().toUpperCase()
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
    if (!isAdmin) {
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
    await updateAnswerKey({
      testId: test.id,
      questionId: question.id,
      newKey: keyUpdateBonus ? { bonus: true } : keyValue,
    });
    setMessage("Answer key updated.");
    setKeyUpdateBonus(false);
  };

  const handleBookmarkToggle = async () => {
    if (!test || !question || isBookmarking) {
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

  const prev = currentIndex > 0 ? displayQuestions[currentIndex - 1] : null;
  const next =
    currentIndex < displayQuestions.length - 1
      ? displayQuestions[currentIndex + 1]
      : null;
  const selectedOptions = toOptionArray(answer);
  const correctOptions = question ? toOptionArray(question.keyUpdate) : [];
  const isMultiSelect = question?.qtype === "MAQ";
  const notesKey =
    test && question
      ? `testanalyser-question-notes-${test.id}-${question.id}`
      : null;
  const chatKey =
    test && question
      ? `testanalyser-question-chat-${test.id}-${question.id}`
      : null;
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
      return;
    }
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
        points[0].y - points[1].y
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
        points[0].y - points[1].y
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
    if (!isAdmin) {
      return;
    }
    setChatMessages((prevMessages) =>
      prevMessages.map((message) =>
        message.id === id ? { ...message, pinned: !message.pinned } : message
      )
    );
  };

  const deleteMessage = (id: string, author: string) => {
    if (!isAdmin && currentUser?.name !== author) {
      return;
    }
    setChatMessages((prevMessages) =>
      prevMessages.filter((message) => message.id !== id)
    );
  };

  // Copy Image
  const waitForImages = async (root: HTMLElement) => {
    const images = Array.from(root.querySelectorAll("img"));
    if (images.length === 0) {
      return;
    }
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
              resolve();
              return;
            }
            const handleDone = () => {
              img.removeEventListener("load", handleDone);
              img.removeEventListener("error", handleDone);
              resolve();
            };
            img.addEventListener("load", handleDone);
            img.addEventListener("error", handleDone);
          })
      )
    );
  };

  const cloneWithInlineStyles = (root: HTMLElement) => {
    const clonedRoot = root.cloneNode(true) as HTMLElement;
    const sourceElements = [root, ...Array.from(root.querySelectorAll("*"))];
    const targetElements = [
      clonedRoot,
      ...Array.from(clonedRoot.querySelectorAll("*")),
    ];

    sourceElements.forEach((sourceElement, index) => {
      const targetElement = targetElements[index];
      if (!targetElement) {
        return;
      }
      if (
        !(
          targetElement instanceof HTMLElement ||
          targetElement instanceof SVGElement
        )
      ) {
        return;
      }
      const computed = window.getComputedStyle(sourceElement);
      for (let i = 0; i < computed.length; i += 1) {
        const prop = computed[i];
        targetElement.style.setProperty(
          prop,
          computed.getPropertyValue(prop),
          computed.getPropertyPriority(prop)
        );
      }
    });
    return clonedRoot;
  };

  const renderQuestionImageBlob = async (root: HTMLElement) => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await waitForImages(root);

    const clonedRoot = cloneWithInlineStyles(root);
    const rect = root.getBoundingClientRect();
    const contentWidth = Math.ceil(rect.width);
    const contentHeight = Math.ceil(Math.max(rect.height, root.scrollHeight));
    const padding = 16;

    const panel = root.closest(".app-panel") as HTMLElement | null;
    const panelStyles = panel
      ? window.getComputedStyle(panel)
      : window.getComputedStyle(root);
    const background = panelStyles.backgroundColor || "#ffffff";
    const foreground = panelStyles.color || "#111111";
    const fontFamily = panelStyles.fontFamily || "sans-serif";

    clonedRoot.style.margin = "0";
    clonedRoot.style.width = `${contentWidth}px`;
    clonedRoot.style.height = `${contentHeight}px`;
    clonedRoot.style.boxSizing = "border-box";

    const wrapper = document.createElement("div");
    wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    wrapper.style.width = `${contentWidth + padding * 2}px`;
    wrapper.style.height = `${contentHeight + padding * 2}px`;
    wrapper.style.padding = `${padding}px`;
    wrapper.style.boxSizing = "border-box";
    wrapper.style.background = background;
    wrapper.style.color = foreground;
    wrapper.style.fontFamily = fontFamily;
    wrapper.style.display = "block";
    wrapper.appendChild(clonedRoot);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", `${contentWidth + padding * 2}`);
    svg.setAttribute("height", `${contentHeight + padding * 2}`);
    svg.setAttribute(
      "viewBox",
      `0 0 ${contentWidth + padding * 2} ${contentHeight + padding * 2}`
    );

    const foreignObject = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "foreignObject"
    );
    foreignObject.setAttribute("x", "0");
    foreignObject.setAttribute("y", "0");
    foreignObject.setAttribute("width", "100%");
    foreignObject.setAttribute("height", "100%");
    foreignObject.appendChild(wrapper);
    svg.appendChild(foreignObject);

    const svgString = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(new Error("Unable to render question image"));
        img.src = url;
      });
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil((contentWidth + padding * 2) * dpr);
      canvas.height = Math.ceil((contentHeight + padding * 2) * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas unavailable");
      }
      ctx.scale(dpr, dpr);
      ctx.drawImage(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) {
        throw new Error("Unable to create image blob");
      }
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleCopyQuestionImage = async () => {
    const root = questionCopyRef.current;
    if (!root) {
      return;
    }
    const ClipboardItemCtor = window.ClipboardItem;
    if (!navigator.clipboard || !ClipboardItemCtor) {
      setMessage("Clipboard image copy is not supported in this browser.");
      return;
    }
    setIsCopying(true);
    setMessage(null);
    try {
      const blob = await renderQuestionImageBlob(root);
      await navigator.clipboard.write([
        new ClipboardItemCtor({ "image/png": blob }),
      ]);
      setMessage("Question image copied to clipboard.");
    } catch {
      setMessage("Unable to copy question image. Try again.");
    } finally {
      setIsCopying(false);
    }
  };

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
        <Button asChild variant="ghost" size="sm">
          <Link to={`/app/tests/${test.id}`}>Back to test</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleBookmarkToggle}
            disabled={isBookmarking}
            aria-pressed={isBookmarked}
            title={isBookmarked ? "Remove star" : "Star question"}
            className="h-8 w-8"
          >
            <Star
              className={cn(
                "h-4 w-4",
                isBookmarked ? "text-amber-400" : "text-muted-foreground"
              )}
              fill={isBookmarked ? "currentColor" : "none"}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCopyQuestionImage}
            disabled={isCopying}
            title={
              isCopying ? "Copying question image" : "Copy question as image"
            }
            aria-label="Copy question as image"
            className="h-8 w-8"
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
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

      <section className="grid min-h-0 flex-1 gap-1 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,320px)]">
        {/* Question Side Panel */}
        <Card className="app-panel h-full min-h-0 border-none max-sm:hidden">
          <CardContent className="flex h-full min-h-0 flex-col gap-4 p-2 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
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
                          to={`/app/questions/${test.id}/${item.id}`}
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
                              : "border-border/60 text-muted-foreground hover:border-primary/60"
                          )}
                        >
                          <span>{item.number}</span>
                          {item.bookmarked ? (
                            <Star
                              className="absolute right-0 top-0 h-3 w-3 text-amber-400"
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
          <CardContent className="flex h-full min-h-0 flex-col gap-5 p-3 py-5">
            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
              <div ref={questionCopyRef} className="space-y-5">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Q{displayNumber} - {question.subject}
                  </p>
                  <div
                    className={cn(
                      "question-html rounded-lg bg-transparent leading-relaxed",
                      mode === "dark"
                        ? "question-html--blend-dark"
                        : "question-html--blend-light"
                    )}
                    style={{ fontSize: zoomLevel + "rem" }}
                    dangerouslySetInnerHTML={{
                      __html: question.questionContent,
                    }}
                    onClick={handleRichContentClick}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {question.qtype === "NAT" ? "Answer" : "Options"}
                  </p>
                  {question.qtype === "NAT" ? (
                    <div className="relative">
                      <Input
                        readOnly
                        value={userAnswerValue}
                        placeholder="Unattempted"
                        className={cn(
                          "h-10 border-2 bg-background pr-28 text-sm font-semibold text-foreground",
                          answerBorderClass
                        )}
                      />
                      <span
                        className={cn(
                          "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold",
                          answerTextClass
                        )}
                      >
                        Correct: {formatAnswerValue(question.keyUpdate)}
                      </span>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {[
                        { label: "A", value: question.optionContentA },
                        { label: "B", value: question.optionContentB },
                        { label: "C", value: question.optionContentC },
                        { label: "D", value: question.optionContentD },
                      ]
                        .filter((item) => item.value)
                        .map((item) => {
                          const isSelected = selectedOptions.includes(item.label);
                          const isCorrect = correctOptions.includes(item.label);
                          const isSelectedCorrect = isSelected && isCorrect;
                          const isSelectedIncorrect = isSelected && !isCorrect;
                          const isUnselectedCorrect = !isSelected && isCorrect;
                          const optionCount = hasPeerAnswerStats
                            ? peerAnswerStats?.options?.[item.label] ?? 0
                            : null;
                          return (
                            <div
                              key={item.label}
                              className={cn(
                                "flex gap-3 rounded-lg border p-2 text-sm",
                                isSelectedCorrect &&
                                  "border-emerald-500/70 bg-emerald-500/20 text-foreground",
                                isSelectedIncorrect &&
                                  "border-rose-500/70 bg-rose-500/20 text-foreground",
                                isUnselectedCorrect &&
                                  "border-emerald-500/70 border-dashed bg-emerald-500/10 text-foreground",
                                !isSelectedCorrect &&
                                  !isSelectedIncorrect &&
                                  !isUnselectedCorrect &&
                                  "border-border bg-background text-foreground"
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-7 w-7 flex-shrink-0 items-center justify-center border text-xs font-semibold",
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
                                  "place-self-center"
                                )}
                              >
                                {item.label}
                              </span>
                              <div className="flex min-w-0 flex-1 items-end justify-between gap-3">
                                <div
                                  className={cn(
                                    "question-html min-w-0 flex-1 leading-relaxed",
                                    mode === "dark"
                                      ? "question-html--blend-dark"
                                      : "question-html--blend-light"
                                  )}
                                  style={{ fontSize: zoomLevel * 1.15 + "rem" }}
                                  dangerouslySetInnerHTML={{
                                    __html: item.value ?? "",
                                  }}
                                  onClick={handleRichContentClick}
                                />
                                {optionCount !== null ? (
                                  <div className="flex flex-col items-end text-[10px] uppercase tracking-wide text-muted-foreground">
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
                  {hasPeerAnswerStats ? (
                    <div className="flex items-center justify-end text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>Unattempted (Others)</span>
                      <span className="ml-2 text-xs font-black text-foreground">
                        {peerAnswerStats?.unattempted ?? 0}
                      </span>
                    </div>
                  ) : null}
                  {hasPeerAnswerStats && question.qtype === "NAT" ? (
                    <div className="flex items-center justify-end gap-4 text-[10px] uppercase tracking-wide text-muted-foreground">
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
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button asChild variant="outline" disabled={!prev}>
                {prev ? (
                  <Link to={`/app/questions/${test.id}/${prev.question.id}`}>
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
              </Button>
              <Button asChild variant="outline" disabled={!next}>
                {next ? (
                  <Link to={`/app/questions/${test.id}/${next.question.id}`}>
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
        <Card className="app-panel h-full min-h-0 border-none">
          <CardContent className="flex h-full min-h-0 flex-col gap-4 p-2 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Answer review
            </p>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
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
                <Separator className="mt-3" />
                <div className="flex items-center justify-between transition-colors">
                  <span className="text-xs font-normal text-neutral-800 dark:text-neutral-300 uppercase tracking-widest">
                    Time Spent
                  </span>
                  <div className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 dark:bg-emerald-900/30 text-blue-600 dark:text-blue-400">
                    {formatSeconds(timeSpent)}
                  </div>
                </div>
                <div className="flex items-center justify-between transition-colors">
                  <span className="text-xs font-normal text-neutral-800 dark:text-neutral-300 uppercase tracking-widest">
                    Avg Time (Others)
                  </span>
                  <div className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 dark:bg-emerald-900/30 text-blue-600 dark:text-blue-400">
                    {peerTimeLabel}
                  </div>
                </div>
                {/* <div className="flex items-center justify-between">
                  <span>Your answer</span>
                  <span className="font-semibold text-foreground">
                    {formatAnswerValue(answer)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Correct key</span>
                  <span className="font-semibold text-foreground">
                    {formatAnswerValue(question.keyUpdate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Original key</span>
                  <span className="font-semibold text-foreground">
                    {formatAnswerValue(question.correctAnswer)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Marks</span>
                  <span className="font-semibold text-foreground">{score}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Time</span>
                  <span className="font-semibold text-foreground">
                    {formatSeconds(timeSpent)}
                  </span>
                </div> */}
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

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Key discussion
                </p>
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
                          chat.pinned ? "bg-amber-500/10" : "bg-background"
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
                              disabled={!isAdmin}
                              title={isAdmin ? "Toggle pin" : "Admins only"}
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
                                !isAdmin && currentUser?.name !== chat.author
                              }
                              title={
                                isAdmin || currentUser?.name === chat.author
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
              </div>

              {isAdmin ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="secondary">Update answer key</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Update answer key</DialogTitle>
                      <DialogDescription>
                        Add one or more valid answers. Each entry is treated as
                        OR.
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
                            keyUpdateBonus && "opacity-60"
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

                              {question.qtype === "NAT" ? (
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
                                          event.target.value
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
                                          event.target.value
                                        )
                                      }
                                      placeholder={
                                        group.min.trim() || "Same as start"
                                      }
                                      disabled={keyUpdateBonus}
                                    />
                                  </div>
                                </div>
                              ) : question.qtype === "MAQ" ? (
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
                                            "pointer-events-none"
                                        )}
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-3 w-3"
                                          checked={group.multi.includes(option)}
                                          onChange={() =>
                                            toggleMultiGroupOption(
                                              group.id,
                                              option
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
                                            "pointer-events-none"
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
                      <DialogFooter>
                        <Button type="submit">Save update</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only admins can update answer keys.
                </p>
              )}

              {message ? (
                <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                  {message}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

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
          overlayClassName="bg-black/80 backdrop-blur-none"
        >
          <div className="relative h-full w-full">
            <div className="absolute right-4 top-4 z-10">
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
                "relative flex h-full w-full touch-none items-center justify-center overflow-hidden cursor-grab"
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
