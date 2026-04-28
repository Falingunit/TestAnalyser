import { useEffect, useRef, useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { ImageZoomDialog } from "@/components/ImageZoomDialog";
import { cn } from "@/lib/utils";
import { typesetMathInElement } from "@/lib/mathJax";

type MarkdownRendererProps = {
  className?: string;
  imageZoomAlt?: string;
  imageZoomInvertOnDark?: boolean;
  markdown: string;
};

const normalizeChatGptMathDelimiters = (markdown: string) => {
  const lines = markdown.split(/\r?\n/);
  let inFencedCodeBlock = false;
  const normalizedLines: string[] = [];

  const looksLikeMathBlock = (blockLines: string[]) => {
    const content = blockLines.join("\n").trim();
    if (!content) {
      return false;
    }

    return (
      /\\[a-zA-Z]+/.test(content) ||
      /[=^_]/.test(content) ||
      /\d/.test(content) ||
      /[+\-*/<>]/.test(content)
    );
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedLine = line.trim();

    if (/^(```|~~~)/.test(trimmedLine)) {
      inFencedCodeBlock = !inFencedCodeBlock;
      normalizedLines.push(line);
      continue;
    }

    if (inFencedCodeBlock) {
      normalizedLines.push(line);
      continue;
    }

    if (trimmedLine === "[") {
      let closingIndex = -1;
      for (let candidateIndex = index + 1; candidateIndex < lines.length; candidateIndex += 1) {
        if (lines[candidateIndex].trim() === "]") {
          closingIndex = candidateIndex;
          break;
        }
      }

      if (closingIndex !== -1) {
        const blockLines = lines.slice(index + 1, closingIndex);
        if (looksLikeMathBlock(blockLines)) {
          normalizedLines.push("\\[");
          normalizedLines.push(...blockLines);
          normalizedLines.push("\\]");
          index = closingIndex;
          continue;
        }
      }
    }

    normalizedLines.push(line);
  }

  return normalizedLines.join("\n");
};

export const MarkdownRenderer = memo(({
  className,
  imageZoomAlt,
  imageZoomInvertOnDark = false,
  markdown,
}: MarkdownRendererProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [zoomedImageSrc, setZoomedImageSrc] = useState<string | null>(null);
  const normalizedMarkdown = normalizeChatGptMathDelimiters(markdown);

  useEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    // Use requestAnimationFrame to ensure the DOM has been painted and is stable
    const rafId = window.requestAnimationFrame(() => {
      void (async () => {
        try {
          if (cancelled) return;
          await typesetMathInElement(container);
        } catch (error) {
          if (!cancelled) {
            console.error(error);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [normalizedMarkdown]);

  return (
    <>
      <div ref={ref} className={cn("markdown-body tex2jax_process", className)}>
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
          components={{
            span: ({ className, children }) => {
              if (String(className ?? "").includes("math-inline")) {
                return <span className={className}>${children}$</span>;
              }
              return <span className={className}>{children}</span>;
            },
            div: ({ className, children }) => {
              if (String(className ?? "").includes("math-display")) {
                return <span className={className}>$${children}$$</span>;
              }
              return <div className={className}>{children}</div>;
            },
            a: ({ className: linkClassName, ...props }) => (
              <a
                {...props}
                className={cn(
                  "text-sky-600 underline underline-offset-4 dark:text-sky-400",
                  linkClassName,
                )}
                target="_blank"
                rel="noreferrer"
              />
            ),
            img: ({ className: imageClassName, alt, src, ...props }) => (
              <img
                {...props}
                src={src}
                alt={alt ?? ""}
                className={cn(
                  "my-3 max-h-[26rem] w-auto max-w-full cursor-zoom-in rounded-xl border border-border/60 bg-background object-contain",
                  imageClassName,
                )}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (typeof src === "string" && src) {
                    setZoomedImageSrc(src);
                  }
                }}
              />
            ),
            code: ({ className: codeClassName, children, ...props }) => {
              const classNameString = String(codeClassName ?? "");
              const isInline = !classNameString.includes("language-");
              const isMath =
                classNameString.includes("language-math") ||
                classNameString.includes("math-inline") ||
                classNameString.includes("math-display");

              if (isMath) {
                const isDisplay =
                  classNameString.includes("math-display") || !isInline;
                const content = String(children).trim();
                return isDisplay ? (
                  <span className="math-display">
                    $${content}$$
                  </span>
                ) : (
                  <span className="math-inline">
                    ${content}$
                  </span>
                );
              }

              if (isInline) {
                return (
                  <code
                    {...props}
                    className={cn(
                      "rounded bg-muted px-1 py-0.5 text-[0.9em]",
                      codeClassName,
                    )}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code
                  {...props}
                  className={cn("block whitespace-pre-wrap text-sm", codeClassName)}
                >
                  {children}
                </code>
              );
            },
            pre: ({ className: preClassName, ...props }) => (
              <pre
                {...props}
                className={cn(
                  "overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-3",
                  preClassName,
                )}
              />
            ),
            blockquote: ({ className: quoteClassName, ...props }) => (
              <blockquote
                {...props}
                className={cn(
                  "border-l-2 border-border pl-4 text-muted-foreground",
                  quoteClassName,
                )}
              />
            ),
            ul: ({ className: listClassName, ...props }) => (
              <ul
                {...props}
                className={cn("list-disc space-y-1 pl-5", listClassName)}
              />
            ),
            ol: ({ className: listClassName, ...props }) => (
              <ol
                {...props}
                className={cn("list-decimal space-y-1 pl-5", listClassName)}
              />
            ),
          }}
        >
          {normalizedMarkdown}
        </ReactMarkdown>
      </div>
      <ImageZoomDialog
        alt={imageZoomAlt}
        imageSrc={zoomedImageSrc}
        invertOnDark={imageZoomInvertOnDark}
        open={zoomedImageSrc !== null}
        onOpenChange={(open) => {
          if (!open) {
            setZoomedImageSrc(null);
          }
        }}
      />
    </>
  );
});

MarkdownRenderer.displayName = "MarkdownRenderer";
