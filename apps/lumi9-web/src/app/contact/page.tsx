import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { ContactForm } from "@/components/contact/ContactForm";
import { Em } from "@/components/ui/bits";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BRAND } from "@/lib/content";
import { absoluteUrl, canonical, og } from "@/lib/seo";
import { storefrontNumbers } from "@/lib/settings.server";

const TITLE = "Contact Lumi9 | Baby Diaper Support";
const DESCRIPTION =
  "Questions about diaper sizing, an order, or a bulk enquiry? The Lumi9 care team replies within a few hours.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: canonical("/contact"),
  openGraph: og({ type: "website", url: absoluteUrl("/contact"), title: TITLE, description: DESCRIPTION }),
};

/**
 * The support channels.
 *
 * A function of the WhatsApp number rather than a constant, because
 * `Settings.whatsappNumber` is a field the console offers and this page was the
 * only surface that could have used it. The number was written here as a
 * literal instead, so an ops team changing it in the console changed nothing a
 * customer could dial - a control that looks live and moves nothing.
 */
const channels = (whatsappNumber: string): { icon: IconName; label: string; value: string; href?: string }[] => [
  { icon: "mail", label: "Email", value: BRAND.email, href: `mailto:${BRAND.email}` },
  { icon: "phone", label: "Phone", value: BRAND.phone, href: `tel:${BRAND.phone.replace(/\s/g, "")}` },
  { icon: "chat", label: "WhatsApp", value: BRAND.whatsapp, href: `https://wa.me/${whatsappNumber}` },
  { icon: "pin", label: "Head office", value: BRAND.fullAddress },
];

export default async function ContactPage() {
  const { whatsappNumber } = await storefrontNumbers();
  const CHANNELS = channels(whatsappNumber);

  return (
    <PageShell links={NAV_LINKS}>
      <section className="page-wrap grid grid-cols-1 items-start gap-block pt-[clamp(40px,5.5vw,72px)] pb-section md:grid-cols-2">
        <div>
          <div className="eyebrow mb-4">Get in touch</div>
          <h1 className="m-0 mb-5 font-display text-[clamp(29px,7.8vw,58px)] md:text-[clamp(34px,4.4vw,58px)] font-normal leading-[1.02]">
            We&apos;d love to <Em>hear</Em> from you.
          </h1>
          <p className="m-0 mb-10 max-w-[44ch] text-body leading-[1.6] text-muted">
            Questions about sizing, an order, or a bulk enquiry? Our care team replies within a few hours, every day.
          </p>

          <ul className="m-0 flex list-none flex-col gap-[clamp(10px,1.4vw,18px)] p-0">
            {CHANNELS.map((channel) => {
              const content = (
                <>
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-moss-tint text-moss-deep">
                    <Icon name={channel.icon} size={22} strokeWidth={1.7} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold text-midnight">{channel.label}</span>
                    <span className="text-[clamp(13px,1.2vw,14px)] break-words text-muted">{channel.value}</span>
                  </span>
                </>
              );

              return (
                <li key={channel.label}>
                  {channel.href ? (
                    <a
                      href={channel.href}
                      className="flex items-center gap-4 rounded-chip border border-moss-tint bg-canvas px-[clamp(14px,1.8vw,22px)] py-[clamp(14px,1.8vw,20px)] transition-colors hover:border-moss-soft"
                    >
                      {content}
                    </a>
                  ) : (
                    <div className="flex items-center gap-4 rounded-chip border border-moss-tint bg-canvas px-[clamp(14px,1.8vw,22px)] py-[clamp(14px,1.8vw,20px)]">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <ContactForm />
      </section>
    </PageShell>
  );
}
