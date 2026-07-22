import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import { Markdown } from "tiptap-markdown";
import {
  Bold, Code, Heading1, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Quote, Strikethrough, Underline as UnderlineIcon, Code2, X,
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
}: {
  value: string;
  onChange: (markdown: string) => void;
  onFocusChange?: (focused: boolean) => void;
  /** Cell controls (type / drag / delete) rendered at the toolbar's right end
   *  while editing — so they never overlap the formatting buttons. */
  trailing?: React.ReactNode;
}) {
  const lastEmitted = useRef(value);
  const [focused, setFocused] = useState(false);
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
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true, linkify: true }),
      Placeholder.configure({ placeholder: "Write, or use markdown — # heading, **bold**, - list, images…" }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "md-body tiptap max-w-none px-3 py-2 text-[13px] leading-relaxed outline-none" },
    },
    onUpdate: ({ editor }) => {
      const md = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      lastEmitted.current = md;
      onChange(md);
    },
  });

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
      <Btn title="Heading 1" on={editor.isActive("heading", { level: 1 })} run={() => c().toggleHeading({ level: 1 }).run()}><Heading1 className="h-3.5 w-3.5" /></Btn>
      <Btn title="Heading 2" on={editor.isActive("heading", { level: 2 })} run={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></Btn>
      <Btn title="Heading 3" on={editor.isActive("heading", { level: 3 })} run={() => c().toggleHeading({ level: 3 }).run()}><Heading3 className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <Btn title="Bold" on={editor.isActive("bold")} run={() => c().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Btn>
      <Btn title="Italic" on={editor.isActive("italic")} run={() => c().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Btn>
      <Btn title="Underline" on={editor.isActive("underline")} run={() => c().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></Btn>
      <Btn title="Strikethrough" on={editor.isActive("strike")} run={() => c().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></Btn>
      <Btn title="Inline code" on={editor.isActive("code")} run={() => c().toggleCode().run()}><Code className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <Btn title="Bullet list" on={editor.isActive("bulletList")} run={() => c().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Btn>
      <Btn title="Numbered list" on={editor.isActive("orderedList")} run={() => c().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Btn>
      <Btn title="Quote" on={editor.isActive("blockquote")} run={() => c().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></Btn>
      <Btn title="Code block" on={editor.isActive("codeBlock")} run={() => c().toggleCodeBlock().run()}><Code2 className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <Btn title="Link" on={editor.isActive("link")} run={openLink}><Link2 className="h-3.5 w-3.5" /></Btn>
      <Btn title="Insert image from your computer" run={() => fileRef.current?.click()}><ImageIcon className="h-3.5 w-3.5" /></Btn>
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
