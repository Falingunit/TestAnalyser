import { useId, useRef, useState, type ClipboardEvent } from "react";
import { ImagePlus, Loader2, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

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

type MarkdownComposerProps = {
  disabled?: boolean;
  onMessage?: (message: string | null) => void;
  onUploadStateChange?: (uploading: boolean) => void;
  onTempImageAdded?: (url: string) => void;
  onUploadImage: (dataUrl: string) => Promise<{
    ok: boolean;
    url?: string;
    message?: string;
  }>;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
};

export const MarkdownComposer = ({
  disabled = false,
  onMessage,
  onUploadStateChange,
  onTempImageAdded,
  onUploadImage,
  placeholder,
  value,
  onChange,
}: MarkdownComposerProps) => {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const valueRef = useRef(value);
  const [activeTab, setActiveTab] = useState("write");
  const [isUploading, setIsUploading] = useState(false);

  valueRef.current = value;

  const insertImageMarkdown = (imageUrl: string, altText = "image") => {
    const textarea = textareaRef.current;
    const currentValue = textarea?.value ?? valueRef.current;
    const selectionStart = textarea?.selectionStart ?? currentValue.length;
    const selectionEnd = textarea?.selectionEnd ?? currentValue.length;
    const insertion = insertTextAtSelection(
      currentValue,
      selectionStart,
      selectionEnd,
      `\n\n![${altText}](${imageUrl})\n\n`,
    );
    onChange(insertion.value);
    onTempImageAdded?.(imageUrl);
    onMessage?.(null);

    window.requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) {
        return;
      }
      target.focus();
      target.selectionStart = insertion.cursor;
      target.selectionEnd = insertion.cursor;
    });
  };

  const uploadFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      onMessage?.("Only image files can be uploaded.");
      return;
    }

    setIsUploading(true);
    onUploadStateChange?.(true);
    try {
      for (const file of imageFiles) {
        const dataUrl = await fileToDataUrl(file);
        const result = await onUploadImage(dataUrl);
        if (!result.ok || !result.url) {
          onMessage?.(result.message ?? "Unable to upload image.");
          return;
        }
        const altText = file.name.replace(/\.[a-z0-9]+$/i, "").trim() || "image";
        insertImageMarkdown(result.url, altText);
      }
    } catch (error) {
      onMessage?.(
        error instanceof Error ? error.message : "Unable to upload image.",
      );
    } finally {
      setIsUploading(false);
      onUploadStateChange?.(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((item): item is File => Boolean(item));

    if (imageFiles.length === 0 || disabled) {
      return;
    }

    event.preventDefault();
    await uploadFiles(imageFiles);
  };

  const handlePasteButton = async () => {
    if (disabled) {
      return;
    }
    if (!navigator.clipboard?.read) {
      onMessage?.("Clipboard image paste is not supported in this browser.");
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
        files.push(new File([blob], `clipboard-image.${imageType.split("/")[1] ?? "png"}`, { type: imageType }));
      }

      if (files.length === 0) {
        onMessage?.("No image was found on the clipboard.");
        return;
      }

      await uploadFiles(files);
    } catch (error) {
      onMessage?.(
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

      onChange(newValue);

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
          id={inputId}
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) =>
            void uploadFiles(Array.from(event.target.files ?? []))
          }
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
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
          disabled={disabled || isUploading}
          onClick={() => void handlePasteButton()}
        >
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Paste image
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview" disabled={isUploading}>
            Preview
          </TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="mt-0">
          <Textarea
            ref={textareaRef}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(event) => void handlePaste(event)}
            placeholder={placeholder}
            className="min-h-[180px] resize-y"
          />
        </TabsContent>
        <TabsContent value="preview" className="mt-0">
          <div className="min-h-[180px] rounded-xl border border-border/60 bg-muted/20 p-4">
            {value.trim() ? (
              <MarkdownRenderer
                markdown={value}
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
    </div>
  );
};
