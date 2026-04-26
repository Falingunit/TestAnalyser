import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
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

export const MarkdownRenderer = ({
  className,
  imageZoomAlt,
  imageZoomInvertOnDark = false,
  markdown,
}: MarkdownRendererProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [zoomedImageSrc, setZoomedImageSrc] = useState<string | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await typesetMathInElement(container);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [markdown]);

  return (
    <>
      <div ref={ref} className={cn("markdown-body", className)}>
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm, remarkMath]}
          components={{
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
              const isInline = !String(codeClassName ?? "").includes("language-");
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
          {markdown}
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
};
