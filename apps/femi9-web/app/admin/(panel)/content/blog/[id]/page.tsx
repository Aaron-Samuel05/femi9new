import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPostAdmin, listCategoriesAdmin } from '@femi9/core/services/admin/blog-admin'
import PostForm, { type BlogFormValues } from '../_form'

/**
 * Edit-post screen. Server component: loads the post + category list, maps the DB
 * row onto the form's value shape (joining the String[] body back into newline
 * text for the textarea), and hands it to the shared <PostForm/> in edit mode.
 * Next 14.2: `params` is a plain synchronous object.
 */
export const dynamic = 'force-dynamic'

export default async function EditPostPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [post, categories] = await Promise.all([
    getPostAdmin(params.id),
    listCategoriesAdmin(),
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
    // String[] column → one block per line for the textarea.
    body: post.body.join('\n'),
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
        <Link className="adm-btn adm-btn--ghost adm-btn--sm" href="/admin/content/blog">
          ← Back to blog
        </Link>
      </div>

      <PostForm mode="edit" postId={post.id} categories={categories} initial={initial} />
    </>
  )
}
