"use client";

import { useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { FAQS, FAQ_TOPICS, type FaqTopic } from "@/lib/content";

/** Topic chips + single-open Q&A accordion. */
export function HelpTopics() {
  const [topic, setTopic] = useState<FaqTopic>("All");
  const faqs = FAQS.filter((faq) => topic === "All" || faq.topic === topic);

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
