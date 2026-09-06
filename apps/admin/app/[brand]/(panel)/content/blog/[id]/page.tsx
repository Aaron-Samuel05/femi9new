import { requireConsole } from '@/lib/guard'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPostAdmin, joinBody, listCategoriesAdmin } from '@femi9/core/services/admin/blog-admin'
import { isEmptyBlogHtml } from '@femi9/core/blog-html'
import PostForm, { type BlogFormValues } from '../_form'

/**
 * Edit-post screen. Server component: loads the post + category list, maps the DB
 * row onto the form's value shape, and hands it to the shared <PostForm/> in edit
 * mode.
 *
 * The body round-trip goes through `joinBody`, NOT `body.join('\n')`. Blocks are
 * separated by a blank line, and a bullet list is one block carrying its own
 * newlines — joining with a single newline and splitting on blank lines turns
 * the whole article into one enormous paragraph the first time somebody opens a
 * post and presses Save, with nothing on screen to warn them.
 */
export const dynamic = 'force-dynamic'

export default async function EditPostPage(props: { params: Promise<{ brand: string; id: string }> }) {
  const { brand } = await requireConsole((await props.params).brand, 'content')
  const params = await props.params;
  const [post, categories] = await Promise.all([
    getPostAdmin(brand, params.id),
    listCategoriesAdmin(brand),
  ])
  if (!post) notFound()

  const initial: BlogFormValues = {
    title: post.title,
    slug: post.slug,
    categoryId: post.categoryId,
    excerpt: post.excerpt,
    author: post.author,
    readTime: post.readTime,
    tone: post.tone,
    image: post.image ?? '',
    featured: post.featured,
    status: post.status,
    // String[] column → blank-line-separated blocks for the textarea (kept
    // as a hidden fallback for legacy posts; the rich editor operates on
    // bodyHtml).
    body: joinBody(post.body),
    // Empty-ish HTML (`<p></p>` and friends — Tiptap's fresh-editor shell)
    // becomes `''` so the legacy-content panel below can trigger from
    // `initial.body`. Without this a post whose bodyHtml is an empty shell
    // AND whose body[] has content shows a blank editor with no fallback.
    bodyHtml: isEmptyBlogHtml(post.bodyHtml) ? '' : (post.bodyHtml ?? ''),
    metaTitle: post.metaTitle ?? '',
    imageAlt: post.imageAlt ?? '',
    // string[] column → the comma-separated line the legacy input holds.
    keywords: post.keywords.join(', '),
    // Three typed lists — new columns; empty arrays for posts that predate
    // them, which is fine because the form's TagInputs render as empty.
    keywordsPrimary: post.keywordsPrimary ?? [],
    keywordsSecondary: post.keywordsSecondary ?? [],
    keywordsSemantic: post.keywordsSemantic ?? [],
    cta: post.cta ?? '',
    faqs: post.faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
  }

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0 }}>
            Edit post
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            {post.title}
          </p>
        </div>
        <Link className="adm-btn adm-btn--ghost adm-btn--sm" href={`/${brand}/content/blog`}>
          ← Back to blog
        </Link>
      </div>

      <PostForm mode="edit" postId={post.id} categories={categories} initial={initial} />
    </>
  )
}
