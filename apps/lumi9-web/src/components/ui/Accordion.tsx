"use client";

import { useId, useState } from "react";

export type AccordionItem = { q: string; a: string };

/** Single-open accordion with a +/- indicator. `defaultOpen` = -1 for all closed. */
export function Accordion({
  items,
  defaultOpen = 0,
  variant = "flush",
}: {
  items: AccordionItem[];
  defaultOpen?: number;
  variant?: "flush" | "panel";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const baseId = useId();
  const padded = variant === "panel";

  return (
    <div className={padded ? "panel overflow-hidden" : "border-t border-moss-tint"}>
      {items.map((item, index) => {
        const isOpen = open === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;

        return (
          <div key={item.q} className="border-b border-moss-tint last:border-b-0">
            <h3 className="m-0">
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? -1 : index)}
                className={`flex w-full cursor-pointer items-center justify-between gap-4 text-left font-bold text-midnight ${
                  padded
                    ? "px-[clamp(16px,2.4vw,28px)] py-[clamp(16px,2.2vw,24px)] text-[clamp(15px,1.5vw,17px)]"
                    : "py-[clamp(15px,1.8vw,18px)] text-[clamp(15px,1.4vw,16px)]"
                }`}
              >
                {item.q}
                <span
                  aria-hidden
                  className={`shrink-0 text-moss-deep ${padded ? "text-2xl" : "text-[22px]"}`}
                >
                  {isOpen ? "-" : "+"}
                </span>
              </button>
            </h3>
            {/* Rendered whether or not it is open, and hidden with the `hidden`
                attribute rather than unmounted. Two reasons: `aria-controls`
                above pointed at an element that did not exist while collapsed,
                and an answer absent from the server-rendered HTML is an answer
                no crawler can read - which is what makes the FAQPage structured
                data on these pages honest. */}
            <p
              id={panelId}
              hidden={!isOpen}
              role="region"
              aria-labelledby={buttonId}
              className={`m-0 text-muted ${
                padded
                  ? "px-[clamp(16px,2.4vw,28px)] pb-[clamp(18px,2.4vw,26px)] text-[clamp(14px,1.4vw,16px)] leading-[1.7]"
                  : "mb-5 max-w-[62ch] text-[clamp(14px,1.3vw,15px)] leading-[1.65]"
              }`}
            >
              {item.a}
            </p>
          </div>
        );
      })}
    </div>
  );
}
