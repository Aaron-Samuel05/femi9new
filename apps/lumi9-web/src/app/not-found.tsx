import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";

const QUICK_LINKS = [
  { label: "Find your size", href: "/size-guide" },
  { label: "Subscription", href: "/subscription" },
  { label: "Help centre", href: "/help" },
  { label: "Contact us", href: "/contact" },
];


export default function NotFound() {
  return (
    <PageShell links={NAV_LINKS}>
      <section
        className="px-safe relative flex min-h-[70svh] flex-col items-center justify-center overflow-hidden py-[clamp(48px,8vw,80px)] text-center"
        style={{ background: "radial-gradient(120% 90% at 50% 10%, #eef1e0 0%, #f7f5ea 60%)" }}
      >
        <div
          className="absolute top-[18%] left-[8%] size-[clamp(64px,12vw,120px)] rounded-full bg-butter opacity-50 motion-safe:animate-floaty"
          aria-hidden
        />
        <div
          className="absolute right-[10%] bottom-[20%] size-[clamp(44px,8vw,80px)] rounded-full bg-moss-soft opacity-40 motion-safe:animate-floaty"
          style={{ animationDuration: "5.5s", animationDelay: ".6s" }}
          aria-hidden
        />

        <div className="relative z-2">
          <div className="font-display text-[clamp(120px,20vw,240px)] leading-[0.9] tracking-[-0.03em] text-moss-deep">
            404
          </div>
          <h1 className="m-0 mt-2.5 mb-3.5 font-display text-[clamp(28px,3.6vw,44px)] font-normal">
            This page took a nap.
          </h1>
          <p className="mx-auto m-0 mb-8 max-w-[46ch] text-body text-muted">
            We couldn&apos;t find what you were looking for - but there&apos;s plenty of soft, dry comfort waiting back
            home.
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <Link href="/" className="btn btn-dark font-bold max-[400px]:w-full">
              Back home
            </Link>
            <Link href="/shop" className="btn btn-ghost max-[400px]:w-full">
              Shop Cloud Soft
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-x-[clamp(14px,2.4vw,22px)] gap-y-3 text-sm">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center coarse:min-h-11 text-moss-deep hover:text-midnight"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
