import { useEffect, useRef, useState } from "react";
import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import { Markdown } from "tiptap-markdown";
import {
  Baseline, Bold, Code, Grid3x3, Heading1, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Quote, Strikethrough, Trash2, Underline as UnderlineIcon, Code2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Syntax-highlighted code blocks (lowlight/highlight.js, common languages) with
// the language shown as a corner tag — `data-language` on <pre> feeds the CSS.
const lowlight = createLowlight(common);
const NotebookCodeBlock = CodeBlockLowlight.extend({
  renderHTML({ node, HTMLAttributes }) {
    const lang = (node.attrs.language as string | null) ?? this.options.defaultLanguage;
    return ["pre", { ...HTMLAttributes, "data-language": lang || "text" }, ["code", { class: lang ? `language-${lang}` : null }, 0]];
  },
}).configure({ lowlight, defaultLanguage: "sql" });

/**
 * Word-style WYSIWYG markdown editor: you edit the *rendered* document
 * directly (headings, bold/italic/underline, lists, quotes, code, links,
 * images) and it stays serialized as Markdown. The formatting toolbar only
 * appears while the cell is focused, so an inactive cell reads as clean prose.
 */
export function MarkdownEditor({
  value,
  onChange,
  onFocusChange,
  trailing,
  placeholder = "Write, or use markdown — # heading, **bold**, - list, images…",
}: {
  value: string;
  onChange: (markdown: string) => void;
  onFocusChange?: (focused: boolean) => void;
  /** Cell controls (type / drag / delete) rendered at the toolbar's right end
   *  while editing — so they never overlap the formatting buttons. */
  trailing?: React.ReactNode;
  /** Empty-state hint. Defaults to the notebook cell's markdown hint; the
   *  dashboard text block passes a plain one (no raw markdown syntax shown). */
  placeholder?: string;
}) {
  const lastEmitted = useRef(value);
  const [focused, setFocused] = useState(false);
  // Serializing the whole doc to markdown is O(doc) — doing it on every
  // keystroke is a typing-jank source. Debounce it; flush on blur/unmount.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const emitTimer = useRef<number | null>(null);
  const emitNow = (ed: Editor) => {
    const md = (ed.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
    lastEmitted.current = md;
    onChangeRef.current(md);
  };
  const editor = useEditor({
    extensions: [
      // StarterKit v3 already bundles underline, link, strike, code, lists,
      // etc. — configure them here; registering them again breaks them.
      // codeBlock is replaced by the highlighted variant below.
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
        codeBlock: false,
      }),
      NotebookCodeBlock,
      Image.configure({ inline: false }),
      // Tables (GFM) + inline text styling (font size / color) — issue #16.
      TableKit.configure({ table: { resizable: false } }),
      TextStyleKit,
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true, linkify: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "md-body tiptap max-w-none px-3 py-2 text-[13px] leading-relaxed outline-none" },
    },
    onUpdate: ({ editor }) => {
      if (emitTimer.current) window.clearTimeout(emitTimer.current);
      emitTimer.current = window.setTimeout(() => {
        emitTimer.current = null;
        emitNow(editor);
      }, 300);
    },
  });

  // Flush a pending emit (blur / unmount) so no keystrokes are ever lost.
  const flush = () => {
    if (emitTimer.current !== null && editor) {
      window.clearTimeout(emitTimer.current);
      emitTimer.current = null;
      emitNow(editor);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), [editor]);

  // Reflect external value changes (e.g. loaded notebook) without clobbering
  // the cursor while the user types.
  useEffect(() => {
    if (editor && value !== lastEmitted.current) {
      editor.commands.setContent(value, { emitUpdate: false });
      lastEmitted.current = value;
    }
  }, [value, editor]);

  // Track focus at the CONTAINER level (focus-within) rather than the editor's
  // own focus, so clicking the toolbar's link input doesn't unmount the toolbar.
  return (
    <div
      className="group/md"
      onFocus={() => { setFocused(true); onFocusChange?.(true); }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; // focus stayed inside
        flush();
        setFocused(false);
        onFocusChange?.(false);
      }}
    >
      {editor && focused ? <Toolbar editor={editor} trailing={trailing} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, trailing }: { editor: Editor; trailing?: React.ReactNode }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Subscribe to the editor's transactions so active states track the caret —
  // TipTap v3's useEditor doesn't re-render on selection changes by itself.
  const on = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      h1: ed.isActive("heading", { level: 1 }),
      h2: ed.isActive("heading", { level: 2 }),
      h3: ed.isActive("heading", { level: 3 }),
      bold: ed.isActive("bold"),
      italic: ed.isActive("italic"),
      underline: ed.isActive("underline"),
      strike: ed.isActive("strike"),
      code: ed.isActive("code"),
      bulletList: ed.isActive("bulletList"),
      orderedList: ed.isActive("orderedList"),
      blockquote: ed.isActive("blockquote"),
      codeBlock: ed.isActive("codeBlock"),
      link: ed.isActive("link"),
    }),
  });
  const Btn = ({ on, run, title, children }: { on?: boolean; run: () => void; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep editor focus
      onClick={run}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        on && "bg-secondary text-foreground",
      )}
    >
      {children}
    </button>
  );
  const c = () => editor.chain().focus();

  function openLink() {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    setLinkUrl(prev || "https://");
    setLinkOpen(true);
    setTimeout(() => linkInputRef.current?.select(), 0);
  }
  function applyLink() {
    const url = linkUrl.trim();
    if (!url) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    // If nothing is selected, insert the URL as the link text so a link appears.
    else if (editor.state.selection.empty)
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a> `).run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  }
  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result) }).run();
    reader.readAsDataURL(file); // embed as data URL so it survives export
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-border/60 bg-panel px-2 py-1">
      <Btn title="Heading 1" on={on.h1} run={() => c().toggleHeading({ level: 1 }).run()}><Heading1 className="h-3.5 w-3.5" /></Btn>
      <Btn title="Heading 2" on={on.h2} run={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></Btn>
      <Btn title="Heading 3" on={on.h3} run={() => c().toggleHeading({ level: 3 }).run()}><Heading3 className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <Btn title="Bold" on={on.bold} run={() => c().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Btn>
      <Btn title="Italic" on={on.italic} run={() => c().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Btn>
      <Btn title="Underline" on={on.underline} run={() => c().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Strikethrough" on={on.strike} run={() => c().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></Btn>
      <Btn title="Inline code" on={on.code} run={() => c().toggleCode().run()}><Code className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <Btn title="Bullet list" on={on.bulletList} run={() => c().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Btn>
      <Btn title="Numbered list" on={on.orderedList} run={() => c().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Btn>
      <Btn title="Quote" on={on.blockquote} run={() => c().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></Btn>
      <Btn title="Code block" on={on.codeBlock} run={() => c().toggleCodeBlock().run()}><Code2 className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <Btn title="Link" on={on.link} run={openLink}><Link2 className="h-3.5 w-3.5" /></Btn>
      <Btn title="Insert image from your computer" run={() => fileRef.current?.click()}><ImageIcon className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      {/* Font size / text color / tables — issue #16 */}
      <span className="group/fs relative">
        <Btn title="Font size" run={() => undefined}><span className="text-[11px] font-semibold">Aa</span></Btn>
        <span className="invisible absolute top-full left-0 z-20 flex flex-col rounded-md border border-border bg-panel py-0.5 shadow-lg group-hover/fs:visible">
          {[["Small", "12px"], ["Normal", ""], ["Large", "18px"], ["Huge", "24px"]].map(([label, px]) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (px ? c().setFontSize(px).run() : c().unsetFontSize().run())}
              className="px-2.5 py-1 text-left text-[11.5px] whitespace-nowrap text-muted-foreground hover:bg-secondary hover:text-foreground"
              style={px ? { fontSize: px } : undefined}
            >
              {label}
            </button>
          ))}
        </span>
      </span>
      <span className="group/clr relative">
        <Btn title="Text color" run={() => undefined}><Baseline className="h-3.5 w-3.5" /></Btn>
        <span className="invisible absolute top-full left-0 z-20 flex items-center gap-1 rounded-md border border-border bg-panel p-1.5 shadow-lg group-hover/clr:visible">
          {["#e11d48", "#f97316", "#eab308", "#10b981", "#0ea5e9", "#6366f1", "#a855f7"].map((hex) => (
            <button
              key={hex}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => c().setColor(hex).run()}
              title={hex}
              className="h-4 w-4 rounded-sm border border-border/50"
              style={{ backgroundColor: hex }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().unsetColor().run()}
            title="Default color"
            className="flex h-4 w-4 items-center justify-center rounded-sm border border-border text-[9px] text-muted-foreground"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      </span>
      {editor.isActive("table") ? (
        <>
          <Btn title="Add row below" run={() => c().addRowAfter().run()}><span className="text-[10px] font-semibold">+R</span></Btn>
          <Btn title="Add column after" run={() => c().addColumnAfter().run()}><span className="text-[10px] font-semibold">+C</span></Btn>
          <Btn title="Delete table" run={() => c().deleteTable().run()}><Trash2 className="h-3.5 w-3.5" /></Btn>
        </>
      ) : (
        <Btn title="Insert table (3×3)" run={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Grid3x3 className="h-3.5 w-3.5" /></Btn>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
      {linkOpen ? (
        <div className="flex items-center gap-1 pl-1">
          <input
            ref={linkInputRef}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); applyLink(); }
              else if (e.key === "Escape") { e.preventDefault(); setLinkOpen(false); c().run(); }
            }}
            placeholder="https://…"
            className="h-6 w-52 rounded border border-border bg-background px-2 text-[11.5px] outline-none focus:border-primary/50"
          />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={applyLink} className="h-6 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/85">Apply</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setLinkOpen(false); c().run(); }} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}
      {trailing ? <span className="ml-auto flex items-center gap-0.5 pl-2">{trailing}</span> : null}
    </div>
  );
}
