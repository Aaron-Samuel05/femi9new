import Link from 'next/link'
import { listCategoriesAdmin } from '@femi9/core/services/admin/blog-admin'
import PostForm from '../_form'

/**
 * Create-post screen — loads the category list for the <select> then renders the
 * shared form in create mode. Server component: reads the service directly.
 */
export const dynamic = 'force-dynamic'

export default async function NewPostPage() {
  const categories = await listCategoriesAdmin()

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0 }}>
            New post
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            Write the article and choose how it publishes.
          </p>
        </div>
        <Link className="adm-btn adm-btn--ghost adm-btn--sm" href="/admin/content/blog">
          ← Back to blog
        </Link>
      </div>

      <PostForm mode="create" categories={categories} />
    </>
  )
}
