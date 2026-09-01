import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { ArticleBody, inline } from "@/components/journal/ArticleBody";
import { ArticleCard, CategoryChip, PostMeta } from "@/components/journal/JournalCards";
import { getJournalPost, relatedJournalPosts } from "@/lib/journal.server";
import { absoluteUrl, breadcrumbSchema, canonical, DEFAULT_OG_IMAGE, faqSchema, jsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";

/*
 * `generateStaticParams` used to live here, listing the slugs from the module.
 * It is GONE and must not come back: the slug set is a database question now,
 * and Next calls this during `next build` - where, per the workspace CLAUDE.md,
 * the Docker build stage has NO database credentials. Declaring it would turn
 * publishing an article into a build failure. The whole tree is force-dynamic
 * anyway, so it bought nothing but the documentation.
 */

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const post = await getJournalPost(slug);
  if (!post) return { title: "Article not found", robots: { index: false, follow: true } };

  const url = absoluteUrl(`/journal/${post.slug}`);
  // Nullable in the database, so every consumer below is conditional rather
  // than resolving absoluteUrl(undefined) into a link to the site root.
  const image = post.image ? absoluteUrl(post.image) : null;

  return {
    // metaTitle already carries the brand, so the layout's "%s · Lumi9"
    // template would double it - `absolute` opts this page out of the template.
    title: { absolute: post.metaTitle },
    description: post.excerpt,
    keywords: post.keywords,
    authors: [{ name: post.author }],
    alternates: canonical(`/journal/${post.slug}`),
    openGraph: {
      type: "article",
      url,
      siteName: SITE_NAME,
      title: post.metaTitle,
      description: post.excerpt,
      publishedTime: post.published,
      modifiedTime: post.updated,
      authors: [post.author],
      section: post.category,
      tags: post.keywords,
      // The cover when the post has one, the site card when it does not. This
      // used to spread nothing in the else branch — and because Next replaces a
      // parent openGraph object wholesale rather than merging into it, an
      // article with no cover image shared as a bare text link.
      images: image
        ? [{ url: image, width: 1800, height: 1204, alt: post.imageAlt }]
        : [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: post.metaTitle,
      description: post.excerpt,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function JournalPostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const post = await getJournalPost(slug);
  if (!post) notFound();

  const related = await relatedJournalPosts(slug, 3);
  // The accent comes from the category ROW now, carried on the post - a module
  // lookup by name gave a renamed or newly-created category the wrong colour.
  const color = post.categoryColor;
  const url = absoluteUrl(`/journal/${post.slug}`);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: post.title,
    description: post.excerpt,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(post.image ? { image: [absoluteUrl(post.image)] } : {}),
    datePublished: post.published,
    dateModified: post.updated,
    author: { "@type": "Organization", name: post.author, url: SITE_URL },
    publisher: { "@id": `${SITE_URL}/#organization` },
    articleSection: post.category,
    keywords: post.keywords.join(", "),
    wordCount: post.body.join(" ").split(/\s+/).length,
    inLanguage: "en-IN",
    isPartOf: { "@id": `${SITE_URL}/journal#blog` },
  };

  return (
    <PageShell links={NAV_LINKS}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(articleSchema)} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Journal", path: "/journal" },
            { name: post.title, path: `/journal/${post.slug}` },
          ]),
        )}
      />
      {/* Emitted only when the questions are actually rendered below - FAQ
          markup for content a reader cannot see is a manual-action risk. */}
      {post.faqs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqSchema(post.faqs))} />
      )}

      <article>
        {/* HEAD */}
        <div className="px-safe pt-[clamp(24px,4vw,48px)] pb-[clamp(20px,3vw,32px)]">
          <div className="mx-auto max-w-[860px]">
            <nav aria-label="Breadcrumb" className="mb-6 text-[13px] text-muted">
              <Link href="/" className="inline-flex items-center coarse:min-h-11 hover:text-midnight">
                Home
              </Link>
              <span className="px-2" aria-hidden>
                /
              </span>
              <Link href="/journal" className="inline-flex items-center coarse:min-h-11 hover:text-midnight">
                Journal
              </Link>
            </nav>

            <CategoryChip post={post} className="mb-5" />
            <h1 className="m-0 mb-5 font-display text-[clamp(28px,7vw,52px)] leading-[1.08] font-normal md:text-[clamp(34px,4.2vw,52px)]">
              {post.title}
            </h1>
            <p className="m-0 mb-6 max-w-[62ch] text-lead leading-[1.6] text-muted">{post.excerpt}</p>
            <PostMeta post={post} />
          </div>
        </div>

        {/* COVER - the LCP element, so it is eager and carries its own sizes.
            The photograph drifts on scroll inside an over-tall wrapper (top -12%
            / height 124%), so it still covers the frame at the extremes of that
            drift - and the framing is correct with no transform at all, which is
            what `prefers-reduced-motion` gets. */}
        <div className="px-safe pb-[clamp(28px,4vw,52px)]">
          <div className="relative mx-auto aspect-3/2 w-full max-w-[1120px] overflow-hidden rounded-media bg-shell shadow-hero sm:aspect-16/9">
            {post.image && (
              <Parallax factor={0.18} pointerScale={24} className="absolute inset-x-0 top-[-12%] h-[124%]">
                <Image
                  src={post.image}
                  alt={post.imageAlt}
                  fill
                  priority
                  sizes="(max-width: 900px) 94vw, 1120px"
                  className="object-cover"
                />
              </Parallax>
            )}
          </div>
        </div>

        {/* BODY */}
        <div
          className="px-safe pb-[clamp(32px,4vw,56px)]"
          style={{ "--accent": color } as React.CSSProperties}
        >
          <div className="mx-auto max-w-[740px]">
            <ArticleBody blocks={post.body} />
          </div>
        </div>

        {/* FAQ - visible on the page, which is what makes the FAQPage schema honest */}
        {post.faqs.length > 0 && (
          <section className="px-safe pb-[clamp(32px,4vw,56px)]" aria-labelledby="faq-heading">
            <div className="mx-auto max-w-[740px]">
              <h2
                id="faq-heading"
                className="m-0 mb-6 font-display text-[clamp(22px,4.4vw,32px)] leading-[1.16] font-normal tracking-[-0.015em]"
              >
                Frequently asked questions
              </h2>
              {/* Deliberately NOT the site Accordion: it unmounts every collapsed
                  answer, so only the first one would exist in the server-rendered
                  HTML - and FAQPage markup whose answers a crawler cannot find in
                  the document is exactly what earns a structured-data penalty. A
                  definition list keeps every answer in the DOM and reads correctly
                  to a screen reader. */}
              <dl className="m-0 border-t border-moss-tint">
                {post.faqs.map((faq) => (
                  <div key={faq.q} className="border-b border-moss-tint py-[clamp(16px,2vw,22px)]">
                    <dt className="m-0 mb-2 text-[clamp(15px,1.5vw,17px)] leading-[1.35] font-bold text-midnight">
                      {faq.q}
                    </dt>
                    <dd className="m-0 max-w-[64ch] text-[clamp(14px,1.3vw,16px)] leading-[1.7] text-muted">
                      {inline(faq.a, `faq-${faq.q}`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="px-safe pb-section">
          <Reveal className="mx-auto flex max-w-[740px] flex-col items-center gap-5 rounded-panel border border-moss-tint bg-canvas px-[clamp(20px,3.4vw,44px)] py-[clamp(28px,4vw,44px)] text-center">
            <h2 className="m-0 font-display text-[clamp(20px,3.4vw,28px)] leading-[1.2] font-normal">
              Discover Lumi9 Baby Diapers
            </h2>
            <p className="m-0 max-w-[52ch] text-[clamp(14px,1.3vw,16px)] leading-[1.6] text-muted">
              {post.cta ||
                "Soft, breathable baby diapers and diaper pants designed around everyday movement, moisture management and practical protection - in sizes from NB to XL."}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/shop" className="btn btn-dark">
                Shop Lumi9 Baby Diapers
              </Link>
              <Link href="/size-guide" className="btn btn-ghost">
                Find your baby’s size
              </Link>
            </div>
          </Reveal>
        </section>
      </article>

      {/* KEEP READING */}
      {related.length > 0 && (
        <section className="px-safe pb-section" aria-labelledby="related-heading">
          <div className="mx-auto max-w-[var(--page-max)]">
            <h2
              id="related-heading"
              className="m-0 mb-8 font-display text-[clamp(26px,6.4vw,44px)] leading-[1.05] font-normal md:text-[clamp(30px,3.6vw,44px)]"
            >
              Keep reading
            </h2>
            <div className="grid grid-cols-1 gap-[clamp(16px,2.4vw,28px)] sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item, i) => (
                <Reveal key={item.slug} as="article" delay={i * 60} className="h-full">
                  <ArticleCard post={item} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </PageShell>
  );
}
