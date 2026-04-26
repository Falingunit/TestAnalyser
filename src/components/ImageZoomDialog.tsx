import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ImageZoomDialogProps = {
  alt?: string;
  imageSrc: string | null;
  invertOnDark?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ImageZoomDialog = ({
  alt = "Image attachment",
  imageSrc,
  invertOnDark = false,
  open,
  onOpenChange,
}: ImageZoomDialogProps) => {
  const [imageZoom, setImageZoom] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
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

  const clampZoom = (value: number) => Math.min(4, Math.max(0.1, value));
  const dragThreshold = 4;

  const resetImageView = () => {
    setImageZoom(1);
    setImageOffset({ x: 0, y: 0 });
    activePointers.current.clear();
    pinchState.current = null;
    dragState.current = null;
    pointerStartRef.current = null;
    clickSuppressRef.current = false;
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

  const closeDialog = () => {
    onOpenChange(false);
    resetImageView();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
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
              "relative flex h-full w-full cursor-grab touch-none items-center justify-center overflow-hidden",
            )}
            onClick={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }
              if (clickSuppressRef.current) {
                clickSuppressRef.current = false;
                return;
              }
              closeDialog();
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
                alt={alt}
                className={cn(
                  "max-h-full max-w-full select-none",
                  invertOnDark && "invert",
                )}
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
  );
};
