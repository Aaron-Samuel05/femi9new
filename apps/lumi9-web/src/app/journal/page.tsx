import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { PRIMARY_LINKS } from "@/components/site/Nav";
import { Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { JournalGrid } from "@/components/journal/JournalGrid";
import { MosaicTile } from "@/components/journal/JournalCards";
import { NewsletterForm } from "@/components/site/NewsletterForm";
import { Em } from "@/components/ui/bits";
import { listCategories, listPosts } from "@/lib/journal";
import { absoluteUrl, breadcrumbSchema, canonical, jsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";

const DESCRIPTION =
  "Gentle, practical parenting reads from Lumi9 — baby diaper guides, newborn care tips, sleep and skin, written for the ordinary days nobody posts about.";

export const metadata: Metadata = {
  title: "The Lumi9 Journal — Baby Care Guides & Diaper Tips",
  description: DESCRIPTION,
  keywords: [
    "baby care blog",
    "newborn baby care tips",
    "baby diapers guide",
    "breathable baby diapers",
    "how to choose right diaper size",
    "first time parent diaper guide",
    "baby sleep",
    "Lumi9 journal",
  ],
  alternates: canonical("/journal"),
  openGraph: {
    type: "website",
    url: absoluteUrl("/journal"),
    title: "The Lumi9 Journal — Baby Care Guides & Diaper Tips",
    description: DESCRIPTION,
    siteName: SITE_NAME,
  },
};

export default function JournalPage() {
  const posts = listPosts();
  const categories = listCategories();
  const [lead, ...companions] = posts;

  /**
   * A Blog node with its posts as `blogPost` gives the listing a crawlable
   * relationship to every article, which a grid of anchors alone does not
   * express. The articles carry their own BlogPosting nodes on their own pages;
   * this one only names them.
   */
  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${SITE_URL}/journal#blog`,
    name: "The Lumi9 Journal",
    description: DESCRIPTION,
    url: absoluteUrl("/journal"),
    inLanguage: "en-IN",
    publisher: { "@id": `${SITE_URL}/#organization` },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: absoluteUrl(`/journal/${post.slug}`),
      datePublished: post.published,
      image: absoluteUrl(post.image),
      author: { "@type": "Organization", name: post.author },
    })),
  };

  return (
    <PageShell links={PRIMARY_LINKS} cta="shop">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(blogSchema)} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Journal", path: "/journal" },
          ]),
        )}
      />

      <header
        className="px-safe relative overflow-hidden pt-[clamp(48px,7vw,96px)] pb-[clamp(36px,5vw,64px)] text-center"
        style={{ background: "radial-gradient(120% 90% at 50% 0%, #eef1e0 0%, #f7f5ea 60%)" }}
      >
        <Parallax
          factor={0.2}
          pointerScale={40}
          className="absolute top-[20%] left-[8%] size-[clamp(70px,10vw,120px)] rounded-full bg-butter opacity-50"
          aria-hidden
        />
        <Parallax
          factor={0.3}
          pointerScale={40}
          className="absolute top-[30%] right-[10%] size-[clamp(42px,6.4vw,70px)] rounded-full bg-moss-soft opacity-40"
          aria-hidden
        />
        <div className="relative z-2 mx-auto max-w-[760px]">
          <div className="eyebrow mb-4.5">The Lumi9 Journal</div>
          <h1 className="m-0 mb-5 font-display text-[clamp(32px,8.4vw,72px)] leading-[1.02] font-normal md:text-[clamp(40px,5.4vw,72px)]">
            Notes for <Em>happy</Em> little days.
          </h1>
          <p className="m-0 mx-auto max-w-[58ch] text-lead leading-[1.6] text-muted">
            Baby diaper guides, newborn care tips and honest reads on sleep, skin and the days in between — written
            for the moments nobody posts about.
          </p>
        </div>
      </header>

      {/* FEATURED MOSAIC — lead tile plus its companions */}
      <section className="px-safe pt-10 pb-[clamp(44px,6vw,80px)]" aria-label="Featured reads">
        <Reveal className="mx-auto grid max-w-[1180px] grid-cols-1 gap-[clamp(12px,1.6vw,20px)] md:auto-rows-[minmax(0,1fr)] md:grid-cols-4">
          {lead && <MosaicTile post={lead} big priority />}
          {companions.slice(0, 4).map((post) => (
            <MosaicTile key={post.slug} post={post} />
          ))}
        </Reveal>
      </section>

      <JournalGrid posts={posts} categories={categories} />

      {/* NEWSLETTER */}
      <section className="px-safe pt-5 pb-section">
        <Reveal className="mx-auto max-w-[1180px] rounded-panel bg-midnight px-[clamp(20px,4vw,56px)] py-[clamp(40px,6vw,64px)] text-center">
          <div className="eyebrow mb-4 text-gold">Care in your inbox</div>
          <h2 className="m-0 mb-6.5 font-display text-[clamp(23px,6.4vw,44px)] leading-[1.05] font-normal text-butter md:text-[clamp(28px,3.6vw,44px)]">
            One gentle read a week. No spam, ever.
          </h2>
          {/* The shared footer form, centred. It used to be a GET form posting to
              /journal, which put the reader's email address into the URL bar and
              every access log on the way. */}
          <div className="flex justify-center [&>form]:mb-0 [&>p]:mb-0">
            <NewsletterForm />
          </div>
        </Reveal>
      </section>
    </PageShell>
  );
}
