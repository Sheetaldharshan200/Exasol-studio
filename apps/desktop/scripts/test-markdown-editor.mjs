// Regression test for the notebook MarkdownEditor stack (same extensions as
// src/features/workbench/MarkdownEditor.tsx), run headlessly with jsdom.
// Verifies underline / blockquote / link and the markdown round-trip.
//   node scripts/test-markdown-editor.mjs
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch { /* readonly */ }
for (const k of ["Element","HTMLElement","Node","Text","Document","DOMParser","MutationObserver","getComputedStyle","Range","XMLSerializer","ClipboardEvent","DragEvent","InputEvent","KeyboardEvent","MouseEvent","CustomEvent"])
  if (dom.window[k]) globalThis[k] = dom.window[k];
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame ?? ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame ?? clearTimeout;

const { Editor } = await import("@tiptap/react");
const StarterKit = (await import("@tiptap/starter-kit")).default;
const Image = (await import("@tiptap/extension-image")).default;
const Placeholder = (await import("@tiptap/extension-placeholder")).default;
const { CodeBlockLowlight } = await import("@tiptap/extension-code-block-lowlight");
const { createLowlight, common } = await import("lowlight");
const { Markdown } = await import("tiptap-markdown");
const lowlight = createLowlight(common);

const editor = new Editor({
  element: document.body,
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true }, codeBlock: false }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: "sql" }),
    Image.configure({ inline: false }),
    Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true, linkify: true }),
    Placeholder.configure({ placeholder: "x" }),
  ],
  content: "hello world",
});
const md = () => editor.storage.markdown.getMarkdown();
const failures = [];
const check = (name, cond) => { console.log(cond ? "PASS" : "FAIL", name); if (!cond) failures.push(name); };

editor.commands.setTextSelection({ from: 1, to: 6 });
editor.chain().focus().toggleUnderline().run();
check("underline serializes as <u>", md() === "<u>hello</u> world");

editor.chain().focus().toggleBlockquote().run();
check("blockquote serializes as >", md().startsWith("> "));

editor.commands.setContent(md(), { emitUpdate: false });
check("round-trip keeps underline + quote", /<blockquote><p><u>hello<\/u> world<\/p><\/blockquote>/.test(editor.getHTML()));

editor.commands.setContent("link me", { emitUpdate: false });
editor.commands.setTextSelection({ from: 1, to: 5 });
editor.chain().focus().extendMarkRange("link").setLink({ href: "https://exasol.com" }).run();
check("link serializes as [text](url)", md() === "[link](https://exasol.com) me");

editor.commands.setContent("", { emitUpdate: false });
editor.chain().focus().setImage({ src: "data:image/png;base64,AAA" }).run();
check("image serializes", md().includes("data:image/png;base64,AAA"));

editor.commands.setContent("", { emitUpdate: false });
editor.chain().focus().toggleCodeBlock().run();
editor.commands.insertContent("SELECT 1");
check("code block serializes fenced", md().includes("```") && md().includes("SELECT 1"));

editor.destroy();
if (failures.length) { console.error("FAILED:", failures.join(", ")); process.exit(1); }
console.log("all markdown-editor checks passed");
