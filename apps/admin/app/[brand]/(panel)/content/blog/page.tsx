import { requireConsole } from '@/lib/guard'
import Link from 'next/link'
import { listPostsAdmin } from '@femi9/core/services/admin/blog-admin'

/**
 * Blog index — the content CMS table. Server component: reads the service
 * directly (no fetch hop). Shows every status so pending/hidden drafts stay
 * manageable, with a "New post" primary action and per-row Edit links.
 */

export const dynamic = 'force-dynamic' // always reflect the latest content

// ModerationStatus → badge tone. approved reads as "live", pending as
// "in review", hidden as "off".
const STATUS_BADGE: Record<string, string> = {
  approved: 'adm-badge--green',
  pending: 'adm-badge--amber',
  hidden: 'adm-badge--gray',
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export default async function AdminBlogPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await requireConsole((await params).brand, 'content')
  const posts = await listPostsAdmin(brand)

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0 }}>
            Blog
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            {posts.length} {posts.length === 1 ? 'post' : 'posts'} in the content library
          </p>
        </div>
        <Link className="adm-btn adm-btn--primary" href={`/${brand}/content/blog/new`}>
          + New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="adm-empty">
          <p className="adm-empty-title">No posts yet</p>
          <p>Write your first article to start the content library.</p>
          <Link
            className="adm-btn adm-btn--primary"
            href={`/${brand}/content/blog/new`}
            style={{ marginTop: 8 }}
          >
            + New post
          </Link>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Author</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{ width: 64 }}>{/* actions */}</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link
                      href={`/${brand}/content/blog/${p.id}`}
                      style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}
                    >
                      {p.title}
                    </Link>
                    <div className="adm-cell-muted" style={{ fontSize: 12 }}>
                      {p.featured && (
                        <span className="adm-badge adm-badge--plum" style={{ marginRight: 6 }}>
                          Featured
                        </span>
                      )}
                      {p.slug}
                    </div>
                  </td>
                  <td>
                    <span className="adm-badge adm-badge--plum">{p.categoryName}</span>
                  </td>
                  <td>{p.author || <span className="adm-cell-muted">-</span>}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_BADGE[p.status] ?? 'adm-badge--gray'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="adm-cell-muted">{dateFmt.format(p.publishedAt)}</td>
                  <td>
                    <Link
                      className="adm-btn adm-btn--ghost adm-btn--sm"
                      href={`/${brand}/content/blog/${p.id}`}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
