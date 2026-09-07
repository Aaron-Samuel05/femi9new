"use client";

import { useState } from "react";
import { ageInMonths } from "@/lib/baby-age";
import { useBabyProfile } from "@/lib/baby-profile";
import {
  SLEEP_BANDS,
  bandForAge,
  formatClock,
  formatDuration,
  parseClock,
  planDay,
} from "@/lib/sleep-guide";
import { ToolDisclaimer } from "./ToolDisclaimer";

/**
 * Wake windows, and the day they imply.
 *
 * The question this answers is the one a parent asks out loud several times a
 * day - "she woke at 6:30, when does she go down?" - and which no amount of
 * general advice about sleep answers. It needs nothing but a date of birth, so
 * it works for a parent who never fills the profile in: the band picker is the
 * fallback, not an afterthought.
 *
 * Everything is presented as a RANGE, because that is what the evidence is. A
 * single time would read as a deadline, and a parent who missed it by ten
 * minutes would think they had done something wrong.
 */
export function SleepPlanner() {
  const profile = useBabyProfile();
  const today = new Date().toISOString().slice(0, 10);
  const profileAge = profile ? ageInMonths(profile.dob, today) : null;

  // Only used when there is no profile to read an age from.
  const [pickedMonth, setPickedMonth] = useState<number>(6);
  const [wokeAt, setWokeAt] = useState("06:30");

  const band = bandForAge(profileAge ?? pickedMonth);
  const wakeMinutes = parseClock(wokeAt);
  const day = wakeMinutes === null ? [] : planDay({ wakeAtMinutes: wakeMinutes, band });

  return (
    <section id="sleep" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        Naps &amp; bedtime
      </h2>
      <p className="m-0 mb-6 max-w-[56ch] text-sm leading-[1.6] text-muted">
        How long your baby can comfortably stay awake, and what that makes of today. Overtired
        babies fight sleep hardest, so the wake window is usually the thing to fix first.
      </p>

      {profileAge === null ? (
        <label className="mb-6 block max-w-[280px]">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">
            How old is your baby?
          </span>
          <select
            className="field"
            value={pickedMonth}
            onChange={(e) => setPickedMonth(Number(e.target.value))}
          >
            {SLEEP_BANDS.map((b) => (
              <option key={b.fromMonth} value={b.fromMonth}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Fact
          label="Awake between sleeps"
          value={`${formatDuration(band.wakeWindowMin)} – ${formatDuration(band.wakeWindowMax)}`}
        />
        <Fact
          label="Naps a day"
          value={band.napsMin === band.napsMax ? `${band.napsMax}` : `${band.napsMin}–${band.napsMax}`}
        />
        <Fact label="Sleep in 24 hours" value={`${band.totalMin}–${band.totalMax} hours`} />
      </div>

      <p className="m-0 mt-4 rounded-chip bg-moss-tint/40 px-4 py-3 text-sm leading-[1.6] text-midnight">
        <b className="font-semibold">{band.label}.</b> {band.note}
      </p>

      {/* ── Today ── */}
      <div className="mt-7 border-t border-moss-tint pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="m-0 text-base font-semibold text-midnight">Today</h3>
            <p className="m-0 mt-1 max-w-[44ch] text-[13px] leading-[1.55] text-muted">
              Built from the wake windows above, assuming each nap runs its usual length. Watch
              your baby rather than the clock - the later ones drift.
            </p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-midnight">Woke up at</span>
            <input
              type="time"
              className="field w-[150px]"
              value={wokeAt}
              onChange={(e) => setWokeAt(e.target.value)}
            />
          </label>
        </div>

        {day.length > 0 ? (
          <ol className="m-0 mt-5 flex list-none flex-col p-0">
            {day.map((event, i) => (
              <li key={`${event.kind}-${i}`} className="flex gap-4">
                {/* The spine: a dot per event, joined by a rule that stops at
                    the last one so the timeline does not trail into nothing. */}
                <div aria-hidden className="flex flex-col items-center">
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                      event.kind === "bedtime" ? "bg-midnight" : "bg-moss-soft"
                    }`}
                  />
                  {i < day.length - 1 ? <span className="w-px flex-1 bg-moss-tint" /> : null}
                </div>
                <div className="pb-5">
                  <div className="font-display text-[clamp(17px,1.9vw,21px)] leading-none text-midnight">
                    around {formatClock(event.at)}
                  </div>
                  <div className="mt-1.5 text-sm text-muted">{event.label}</div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 mt-5 text-sm text-muted">
            Enter the time your baby woke up and the day fills in.
          </p>
        )}
      </div>

      <ToolDisclaimer source="AASM/AAP consensus on sleep duration, with published wake-window ranges" />
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-chip border border-moss-tint px-4 py-3.5">
      <div className="text-[12px] tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1.5 font-display text-[clamp(18px,2vw,22px)] leading-none text-midnight">
        {value}
      </div>
    </div>
  );
}
