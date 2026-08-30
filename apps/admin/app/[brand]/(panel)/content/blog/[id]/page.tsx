import { requireConsole } from '@/lib/guard'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPostAdmin, joinBody, listCategoriesAdmin } from '@femi9/core/services/admin/blog-admin'
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
    // String[] column → blank-line-separated blocks for the textarea.
    body: joinBody(post.body),
    metaTitle: post.metaTitle ?? '',
    imageAlt: post.imageAlt ?? '',
    // string[] column → the comma-separated line the single input holds.
    keywords: post.keywords.join(', '),
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
