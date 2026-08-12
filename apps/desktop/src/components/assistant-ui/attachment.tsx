"use client";

import {
  type PropsWithChildren,
  useEffect,
  useState,
  type FC,
  isValidElement,
} from "react";
import {
  XIcon,
  PlusIcon,
  FileText,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui,
} from "@assistant-ui/react";
import { useShallow } from "zustand/shallow";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { cn } from "@/lib/utils";

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== "image") return {};
      if (s.attachment.file) return { file: s.attachment.file };
      const src = s.attachment.content?.filter((c) => c.type === "image")[0]
        ?.image;
      if (!src) return {};
      return { src };
    }),
  );

  return useFileSrc(file) ?? src;
};

type AttachmentPreviewProps = {
  src: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt="Attachment preview"
      className={cn(
        "block h-auto max-h-[80vh] w-auto max-w-full rounded-sm object-contain transition-opacity duration-300 motion-reduce:transition-none",
        isLoaded
          ? "aui-attachment-preview-image-loaded opacity-100"
          : "aui-attachment-preview-image-loading opacity-0",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();

  if (!src) return children;

  return (
    <Dialog>
      {/* Radix dialog: asChild instead of the base-ui `render`/`nativeButton` API. */}
      <DialogTrigger asChild className="aui-attachment-preview-trigger cursor-zoom-in">
        {isValidElement(children) ? children : <button type="button" />}
      </DialogTrigger>
      <DialogContent className="aui-attachment-preview-dialog-content [&>button]:bg-foreground/60 [&>button]:hover:bg-foreground/80 [&_svg]:text-background p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0!">
        <DialogTitle className="aui-sr-only sr-only">
          Image Attachment Preview
        </DialogTitle>
        <div className="aui-attachment-preview bg-background relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden rounded-sm">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Decode a data: URL into text (attachment payloads ride as data URLs). */
function dataUrlToText(url: string): string | null {
  try {
    const comma = url.indexOf(",");
    if (!url.startsWith("data:") || comma === -1) return null;
    const meta = url.slice(0, comma);
    const payload = url.slice(comma + 1);
    const bytes = meta.includes(";base64") ? atob(payload) : decodeURIComponent(payload);
    return new TextDecoder().decode(Uint8Array.from(bytes, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

const AttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";
  const src = useAttachmentSrc();
  const name = useAuiState((s) => s.attachment.name);
  const file = useAuiState((s) => s.attachment.file);
  const fileData = useAuiState((s) => {
    const part = s.attachment.content?.find((c) => c.type === "file");
    return part && "data" in part ? (part.data as string) : undefined;
  });

  // Clicking a FILE card opens its content as a workspace tab (images keep
  // the zoom dialog instead).
  const openInTab = async () => {
    const text = file ? await file.text().catch(() => null) : fileData ? dataUrlToText(fileData) : null;
    if (text == null) return;
    window.dispatchEvent(new CustomEvent("studio:open-text-tab", { detail: { name, content: text } }));
  };

  const typeLabel = useAuiState((s) => {
    const type = s.attachment.type;
    switch (type) {
      case "image":
        return "Image";
      case "document":
        return "Document";
      case "file":
        return "File";
      default:
        return type;
    }
  });
  const ext = (name ?? "").split(".").pop()?.toUpperCase();
  const uploadState = useAuiState((s) =>
    s.attachment.status.type === "running"
      ? "uploading"
      : s.attachment.status.type === "incomplete" &&
          s.attachment.status.reason === "error"
        ? "error"
        : undefined,
  );
  const errorMessage = useAuiState((s) =>
    s.attachment.status.type === "incomplete" &&
    s.attachment.status.reason === "error"
      ? (s.attachment.status.message ?? "Upload failed")
      : undefined,
  );
  const meta =
    uploadState === "uploading"
      ? "Uploading…"
      : uploadState === "error"
        ? errorMessage
        : ext && ext !== name?.toUpperCase()
          ? `${ext} · ${typeLabel}`
          : typeLabel;

  return (
    <AttachmentPrimitive.Root
      className={cn(
        "aui-attachment-root",
        isComposer && "animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none",
      )}
    >
      <Attachment className={cn("max-w-56", uploadState === "error" && "border-destructive/60")}>
        <AttachmentPreviewDialog>
          {src ? (
            <AttachmentMedia variant="image" className="cursor-zoom-in">
              <img src={src} alt={name ?? "Attachment"} />
            </AttachmentMedia>
          ) : (
            <AttachmentMedia
              role="button"
              tabIndex={0}
              title="Open in a new tab"
              className="cursor-pointer"
              onClick={() => void openInTab()}
            >
              {uploadState === "uploading" ? (
                <Loader2Icon className="animate-spin" />
              ) : uploadState === "error" ? (
                <AlertCircleIcon className="text-destructive" />
              ) : (
                <FileText />
              )}
            </AttachmentMedia>
          )}
        </AttachmentPreviewDialog>
        <AttachmentContent
          role="button"
          tabIndex={0}
          title={src ? undefined : "Open in a new tab"}
          className={cn(!src && "cursor-pointer")}
          onClick={src ? undefined : () => void openInTab()}
        >
          <AttachmentTitle>
            <AttachmentPrimitive.Name />
          </AttachmentTitle>
          <AttachmentDescription className={cn(uploadState === "error" && "text-destructive")}>{meta}</AttachmentDescription>
        </AttachmentContent>
        {isComposer ? (
          <AttachmentActions>
            <AttachmentPrimitive.Remove render={<AttachmentAction aria-label={`Remove ${name ?? "attachment"}`} />}>
              <XIcon />
            </AttachmentPrimitive.Remove>
          </AttachmentActions>
        ) : null}
      </Attachment>
    </AttachmentPrimitive.Root>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin]">
      <MessagePrimitive.Attachments>
        {() => <AttachmentUI />}
      </MessagePrimitive.Attachments>
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments flex w-full flex-row items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin] empty:hidden">
      <ComposerPrimitive.Attachments>
        {() => <AttachmentUI />}
      </ComposerPrimitive.Attachments>
    </div>
  );
};

export const ComposerAddAttachment: FC = () => {
  return (
    <ComposerPrimitive.AddAttachment
      render={
        <TooltipIconButton
          tooltip="Attach files or photos (multi-select)"
          side="bottom"
          variant="ghost"
          size="icon"
          className="aui-composer-add-attachment hover:bg-muted size-7 rounded-full border border-border/60 p-1 text-muted-foreground hover:text-foreground active:scale-[0.96] motion-reduce:transition-none"
          aria-label="Attach files or photos"
        />
      }
    >
      <PlusIcon className="aui-attachment-add-icon size-4.5 stroke-[1.5px]" />
    </ComposerPrimitive.AddAttachment>
  );
};

