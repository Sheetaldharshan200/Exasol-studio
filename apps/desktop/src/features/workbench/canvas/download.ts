// Saving a box's rows or picture from the webview, the way the results panel does.

export function downloadText(name: string, text: string, mime = "text/plain;charset=utf-8;"): void {
  const blob = new Blob([text], { type: mime });
  downloadUrl(name, URL.createObjectURL(blob), true);
}

export function downloadUrl(name: string, url: string, revoke = false): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name from a box title: letters, digits, dots and dashes. */
export function fileName(title: string, ext: string): string {
  const base = title.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "rows";
  return `${base}.${ext}`;
}
