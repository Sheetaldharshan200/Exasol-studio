import { generateId, type AttachmentAdapter, type CompleteAttachment, type PendingAttachment } from "@assistant-ui/react";
import { OpenCodeAttachmentAdapter } from "@assistant-ui/react-opencode";
import { ipc } from "@/lib/ipc";
import { buildDataFileNote, routeAttachment } from "./attachment-routing";
import { wrapMachineContext } from "./context";

/**
 * The composer's attachment adapter, wrapping the stock OpenCode one:
 * images/PDFs/small text keep the inline data-URL path; DATA files
 * (csv/tsv/parquet/xlsx/…) and oversized text are saved to disk and the
 * message carries only a short path note — ten (or ten thousand) CSVs never
 * inline megabytes into the prompt. Routing rules: attachment-routing.ts.
 */
export class StudioAttachmentAdapter implements AttachmentAdapter {
  private base = new OpenCodeAttachmentAdapter();
  // The stock accept list has no binary table formats — add them.
  accept = `${this.base.accept},.parquet,.xlsx,.xls,.jsonl,.ndjson`;

  async add(state: { file: File }): Promise<PendingAttachment> {
    if (routeAttachment(state.file.name, state.file.size) === "disk") {
      return {
        id: generateId(),
        type: "file",
        name: state.file.name,
        contentType: state.file.type || "application/octet-stream",
        file: state.file,
        status: { type: "requires-action", reason: "composer-send" },
      };
    }
    return this.base.add(state);
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    if (routeAttachment(attachment.file.name, attachment.file.size) !== "disk") {
      return this.base.send(attachment);
    }
    const path = await ipc.saveAttachment(attachment.file.name, await fileToBase64(attachment.file));
    // Header preview only for text-like data — binary formats get path+size.
    const textLike = /\.(csv|tsv|jsonl|ndjson)$/i.test(attachment.file.name);
    const firstLines = textLike
      ? (await attachment.file.slice(0, 4096).text().catch(() => "")).split(/\r?\n/).slice(0, 3)
      : undefined;
    // Sentinel-wrapped: the model reads the note, the rendered user message
    // shows only the attachment chip and what the user actually typed.
    const note = wrapMachineContext(buildDataFileNote(path, attachment.file.name, attachment.file.size, firstLines));
    return {
      ...attachment,
      status: { type: "complete" },
      content: [{ type: "text", text: note }],
    };
  }

  async remove(): Promise<void> {}
}

/** File → raw base64 via FileReader (data-URL, prefix stripped) — the same
 *  encoding `save_attachment` expects; streams from disk, no manual chunking. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}
