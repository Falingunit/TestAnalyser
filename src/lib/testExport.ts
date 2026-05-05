import { buildDisplayQuestions } from "@/lib/questionDisplay";
import type { QuestionRecord, TestRecord } from "@/lib/types";
import {
  formatAnswerValue,
  getAnswerForQuestion,
  getQuestionMaxMarks,
  getQuestionMark,
  getQuestionStatus,
  getTimeForQuestion,
} from "@/lib/analysis";
import { formatQuestionType } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const sanitizeFileName = (value: string) =>
  Array.from(value.trim())
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 0 && code <= 31) {
        return "-";
      }
      return char;
    })
    .join("")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "question-paper";

const formatExamDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return dateFormatter.format(parsed);
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

const getQuestionOptions = (question: QuestionRecord) =>
  [
    { label: "A", html: question.optionContentA },
    { label: "B", html: question.optionContentB },
    { label: "C", html: question.optionContentC },
    { label: "D", html: question.optionContentD },
  ].filter((item) => htmlHasVisibleContent(item.html));

const toOptionLabels = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim().toUpperCase())
      .filter(Boolean);
  }
  if (typeof value !== "string") {
    return [];
  }
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return [];
  }
  if (normalized.includes(",")) {
    return normalized
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (/^[A-D]+$/.test(normalized)) {
    return normalized.split("");
  }
  return [normalized];
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildExportQuestions = (test: TestRecord) =>
  buildDisplayQuestions(test.questions).map(({ question, displayNumber }) => {
    const selectedAnswer = getAnswerForQuestion(test, question);
    const status = getQuestionStatus(test, question);
    const marksAwarded = getQuestionMark(test, question);
    const timeSpentSeconds = getTimeForQuestion(test, question);
    const selectedOptionLabels = new Set(toOptionLabels(selectedAnswer));
    const correctOptionLabels = new Set(toOptionLabels(question.keyUpdate));

    return {
      id: question.id,
      number: displayNumber,
      sourceNumber: question.questionNumber,
      subject: question.subject,
      type: question.qtype,
      typeLabel: formatQuestionType(question.qtype),
      marks: {
        correct: getQuestionMaxMarks(question),
        incorrect: question.incorrectMarking,
        unattempted: question.unattemptedMarking,
        hasPartial: question.hasPartial,
        awarded: marksAwarded,
      },
      result: {
        status,
        selectedAnswer,
        selectedAnswerLabel: formatAnswerValue(selectedAnswer),
        correctAnswer: question.keyUpdate,
        correctAnswerLabel: formatAnswerValue(question.keyUpdate),
        timeSpentSeconds,
        bookmarked: Boolean(test.bookmarks[question.id]),
      },
      sharedPassageHtml: question.sharedPassageContent,
      questionHtml: question.questionContent,
      options: getQuestionOptions(question).map((option) => ({
        label: option.label,
        html: option.html ?? "",
        picked: selectedOptionLabels.has(option.label),
        correct: correctOptionLabels.has(option.label),
      })),
      mtqStatements:
        question.qtype === "MTQ"
          ? {
              P: question.mtqStatementP,
              Q: question.mtqStatementQ,
              R: question.mtqStatementR,
              S: question.mtqStatementS,
            }
          : null,
    };
  });

const buildQuestionPaperHtml = (test: TestRecord) => {
  const questions = buildDisplayQuestions(test.questions);
  const title = escapeHtml(test.title);
  const examDate = escapeHtml(formatExamDate(test.examDate));
  const totalQuestions = questions.length;
  const markingRows = Object.entries(test.markingScheme ?? {})
    .map(
      ([qtype, marking]) =>
        `<div>${escapeHtml(formatQuestionType(qtype))}: +${marking.correct}, ${marking.incorrect}, ${marking.unattempted}</div>`,
    )
    .join("");
  const body = questions
    .map(({ question, displayNumber }) => {
      const sharedPassage = htmlHasVisibleContent(question.sharedPassageContent)
        ? `
          <div class="shared-passage-block">
            <div class="shared-passage-label">Shared passage</div>
            <div class="question-html">${question.sharedPassageContent ?? ""}</div>
          </div>
        `
        : ""
      const options = getQuestionOptions(question)
        .map(
          (option) => `
            <div class="option-row">
              <div class="option-label">${option.label}.</div>
              <div class="option-body question-html">${option.html ?? ""}</div>
            </div>
          `,
        )
        .join("");
      const mtqStatements =
        question.qtype === "MTQ"
          ? (
              [
                ["P", question.mtqStatementP],
                ["Q", question.mtqStatementQ],
                ["R", question.mtqStatementR],
                ["S", question.mtqStatementS],
              ] as const
            )
              .filter(([, html]) => htmlHasVisibleContent(html))
              .map(
                ([label, html]) => `
                  <div class="option-row">
                    <div class="option-label">${label}.</div>
                    <div class="option-body question-html">${html ?? ""}</div>
                  </div>
                `,
              )
              .join("")
          : "";

      const meta = [
        question.subject,
        formatQuestionType(question.qtype),
        `+${getQuestionMaxMarks(question)}`,
        String(question.incorrectMarking),
      ].join(" | ");
      const answerMeta = [
        `Correct answer: ${formatAnswerValue(question.keyUpdate)}`,
        `Unattempted: ${question.unattemptedMarking}`,
        question.hasPartial ? "Partial marking enabled" : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return `
        <article class="question-block">
          <div class="question-head">
            <div>
              <h2>Question ${displayNumber}</h2>
              <p>${escapeHtml(meta)}</p>
            </div>
          </div>
          ${sharedPassage}
          <div class="question-body question-html">${question.questionContent}</div>
          ${mtqStatements ? `<div class="options-grid">${mtqStatements}</div>` : ""}
          ${options ? `<div class="options-grid">${options}</div>` : ""}
          <div class="answer-strip">
            <strong>Answer key</strong>
            <span>${escapeHtml(answerMeta)}</span>
          </div>
        </article>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} - Question Paper</title>
    <style>
      @page {
        size: A4;
        margin: 16mm 14mm;
      }
      :root {
        color-scheme: light;
        --ink: #111111;
        --muted: #555555;
        --border: #cccccc;
        --surface: #ffffff;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        color: var(--ink);
        background: var(--surface);
        font-family: "Georgia", "Times New Roman", serif;
        line-height: 1.45;
      }
      .paper {
        width: 100%;
        max-width: 190mm;
        margin: 0 auto;
      }
      .paper-header {
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border);
      }
      .paper-header h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1.2;
      }
      .paper-header p {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 14px;
      }
      .question-list {
        margin-top: 18px;
      }
      .marking-scheme {
        margin-top: 12px;
        font-size: 13px;
        color: var(--muted);
      }
      .marking-scheme strong {
        color: var(--ink);
      }
      .question-block {
        break-inside: avoid;
        page-break-inside: avoid;
        padding: 14px 0;
        margin-bottom: 10px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
      }
      .question-head {
        margin-bottom: 10px;
      }
      .question-head h2 {
        margin: 0;
        font-size: 16px;
      }
      .question-head p {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 12px;
      }
      .question-body {
        font-size: 15px;
      }
      .shared-passage-block {
        margin-bottom: 10px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        background: #f8f8f8;
      }
      .shared-passage-label {
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .options-grid {
        margin-top: 10px;
        display: grid;
        gap: 8px;
      }
      .option-row {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        padding: 2px 0;
      }
      .option-label {
        font-weight: 700;
      }
      .answer-strip {
        margin-top: 10px;
        font-size: 13px;
      }
      .answer-strip span {
        color: var(--muted);
      }
      .question-html img {
        max-width: 100%;
        height: auto;
      }
      .question-html mjx-container[jax="SVG"] {
        display: inline-block;
        margin: 0;
        vertical-align: middle;
      }
      .question-html mjx-container[jax="SVG"][display="true"] {
        display: block;
        margin: 1em 0;
      }
      @media print {
        .question-block {
          box-shadow: none;
        }
      }
    </style>
    <script>
      window.MathJax = {
        tex: {
          inlineMath: [["$", "$"], ["\\\\(", "\\\\)"]],
          displayMath: [["$$", "$$"], ["\\\\[", "\\\\]"]],
          processEscapes: true
        },
        svg: { fontCache: "global" },
        startup: { typeset: false }
      };

      const waitForImages = () =>
        Promise.all(
          Array.from(document.images)
            .filter((image) => !image.complete)
            .map(
              (image) =>
                new Promise((resolve) => {
                  image.addEventListener("load", resolve, { once: true });
                  image.addEventListener("error", resolve, { once: true });
                }),
            ),
        );

      let printStarted = false;

      const runPrint = async () => {
        if (printStarted) {
          return;
        }
        printStarted = true;
        await waitForImages();
        if (window.MathJax?.typesetPromise) {
          try {
            await Promise.race([
              window.MathJax.typesetPromise(),
              new Promise((resolve) => window.setTimeout(resolve, 2000)),
            ]);
          } catch {
            // Printing can continue without MathJax if the CDN fails.
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        window.focus();
        window.print();
      };

      window.addEventListener("load", () => {
        window.setTimeout(() => {
          if (!printStarted) {
            void runPrint();
          }
        }, 1200);

        const script = document.getElementById("mathjax-script");
        if (!script) {
          void runPrint();
          return;
        }
        if (window.MathJax?.typesetPromise) {
          void runPrint();
          return;
        }
        script.addEventListener("load", () => void runPrint(), { once: true });
        script.addEventListener("error", () => void runPrint(), { once: true });
      });

      window.addEventListener("afterprint", () => {
        window.close();
      });
    </script>
    <script
      id="mathjax-script"
      async
      src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"
    ></script>
  </head>
  <body>
    <main class="paper">
      <header class="paper-header">
        <h1>${title}</h1>
        <p>${examDate} | ${totalQuestions} questions</p>
        ${
          markingRows
            ? `<div class="marking-scheme"><strong>Marking scheme:</strong> ${markingRows}</div>`
            : ""
        }
      </header>
      <section class="question-list">${body}</section>
    </main>
  </body>
</html>`;
};

const downloadBlob = (payload: BlobPart, filename: string, type: string) => {
  const blob = new Blob([payload], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const downloadQuestionPaperJson = (test: TestRecord) => {
  const payload = {
    exportedAt: new Date().toISOString(),
    paper: {
      id: test.id,
      title: test.title,
      examDate: test.examDate,
      examDateLabel: formatExamDate(test.examDate),
      totalQuestions: test.questions.length,
      questions: buildExportQuestions(test),
    },
  };

  downloadBlob(
    JSON.stringify(payload, null, 2),
    `${sanitizeFileName(test.title)}-question-paper.json`,
    "application/json",
  );
};

export const exportQuestionPaperPdf = async (test: TestRecord) => {
  const popup = window.open("", "_blank");
  if (!popup) {
    return {
      ok: false as const,
      message: "Popup blocked. Allow popups to export the PDF.",
    };
  }
  popup.document.open();
  popup.document.write(buildQuestionPaperHtml(test));
  popup.document.close();

  return { ok: true as const };
};
