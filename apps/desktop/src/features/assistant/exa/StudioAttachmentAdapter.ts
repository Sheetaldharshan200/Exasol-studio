import { generateId, type AttachmentAdapter, type CompleteAttachment, type PendingAttachment } from "@assistant-ui/react";
import { OpenCodeAttachmentAdapter } from "@assistant-ui/react-opencode";
import { ipc } from "@/lib/ipc";
import { buildDataFileNote, buildFolderNote, routeAttachment } from "./attachment-routing";
import { FOLDER_MIME, folderFiles, isFolderAttachment, readFolderManifest, releaseFolder } from "./folder-attachment";
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
    // A whole folder rides as one synthetic attachment → one chip.
    if (isFolderAttachment(state.file)) {
      return {
        id: generateId(),
        type: "file",
        name: state.file.name,
        contentType: FOLDER_MIME,
        file: state.file,
        status: { type: "requires-action", reason: "composer-send" },
      };
    }
    if (routeAttachment(state.file.name, state.file.size) === "disk") {
      return {
        id: generateId(),
        type: "file",
        // Keep the folder-relative path (from the folder picker) as the name so
        // the chip and the note show WHICH subfolder a file came from, and two
        // same-named CSVs in different subfolders don't collide on disk.
        name: relName(state.file),
        contentType: state.file.type || "application/octet-stream",
        file: state.file,
        status: { type: "requires-action", reason: "composer-send" },
      };
    }
    return this.base.add(state);
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    // Folder attachment: save every file in the group to disk (keeping the
    // subfolder in the name so nothing collides) and emit ONE note listing them.
    if (isFolderAttachment(attachment.file)) {
      const manifest = await readFolderManifest(attachment.file);
      const files = manifest ? folderFiles(manifest.groupId) : [];
      const items: { name: string; size: number; path: string }[] = [];
      try {
        for (const f of files) {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
          const path = await ipc.saveAttachment(rel, await fileToBase64(f));
          items.push({ name: rel, size: f.size, path });
        }
      } finally {
        // Always drop the in-memory File[] — even if a save failed partway — so
        // large folder picks can't accumulate in memory.
        if (manifest) releaseFolder(manifest.groupId);
      }
      const folder = manifest?.folder ?? attachment.name;
      const note = wrapMachineContext(buildFolderNote(folder, items));
      return { ...attachment, status: { type: "complete" }, content: [{ type: "text", text: note }] };
    }
    if (routeAttachment(attachment.file.name, attachment.file.size) !== "disk") {
      return this.base.send(attachment);
    }
    const logicalName = relName(attachment.file);
    const path = await ipc.saveAttachment(logicalName, await fileToBase64(attachment.file));
    // Header preview only for text-like data — binary formats get path+size.
    const textLike = /\.(csv|tsv|jsonl|ndjson)$/i.test(attachment.file.name);
    const firstLines = textLike
      ? (await attachment.file.slice(0, 4096).text().catch(() => "")).split(/\r?\n/).slice(0, 3)
      : undefined;
    // Sentinel-wrapped: the model reads the note, the rendered user message
    // shows only the attachment chip and what the user actually typed.
    const note = wrapMachineContext(buildDataFileNote(path, logicalName, attachment.file.size, firstLines));
    return {
      ...attachment,
      status: { type: "complete" },
      content: [{ type: "text", text: note }],
    };
  }

  async remove(): Promise<void> {}
}

/** The folder-relative path when a file came from the folder picker
 *  (webkitRelativePath, e.g. "datasets/sales/2024.csv"), else the bare name.
 *  This is the logical name — it preserves subfolder structure so the model can
 *  group a dataset and map each subfolder to its own schema. */
function relName(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return rel && rel.trim() ? rel : file.name;
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
