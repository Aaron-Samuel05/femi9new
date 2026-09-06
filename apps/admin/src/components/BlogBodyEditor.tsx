'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

/**
 * Client-side twin of the server's `isEmptyBlogHtml` helper. Same rules,
 * duplicated here because that module imports `server-only`. Kept trivial
 * on purpose so drift is easy to spot.
 */
function isEmptyHtml(html: string): boolean {
  if (!html) return true
  const stripped = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, '')
    .replace(/&#160;/g, '')
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, 'x')
    .trim()
  return stripped.length === 0
}

/**
 * BlogBodyEditor — Tiptap-based rich text editor for the blog form's body.
 *
 * Emits sanitised-friendly HTML on every keystroke via `onChange`; sanitisation
 * itself happens server-side in @femi9/core/blog-html on save. Uploading an
 * image POSTs to /<brand>/api/upload (the same S3 path the cover field uses).
 *
 * The toolbar composes .adm-* button styling with .adm-editor-* scope so it
 * inherits the console's plum accent without needing new component CSS.
 */

interface BlogBodyEditorProps {
  value: string
  onChange: (html: string) => void
  brand: string
  placeholder?: string
  disabled?: boolean
}

export function BlogBodyEditor({
  value,
  onChange,
  brand,
  placeholder,
  disabled,
}: BlogBodyEditorProps) {
  // Remembers the LAST value the editor itself emitted, so the sync effect
  // below can tell "incoming value is my own state round-trip" from
  // "incoming value is a genuinely new one from outside" (e.g. the parent
  // called setBodyHtml directly, like the "Migrate to editor" button does).
  //
  // Without this the effect ran `setContent` on every keystroke — the
  // parent's re-render fed `value` back down and any HTML canonicalisation
  // drift made `value !== current`. `setContent` resets ProseMirror's
  // selection, so the caret jumped mid-typing; a subsequent H2 click then
  // targeted whatever block the selection landed in, which was often the
  // block BEFORE the one the operator meant. Symptom: "I put my cursor on
  // a new line, clicked H2, and the previous paragraph also became H2."
  const lastEmitted = useRef<string>(value || '')

  // Force a re-render on selection / transaction updates so the toolbar's
  // `active` state (isActive('heading', {level:2}) etc.) always reflects the
  // current node under the caret. `useEditor` re-renders on document
  // transactions but not always on pure selection changes — moving the caret
  // without editing was leaving H2/H3 buttons showing stale "active" state,
  // which mis-signals what the next click will do.
  const [, forceRerender] = useReducer((n: number) => n + 1, 0)

  // Distraction-free writing mode. When true, the whole editor container is
  // moved to `position: fixed; inset: 0` with a solid backdrop, so the
  // operator can compose a long article without the console chrome around
  // them. Toggled by a toolbar button; Esc also exits. The parent form is
  // NOT unmounted, so state (draft body, other fields) survives entering
  // and leaving fullscreen exactly like a UI toggle should.
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    // Also lock body scroll so the underlying console can't scroll behind
    // the fixed editor — a subtle mismatch that costs concentration.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fullscreen])

  const editor = useEditor({
    // StarterKit ships headings/lists/bold/italic/blockquote/undo/redo/etc.
    // No history extension separately — StarterKit already includes it.
    extensions: [
      StarterKit.configure({
        // Level restrictions match what the sanitiser allows on the server.
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
      Image.configure({
        // Only allow images we host. src="data:…" or off-origin URLs are
        // stripped at save time by sanitizeBlogHtml — this keeps the editor
        // preview honest.
        allowBase64: false,
        HTMLAttributes: { loading: 'lazy' },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? 'Start writing…',
      }),
    ],
    content: value || '',
    editable: !disabled,
    immediatelyRender: false, // Next.js SSR-friendly
    onUpdate({ editor }) {
      // Tiptap normalises `content: ''` to `<p></p>` and fires this hook once
      // on init. Emitting that shell to the parent makes `bodyHtml` state
      // non-empty and — for the blog form — hides the legacy-content panel
      // that keys on `!bodyHtml`. Coerce empty-ish HTML to '' so the parent's
      // "has meaningful content" checks read cleanly. isEmptyHtml is a local
      // duplicate of blog-html's helper — this file cannot import from core
      // because it runs in the browser bundle and core's blog-html imports
      // server-only.
      const html = editor.getHTML()
      const emitted = isEmptyHtml(html) ? '' : html
      lastEmitted.current = emitted
      onChange(emitted)
    },
    editorProps: {
      attributes: {
        class: 'adm-editor-content',
      },
    },
  })

  // Sync ONLY when the incoming value came from outside — the parent's
  // "Migrate to editor" button, or a fresh post being loaded. When the
  // incoming value is the same one we just emitted (React re-render
  // feeding our own onChange back down), skip: `setContent` reallocates
  // the document and resets the caret, which caused the "H2 applied to
  // the previous paragraph too" bug. See lastEmitted's declaration
  // comment above for the full story.
  useEffect(() => {
    if (!editor) return
    const incoming = value || ''
    if (incoming === lastEmitted.current) return
    const current = editor.getHTML()
    if (incoming === current) return
    editor.commands.setContent(incoming, false)
    lastEmitted.current = incoming
  }, [value, editor])

  useEffect(() => {
    if (editor) editor.setEditable(!disabled)
  }, [disabled, editor])

  // Subscribe to selection updates. onUpdate already fires on doc changes,
  // but selection-only moves (arrow keys, clicks) also change what the
  // toolbar should reflect. Force a React render so isActive() reads fresh.
  useEffect(() => {
    if (!editor) return
    editor.on('selectionUpdate', forceRerender)
    editor.on('transaction', forceRerender)
    return () => {
      editor.off('selectionUpdate', forceRerender)
      editor.off('transaction', forceRerender)
    }
  }, [editor])

  const promptLink = useCallback(() => {
    if (!editor) return
    const previous = editor.getAttributes('link').href ?? ''
    const url = window.prompt('Link URL', previous)
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    // Coerce bare inputs to https so a copy-paste like `femi9.in` doesn't yield
    // a relative link the storefront won't render as a proper anchor.
    const href = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }, [editor])

  const insertImage = useCallback(async () => {
    if (!editor) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await fetch(`/${brand}/api/upload`, { method: 'POST', body: fd })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || !body?.url) {
          window.alert(body?.error || 'Upload failed.')
          return
        }
        editor.chain().focus().setImage({ src: body.url, alt: file.name }).run()
      } catch {
        window.alert('Upload failed.')
      }
    }
    input.click()
  }, [brand, editor])

  if (!editor) return null

  const canUndo = editor.can().undo()
  const canRedo = editor.can().redo()

  const ToolBtn = ({
    label,
    onClick,
    active,
    disabled: btnDisabled,
    children,
  }: {
    label: string
    onClick: () => void
    active?: boolean
    disabled?: boolean
    children: React.ReactNode
  }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={!!active}
      className={`adm-editor-btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      disabled={disabled || btnDisabled}
    >
      {children}
    </button>
  )

  return (
    <div className={`adm-editor${disabled ? ' is-disabled' : ''}${fullscreen ? ' is-fullscreen' : ''}`}>
      <div className="adm-editor-toolbar" role="toolbar" aria-label="Blog editor toolbar">
        <ToolBtn label="Bold" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
          <b>B</b>
        </ToolBtn>
        <ToolBtn label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
          <i>I</i>
        </ToolBtn>
        <ToolBtn label="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')}>
          <s>S</s>
        </ToolBtn>
        <span className="adm-editor-sep" aria-hidden="true" />
        <ToolBtn label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
          H2
        </ToolBtn>
        <ToolBtn label="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
          H3
        </ToolBtn>
        <span className="adm-editor-sep" aria-hidden="true" />
        <ToolBtn label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
          •&nbsp;•
        </ToolBtn>
        <ToolBtn label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
          1.
        </ToolBtn>
        <ToolBtn label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
          &ldquo;&rdquo;
        </ToolBtn>
        <span className="adm-editor-sep" aria-hidden="true" />
        <ToolBtn label="Link" onClick={promptLink} active={editor.isActive('link')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </ToolBtn>
        <ToolBtn label="Image" onClick={insertImage}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </ToolBtn>
        <span className="adm-editor-sep" aria-hidden="true" />
        <ToolBtn label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!canUndo}>
          ↶
        </ToolBtn>
        <ToolBtn label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!canRedo}>
          ↷
        </ToolBtn>
        <span className="adm-editor-sep" aria-hidden="true" />
        <ToolBtn
          label={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          onClick={() => setFullscreen((v) => !v)}
          active={fullscreen}
        >
          {fullscreen ? (
            // Compress icon
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 14h6v6" />
              <path d="M20 10h-6V4" />
              <path d="M14 10l7-7" />
              <path d="M3 21l7-7" />
            </svg>
          ) : (
            // Expand icon
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
          )}
        </ToolBtn>
      </div>
      <EditorContent editor={editor} />
      {/* Inline style block — scoped to only fire when fullscreen is on.
          `.adm-editor.is-fullscreen` overrides the container's normal flow
          box so it fills the viewport, sits above the console chrome (which
          uses z-indexes up to ~100 for its own modals), and holds the
          toolbar sticky at the top so it's always reachable. The editor
          content itself gets a wider max-width for comfortable writing. */}
      {fullscreen && (
        <style jsx global>{`
          .adm-editor.is-fullscreen {
            position: fixed;
            inset: 0;
            z-index: 200;
            background: var(--surface, #fff);
            display: flex;
            flex-direction: column;
            border-radius: 0;
            border: none;
          }
          .adm-editor.is-fullscreen .adm-editor-toolbar {
            flex: 0 0 auto;
            background: var(--surface, #fff);
            border-bottom: 1px solid var(--line);
            padding: 12px 20px;
          }
          /* Tiptap's EditorContent renders a wrapper div between
             .adm-editor and .ProseMirror. Flex only affects direct
             children, so the wrapper — NOT the ProseMirror inside it — is
             what has to grow and scroll. Target every direct child that
             isn't the toolbar; the ProseMirror inside then fills its
             parent normally. */
          .adm-editor.is-fullscreen > *:not(.adm-editor-toolbar) {
            flex: 1 1 auto;
            overflow-y: auto;
            min-height: 0;
          }
          .adm-editor.is-fullscreen .ProseMirror {
            padding: clamp(24px, 6vw, 64px) clamp(20px, 8vw, 96px);
            max-width: 820px;
            width: 100%;
            margin: 0 auto;
            font-size: 17px;
            line-height: 1.7;
            min-height: 100%;
          }
          .adm-editor.is-fullscreen .ProseMirror h2 {
            font-size: 28px;
            margin-top: 1.4em;
          }
          .adm-editor.is-fullscreen .ProseMirror h3 {
            font-size: 22px;
            margin-top: 1.2em;
          }
        `}</style>
      )}
    </div>
  )
}
