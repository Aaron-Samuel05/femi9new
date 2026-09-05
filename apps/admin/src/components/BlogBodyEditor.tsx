'use client'

import { useCallback, useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

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
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'adm-editor-content',
      },
    },
  })

  // Keep the editor content in sync when the parent swaps values (e.g. when
  // the edit page finishes loading and populates the form). Guard against the
  // no-op case so an in-progress edit isn't clobbered by an equal update.
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (value && value !== current) editor.commands.setContent(value, false)
  }, [value, editor])

  useEffect(() => {
    if (editor) editor.setEditable(!disabled)
  }, [disabled, editor])

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
    <div className={`adm-editor${disabled ? ' is-disabled' : ''}`}>
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
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
