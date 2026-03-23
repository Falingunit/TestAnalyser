import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeTag, normalizeTags } from "@/lib/tags";

type TagInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  allowCustom?: boolean;
  lockedTags?: string[];
  disabled?: boolean;
  emptyMessage?: string;
};

const containsMatch = (item: string, query: string) =>
  item.toLowerCase().includes(query.toLowerCase());

export const TagInput = ({
  value,
  onChange,
  suggestions,
  placeholder = "Type tags",
  allowCustom = true,
  lockedTags = [],
  disabled = false,
  emptyMessage = "No matching tags",
}: TagInputProps) => {
  const [inputValue, setInputValue] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [showEmptyQuerySuggestions, setShowEmptyQuerySuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectableSuggestions = useMemo(() => {
    const query = normalizeTag(inputValue);
    const existing = new Set([...value, ...lockedTags]);
    return suggestions.filter((item) => {
      if (existing.has(item)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return containsMatch(item, query);
    });
  }, [inputValue, lockedTags, suggestions, value]);

  const shouldShowSuggestions =
    isFocused && (inputValue.length >= 1 || showEmptyQuerySuggestions);

  const commitTags = (next: string[]) => {
    onChange(normalizeTags(next));
    setInputValue("");
    setHighlightedIndex(0);
    setShowEmptyQuerySuggestions(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const addTag = (tag: string) => {
    const normalized = normalizeTag(tag);
    if (!normalized) {
      return;
    }
    if (!allowCustom && !suggestions.includes(normalized)) {
      return;
    }
    if (value.includes(normalized) || lockedTags.includes(normalized)) {
      setInputValue("");
      return;
    }
    commitTags([...value, normalized]);
  };

  const removeTag = (tag: string) => {
    commitTags(value.filter((item) => item !== tag));
  };

  const commitFromInput = (raw: string, allowPartial: boolean) => {
    const parts = raw.split(/\s+/);
    const trailingSpace = /\s$/.test(raw);
    const complete = trailingSpace || !allowPartial ? parts : parts.slice(0, -1);
    const remainder =
      trailingSpace || !allowPartial ? "" : (parts[parts.length - 1] ?? "");

    let next = [...value];
    complete.forEach((part) => {
      const normalized = normalizeTag(part);
      if (!normalized) {
        return;
      }
      if (!allowCustom && !suggestions.includes(normalized)) {
        return;
      }
      if (!next.includes(normalized) && !lockedTags.includes(normalized)) {
        next.push(normalized);
      }
    });

    if (next.length !== value.length) {
      onChange(normalizeTags(next));
    }
    setInputValue(remainder);
    setHighlightedIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!inputValue) {
        setShowEmptyQuerySuggestions(true);
      }
      setHighlightedIndex((current) =>
        selectableSuggestions.length === 0
          ? 0
          : Math.min(current + 1, selectableSuggestions.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!inputValue) {
        setShowEmptyQuerySuggestions(true);
      }
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (selectableSuggestions[highlightedIndex]) {
        addTag(selectableSuggestions[highlightedIndex]);
        return;
      }
      commitFromInput(inputValue, false);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      if (inputValue.trim()) {
        if (selectableSuggestions[highlightedIndex]) {
          addTag(selectableSuggestions[highlightedIndex]);
          return;
        }
        commitFromInput(inputValue, false);
        return;
      }
      setShowEmptyQuerySuggestions(true);
      if (selectableSuggestions.length > 0) {
        setHighlightedIndex((current) => {
          if (event.shiftKey) {
            return current <= 0 ? selectableSuggestions.length - 1 : current - 1;
          }
          return current >= selectableSuggestions.length - 1 ? 0 : current + 1;
        });
      }
      return;
    }
    if (event.key === "Backspace" && !inputValue && value.length > 0) {
      event.preventDefault();
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-background px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {lockedTags.map((tag) => (
            <Badge
              key={`locked-${tag}`}
              variant="secondary"
              className="border border-border/60"
            >
              {tag}
            </Badge>
          ))}
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {tag}
              {!disabled ? (
                <button
                  type="button"
                  className="rounded-full text-muted-foreground transition hover:text-foreground"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
          <Input
            value={inputValue}
            ref={inputRef}
            onChange={(event) => {
              const nextValue = event.target.value;
              setInputValue(nextValue);
              setShowEmptyQuerySuggestions(false);
              if (/\s/.test(nextValue)) {
                commitFromInput(nextValue, true);
              }
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsFocused(true);
            }}
            onBlur={() => {
              setTimeout(() => {
                setIsFocused(false);
                setShowEmptyQuerySuggestions(false);
                commitFromInput(inputValue, false);
              }, 120);
            }}
            disabled={disabled}
            placeholder={placeholder}
            className="h-8 min-w-[10rem] flex-1 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      {shouldShowSuggestions ? (
        <div className="rounded-lg border border-border bg-popover shadow-sm">
          {selectableSuggestions.length > 0 ? (
            <div className="max-h-52 overflow-y-auto p-1">
              {selectableSuggestions.map((tag, index) => (
                <button
                  key={tag}
                  type="button"
                  className={cn(
                    "flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition",
                    index === highlightedIndex
                      ? "bg-accent text-accent-foreground"
                      : "text-popover-foreground hover:bg-accent/60",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</p>
          )}
        </div>
      ) : null}
    </div>
  );
};
