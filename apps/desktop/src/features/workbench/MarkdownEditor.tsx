import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import {
  Bold, Code, Heading1, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Quote, Strikethrough, Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Word-style WYSIWYG markdown editor: you edit the *rendered* document
 * directly (headings, bold, lists, quotes, code, links, images) and it stays
 * serialized as Markdown. A toolbar shows while the cell is focused.
 */
export function MarkdownEditor({
  value,
  onChange,
  onFocusChange,
}: {
  value: string;
  onChange: (markdown: string) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const lastEmitted = useRef(value);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false }),
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true, linkify: true }),
      Placeholder.configure({ placeholder: "Write, or type “/” markdown — headings, **bold**, lists, images…" }),
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
    onFocus: () => onFocusChange?.(true),
    onBlur: () => onFocusChange?.(false),
  });

  // Reflect external value changes (e.g. loaded notebook) without clobbering
  // the cursor while the user types.
  useEffect(() => {
    if (editor && value !== lastEmitted.current) {
      editor.commands.setContent(value, { emitUpdate: false });
      lastEmitted.current = value;
    }
  }, [value, editor]);

  return (
    <div className="group/md">
      {editor ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
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
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-2 py-1 opacity-60 transition-opacity focus-within:opacity-100 group-hover/md:opacity-100">
      <Btn title="Heading 1" on={editor.isActive("heading", { level: 1 })} run={() => c().toggleHeading({ level: 1 }).run()}><Heading1 className="h-3.5 w-3.5" /></Btn>
      <Btn title="Heading 2" on={editor.isActive("heading", { level: 2 })} run={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></Btn>
      <Btn title="Heading 3" on={editor.isActive("heading", { level: 3 })} run={() => c().toggleHeading({ level: 3 }).run()}><Heading3 className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <Btn title="Bold" on={editor.isActive("bold")} run={() => c().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Btn>
      <Btn title="Italic" on={editor.isActive("italic")} run={() => c().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Btn>
      <Btn title="Strikethrough" on={editor.isActive("strike")} run={() => c().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></Btn>
      <Btn title="Inline code" on={editor.isActive("code")} run={() => c().toggleCode().run()}><Code className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <Btn title="Bullet list" on={editor.isActive("bulletList")} run={() => c().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Btn>
      <Btn title="Numbered list" on={editor.isActive("orderedList")} run={() => c().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Btn>
      <Btn title="Quote" on={editor.isActive("blockquote")} run={() => c().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></Btn>
      <Btn title="Code block" on={editor.isActive("codeBlock")} run={() => c().toggleCodeBlock().run()}><Code2 className="h-3.5 w-3.5" /></Btn>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <Btn
        title="Link"
        on={editor.isActive("link")}
        run={() => {
          const url = window.prompt("Link URL", editor.getAttributes("link").href ?? "https://");
          if (url === null) return;
          if (url === "") c().unsetLink().run();
          else c().setLink({ href: url }).run();
        }}
      ><Link2 className="h-3.5 w-3.5" /></Btn>
      <Btn
        title="Image / embed (URL)"
        run={() => {
          const url = window.prompt("Image URL");
          if (url) c().setImage({ src: url }).run();
        }}
      ><ImageIcon className="h-3.5 w-3.5" /></Btn>
    </div>
  );
}
