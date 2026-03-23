import type { QuestionRecord, TestRecord } from "@/lib/types";

export const normalizeTag = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export const normalizeTags = (values: string[]) => {
  const deduped = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeTag(value);
    if (normalized) {
      deduped.add(normalized);
    }
  });
  return Array.from(deduped);
};

export const getDefaultQuestionTags = (
  question: Pick<QuestionRecord, "subject">,
  testTitle: string,
) => {
  const normalizedTitle = normalizeTag(testTitle);
  return normalizeTags([
    question.subject,
    normalizedTitle,
  ]);
};

export const getQuestionSearchTags = (
  question: Pick<QuestionRecord, "subject" | "tags" | "lockedTags">,
  testTitle: string,
) =>
  normalizeTags([
    ...question.tags,
    ...question.lockedTags,
    ...getDefaultQuestionTags(question, testTitle),
  ]);

export const collectKnownTags = (tests: TestRecord[]) => {
  const all = new Set<string>();
  tests.forEach((test) => {
    test.questions.forEach((question) => {
      getQuestionSearchTags(question, test.title).forEach((tag) => {
        all.add(tag);
      });
    });
  });
  return Array.from(all).sort((a, b) => a.localeCompare(b));
};

export const collectPersistedTags = (tests: TestRecord[]) => {
  const all = new Set<string>();
  tests.forEach((test) => {
    test.questions.forEach((question) => {
      normalizeTags([...question.tags, ...question.lockedTags]).forEach((tag) => {
        all.add(tag);
      });
    });
  });
  return Array.from(all).sort((a, b) => a.localeCompare(b));
};

export const matchesTagFilter = (
  question: Pick<QuestionRecord, "subject" | "tags" | "lockedTags">,
  testTitle: string,
  selectedTags: string[],
) => {
  if (selectedTags.length === 0) {
    return true;
  }
  const tagSet = new Set(getQuestionSearchTags(question, testTitle));
  return selectedTags.every((tag) => tagSet.has(tag));
};
