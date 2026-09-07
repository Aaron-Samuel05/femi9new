"use client";

import { useState } from "react";
import { useBabyProfile } from "@/lib/baby-profile";
import { setVaccination, useVaccinations } from "@/lib/baby-vaccinations";
import {
  IAP_SOURCE,
  SCHEDULE_REVISED_ON,
  scheduleFor,
  UIP_SOURCE,
  type ScheduledDose,
  type VaccineTrack,
} from "@/lib/immunisation-schedule";
import { useParenting } from "@/lib/parenting-context";
import { ToolDisclaimer } from "./ToolDisclaimer";

/**
 * The schedule, dated from the baby's birthday, with what the parent has
 * actually ticked off.
 *
 * The doses come from the DATABASE now (`useParenting()`), not from
 * `immunisation-schedule.data.ts` — that module is the seed's input, the same
 * relationship `catalog.ts` has to the catalogue. Correcting a published dose
 * age is a console edit, not a deploy.
 *
 * The ticks are new, and they are the point. `status` here is still the
 * CALENDAR's answer — due, upcoming, past — and a calendar knows nothing about
 * whether a baby was taken. A record the parent sets is the only thing that
 * does, which is why the dashboard's "done" count reads these and not the dates.
 */
export function ImmunisationSchedule() {
  const profile = useBabyProfile();
  const { schedule, tracks, ready, signedIn } = useParenting();
  // This child's ticks. Siblings follow the same schedule on different
  // dates, so a single account-wide map would mark the younger one's doses
  // given the moment the elder had them.
  const records = useVaccinations(profile?.id ?? null);
  const [track, setTrack] = useState<VaccineTrack>(tracks[0] ?? "UIP");
  const today = new Date().toISOString().slice(0, 10);

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
           that reads as a bug. This mattered when the doses were a module and
           matters MORE now: an unseeded `lumi9` schema is a far easier state to
           reach than a half-written file ever was. */
        <p className="m-0 rounded-chip border border-moss-tint px-4 py-3 text-sm text-muted">
          We&apos;re finalising this against the current published Indian schedules and will turn it
          on once it&apos;s verified. In the meantime your paediatrician or any public health centre
          has the up-to-date card.
        </p>
      ) : (
        <>
          {/* Only a real choice gets a selector. A tab that opens onto an empty
              list reads as a broken page rather than as missing data. */}
          {tracks.length > 1 ? (
            <div className="mb-5 inline-flex rounded-pill border border-moss-tint p-1" role="tablist">
              {tracks.map((option) => (
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
          ) : (
            <p className="m-0 mb-5 text-[13px] text-muted">
              Showing the free government schedule. The IAP list of optional vaccines is not
              included yet.
            </p>
          )}

          {!profile ? (
            <p className="m-0 text-sm text-muted">
              Add your baby&apos;s date of birth above to see dates.
            </p>
          ) : (
            <>
              <p className="m-0 mb-4 text-[13px] text-muted">
                Dates run from your baby&apos;s actual birthday. Vaccination is never adjusted for
                being born early, even when growth is. Tick each one off as it&apos;s given -{" "}
                {signedIn
                  ? "your ticks are saved to your account."
                  : "your ticks stay on this device."}
              </p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {scheduleFor({ dob: profile.dob, today, track }, schedule).map((dose) => (
                  <DoseRow
                    key={dose.id}
                    babyId={profile.id}
                    dose={dose}
                    given={records[dose.id]?.status === "given"}
                  />
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

/**
 * One dose.
 *
 * The tick is a checkbox, not a button, because that is what it is: a
 * two-state, reversible claim about a real event. Un-ticking DELETES the record
 * rather than storing a "not given" — a vaccination list where a mis-tap cannot
 * be taken back is one nobody will trust enough to use.
 *
 * `today` is read here rather than passed down because it is only the date
 * stamped on a tick the parent has just made; a row rendered at 23:59 and
 * ticked at 00:01 should carry the later day, which is the one they would write
 * on the card.
 */
function DoseRow({
  babyId,
  dose,
  given,
}: {
  /* Passed in rather than read from the selection here: a tick is a claim about
     ONE child, and a row that resolved the current child itself could write
     against a different one than the list it is rendered in. */
  babyId: string;
  dose: ScheduledDose;
  given: boolean;
}) {
  return (
    <li
      className={`flex flex-wrap items-baseline justify-between gap-2 rounded-chip border px-4 py-3 transition-colors ${
        given
          ? "border-moss-soft bg-moss-tint/30"
          : dose.status === "past"
            ? "border-moss-tint opacity-55"
            : "border-moss-tint"
      }`}
    >
      <label className="flex flex-1 cursor-pointer items-baseline gap-3">
        <input
          type="checkbox"
          checked={given}
          onChange={(e) =>
            void setVaccination(
              babyId,
              dose.id,
              e.target.checked ? "given" : null,
              new Date().toISOString().slice(0, 10),
            )
          }
          /* 13px by default and the only control in the row - the coarse box
             gives it a thumb-sized target without changing how it looks with a
             mouse, the same treatment the diapers-per-day slider gets. */
          className="mt-1 size-4 shrink-0 cursor-pointer accent-moss-deep coarse:size-6"
        />
        <span className={`text-sm font-semibold text-midnight ${given ? "line-through decoration-moss-deep/40" : ""}`}>
          {dose.vaccine} <span className="font-normal text-muted">· {dose.dose}</span>
          {dose.note ? (
            <span className="mt-0.5 block text-[12px] font-normal text-muted no-underline">
              {dose.note}
            </span>
          ) : null}
        </span>
      </label>
      <span className="text-sm whitespace-nowrap text-muted">
        {dose.dueOn}
        {given ? " · done" : dose.status === "due" ? " · due now" : ""}
      </span>
    </li>
  );
}
