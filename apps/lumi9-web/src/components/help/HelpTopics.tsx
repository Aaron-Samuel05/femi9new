"use client";

import { useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { FAQ_TOPICS, type Faq, type FaqTopic } from "@/lib/content";

/**
 * Topic chips + single-open Q&A accordion.
 *
 * The list arrives as a PROP rather than being imported here, because two
 * answers quote the console's free-shipping threshold and subscription
 * discount. Reading those needs the database, `/help` is a server component
 * that already can, and this is the client half - so the server builds the
 * list once and the same array feeds both this accordion and the FAQPage
 * JSON-LD beside it. One list, so a crawler and a reader cannot be told
 * different things.
 */
export function HelpTopics({ items }: { items: Faq[] }) {
  const [topic, setTopic] = useState<FaqTopic>("All");
  const faqs = items.filter((faq) => topic === "All" || faq.topic === topic);

  return (
    <>
      <div className="scroll-row px-safe mx-auto max-w-[820px] gap-2.5 pt-5 pb-10 sm:flex-wrap sm:justify-center">
        {FAQ_TOPICS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={topic === option}
            onClick={() => setTopic(option)}
            className="chip whitespace-nowrap"
          >
            {option}
          </button>
        ))}
      </div>

      <section className="px-safe mx-auto max-w-[820px] pt-2.5 pb-10">
        {/* keyed so switching topic collapses back to the first answer */}
        <Accordion key={topic} items={faqs} defaultOpen={0} variant="panel" />
      </section>
    </>
  );
}
