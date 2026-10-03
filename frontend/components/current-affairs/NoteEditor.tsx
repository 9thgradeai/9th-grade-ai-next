"use client";

// Rich-text editor for the daily current-affairs note.
// TipTap (starter-kit + highlight) so aspirants can re-edit
// the AI note, highlight key facts, and save a personal
// version (persisted as UserCustomizedNote).

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import {
  Highlighter,
  List,
  TextT,
  FloppyDisk,
  ArrowUUpLeft,
  ArrowUUpRight,
} from "@phosphor-icons/react";

interface NoteEditorProps {
  initialDoc: unknown;
  onSave: (doc: unknown) => Promise<void>;
  saving?: boolean;
  toolbarLabel?: string;
  saveLabel?: string;
}

function FormatButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] ${
        active
          ? "border-[var(--dashboard-primary)] bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)]"
          : "border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

export default function NoteEditor({
  initialDoc,
  onSave,
  saving = false,
  toolbarLabel = "Formatting",
  saveLabel = "Save My Notes",
}: NoteEditorProps) {
  const [dirty, setDirty] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit, Highlight],
    content: (initialDoc as { type: string } | null) ?? { type: "doc", content: [] },
    editable: true,
    autofocus: false,
    onUpdate: () => setDirty(true),
  });

  const save = async () => {
    if (!editor) return;
    await onSave(editor.getJSON());
    setDirty(false);
  };

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-solid)" }}>
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2"
        role="toolbar"
        aria-label={toolbarLabel}
        style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
      >
        <FormatButton
          label="Bold"
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <span className="font-black">B</span>
        </FormatButton>
        <FormatButton
          label="Italic"
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </FormatButton>
        <FormatButton
          label="Highlight"
          active={editor?.isActive("highlight")}
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
        >
          <Highlighter className="h-4 w-4" aria-hidden="true" />
        </FormatButton>
        <FormatButton
          label="Heading"
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <TextT className="h-4 w-4" aria-hidden="true" />
        </FormatButton>
        <FormatButton
          label="Bullet list"
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" aria-hidden="true" />
        </FormatButton>
        <span className="mx-1 h-5 w-px" style={{ background: "var(--dashboard-border-muted)" }} aria-hidden="true" />
        <FormatButton label="Undo" onClick={() => editor?.chain().focus().undo().run()}>
          <ArrowUUpLeft className="h-4 w-4" aria-hidden="true" />
        </FormatButton>
        <FormatButton label="Redo" onClick={() => editor?.chain().focus().redo().run()}>
          <ArrowUUpRight className="h-4 w-4" aria-hidden="true" />
        </FormatButton>

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: "var(--dashboard-primary)",
              background: dirty ? "var(--dashboard-primary)" : "var(--dashboard-surface-muted)",
              color: dirty ? "#fff" : "var(--dashboard-text-muted)",
            }}
          >
            <FloppyDisk className="h-4 w-4" aria-hidden="true" />
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>

      {/* Editor surface */}
      <div
        className="prose prose-sm max-w-none px-5 py-4 min-h-[280px]"
        style={{ color: "var(--dashboard-text-primary)" }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
