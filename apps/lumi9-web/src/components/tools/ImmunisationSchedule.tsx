"use client";

import { useState } from "react";
import { useBabyProfile } from "@/lib/baby-profile";
import {
  hasScheduleData,
  IAP_SOURCE,
  SCHEDULE_REVISED_ON,
  scheduleFor,
  UIP_SOURCE,
  type VaccineTrack,
} from "@/lib/immunisation-schedule";
import { ToolDisclaimer } from "./ToolDisclaimer";

export function ImmunisationSchedule() {
  const profile = useBabyProfile();
  const [track, setTrack] = useState<VaccineTrack>("UIP");
  const today = new Date().toISOString().slice(0, 10);
  const ready = hasScheduleData();

  return (
    <section id="immunisation" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        Vaccination schedule
      </h2>
      <p className="m-0 mb-5 max-w-[52ch] text-sm text-muted">
        India runs two schedules. The government one is free at any public health centre; the IAP
        one adds optional vaccines usually given privately.
      </p>

      {!ready ? (
        /* Says plainly that it is not ready rather than rendering an empty list
           that reads as a bug. Nothing here is guessed while the real schedule
           is unsourced. */
        <p className="m-0 rounded-chip border border-moss-tint px-4 py-3 text-sm text-muted">
          We&apos;re finalising this against the current published Indian schedules and will turn it
          on once it&apos;s verified. In the meantime your paediatrician or any public health centre
          has the up-to-date card.
        </p>
      ) : (
        <>
          <div className="mb-5 inline-flex rounded-pill border border-moss-tint p-1" role="tablist">
            {(["UIP", "IAP"] as VaccineTrack[]).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={track === option}
                onClick={() => setTrack(option)}
                className={`cursor-pointer rounded-pill px-4 py-2 text-sm font-semibold transition-colors ${
                  track === option ? "bg-midnight text-butter" : "text-muted hover:text-midnight"
                }`}
              >
                {option === "UIP" ? "Government (UIP)" : "IAP"}
              </button>
            ))}
          </div>

          {!profile ? (
            <p className="m-0 text-sm text-muted">
              Add your baby&apos;s date of birth above to see dates.
            </p>
          ) : (
            <>
              <p className="m-0 mb-4 text-[13px] text-muted">
                Dates run from your baby&apos;s actual birthday. Vaccination is never adjusted for
                being born early, even when growth is.
              </p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {scheduleFor({ dob: profile.dob, today, track }).map((dose) => (
                  <li
                    key={dose.id}
                    className={`flex flex-wrap items-baseline justify-between gap-2 rounded-chip border border-moss-tint px-4 py-3 ${
                      dose.status === "past" ? "opacity-55" : ""
                    }`}
                  >
                    <span className="text-sm font-semibold text-midnight">
                      {dose.vaccine} <span className="font-normal text-muted">· {dose.dose}</span>
                    </span>
                    <span className="text-sm text-muted">
                      {dose.dueOn}
                      {dose.status === "due" ? " · due now" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <ToolDisclaimer
            source={track === "UIP" ? UIP_SOURCE : IAP_SOURCE}
            revisedOn={SCHEDULE_REVISED_ON}
          />
        </>
      )}
    </section>
  );
}
