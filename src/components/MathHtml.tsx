import { useEffect, useRef, type CSSProperties, type MouseEventHandler } from "react";
import { typesetMathInElement } from "@/lib/mathJax";
import { cn } from "@/lib/utils";

type MathHtmlProps = {
  className?: string;
  html: string;
  onClick?: MouseEventHandler<HTMLElement>;
  style?: CSSProperties;
};

export const MathHtml = ({
  className,
  html,
  onClick,
  style,
}: MathHtmlProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const renderMath = async () => {
      const container = ref.current;
      if (!container) {
        return;
      }

      container.innerHTML = html;

      try {
        await typesetMathInElement(container);
        if (cancelled) {
          return;
        }
      } catch (error) {
        console.error(error);
      }
    };

    void renderMath();

    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <div
      ref={ref}
      className={cn("tex2jax_process", className)}
      style={style}
      onClick={onClick}
    />
  );
};
