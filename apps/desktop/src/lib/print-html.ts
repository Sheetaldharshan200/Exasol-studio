// Print an HTML document through the system print dialog ("Save as PDF").
//
// Desktop: WKWebView ignores window.print() from page JS, so the document
// goes to the Rust side, which opens it in its own window and runs the native
// dialog there. Web: a hidden iframe prints itself — browsers support that.

import { ipc, isTauri } from "@/lib/ipc";

/** `true` when a print dialog was raised; `false` when the document is merely
 *  on screen and the user has to press the print shortcut themselves. */
export async function printHtml(html: string, title: string): Promise<boolean> {
  if (isTauri()) return ipc.printHtml(title, html);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      /* the caller already told the user to expect a print dialog */
    }
    setTimeout(() => frame.remove(), 120_000);
  };
  frame.srcdoc = html;
  // The browser raises its own dialog once the frame loads.
  return true;
}
