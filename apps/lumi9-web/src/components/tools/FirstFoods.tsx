"use client";

import { useState } from "react";
import { ageInMonths } from "@/lib/baby-age";
import { useBabyProfile } from "@/lib/baby-profile";
import {
  AVOID,
  WEANING_STAGES,
  foodsUpTo,
  nextStage,
  stageForAge,
  type Food,
  type WeaningStage,
} from "@/lib/weaning";
import { ToolDisclaimer } from "./ToolDisclaimer";

/**
 * Starting solids, in the foods this kitchen already cooks.
 *
 * The safety list is rendered FIRST in the source and pinned above the stage
 * detail on the page, deliberately. Everything else here is a suggestion a
 * parent can take or leave; honey before twelve months and a whole grape are
 * not, and neither may sit behind a stage a parent has to be on to see.
 */
export function FirstFoods() {
  const profile = useBabyProfile();
  const today = new Date().toISOString().slice(0, 10);
  const profileAge = profile ? ageInMonths(profile.dob, today) : null;

  // Only used when there is no child to read an age from.
  const [pickedMonth, setPickedMonth] = useState<number>(6);
  const age = profileAge ?? pickedMonth;

  const current = stageForAge(age);
  const next = nextStage(current);
  const eating = foodsUpTo(age);
  /* null means "follow the child". Seeding this from `current` looked right and
     was not: on first render there is no profile yet — localStorage is read
     after hydration — so it froze on the fallback stage and stayed there once
     the real age arrived. A parent picking a stage takes over from then on. */
  const [picked, setPicked] = useState<number | null>(null);
  const shown =
    picked === null ? current : (WEANING_STAGES.find((s) => s.fromMonth === picked) ?? current);

  return (
    <section id="first-foods" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        First foods
      </h2>
      <p className="m-0 mb-6 max-w-[58ch] text-sm leading-[1.6] text-muted">
        Ragi, kambu, thinai, pasi paruppu - what to start, when, and in what form. Every stage is a
        range your baby moves through at their own pace, not a date they are late for.
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
            {WEANING_STAGES.map((s) => (
              <option key={s.fromMonth} value={s.fromMonth}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {/* ── Where they are now ── */}
      <div className="rounded-card bg-butter p-card">
        <div className="eyebrow mb-3">
          {profile?.name ? `${profile.name} is here` : "Right now"}
        </div>
        <div className="font-display text-[clamp(24px,3.4vw,34px)] leading-tight text-midnight">
          {current.label}
        </div>
        <p className="m-0 mt-3 max-w-[62ch] text-sm leading-[1.65] text-midnight/80">
          {current.intro}
        </p>
        <dl className="m-0 mt-5 grid grid-cols-1 gap-4 border-t border-midnight/10 pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-[12px] tracking-wide text-midnight/60 uppercase">Texture</dt>
            <dd className="m-0 mt-1 text-sm text-midnight">{current.texture}</dd>
          </div>
          <div>
            <dt className="text-[12px] tracking-wide text-midnight/60 uppercase">Meals a day</dt>
            <dd className="m-0 mt-1 text-sm text-midnight">{current.meals}</dd>
          </div>
        </dl>
        {next ? (
          <p className="m-0 mt-4 text-[13px] leading-[1.55] text-midnight/70">
            Next: <b>{next.label}</b> - {next.texture.toLowerCase()}.
          </p>
        ) : null}
      </div>

      {/* ── Never, and until when ──
          Above the stage detail on purpose. A parent who opens this page on the
          wrong month still has to meet the honey line. */}
      <div className="mt-6">
        <h3 className="m-0 mb-3 text-base font-semibold text-midnight">Not yet, whatever the age</h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {AVOID.map((a) => (
            <li
              key={a.what}
              className={`rounded-chip border px-4 py-3 ${
                a.severity === "danger"
                  ? "border-[#f0c9a0] bg-[#fdf1e2]"
                  : "border-moss-tint bg-transparent"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-midnight">{a.what}</span>
                <span
                  className={`text-[13px] font-semibold ${
                    a.severity === "danger" ? "text-[#b45309]" : "text-muted"
                  }`}
                >
                  {a.when}
                </span>
              </div>
              <p className="m-0 mt-1 text-[13px] leading-[1.55] text-muted">{a.why}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* ── The stages, browsable ── */}
      <div className="mt-7 border-t border-moss-tint pt-6">
        <h3 className="m-0 mb-3 text-base font-semibold text-midnight">Every stage</h3>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Weaning stage">
          {WEANING_STAGES.map((s) => (
            <button
              key={s.fromMonth}
              type="button"
              className="chip btn-sm border-midnight"
              aria-pressed={s.fromMonth === shown.fromMonth}
              onClick={() => setPicked(s.fromMonth)}
            >
              {s.fromMonth === 0 ? "Before 6m" : `${s.fromMonth}m+`}
            </button>
          ))}
        </div>

        <StagePanel stage={shown} isCurrent={shown.fromMonth === current.fromMonth} />
      </div>

      {/* ── What they can already eat ──
          Weaning accumulates. Showing only the current stage's new foods read
          as though the earlier ones had been withdrawn. */}
      {eating.length > 0 ? (
        <div className="mt-7 border-t border-moss-tint pt-6">
          <h3 className="m-0 mb-1 text-base font-semibold text-midnight">
            Everything {profile?.name ?? "your baby"} can eat by now
          </h3>
          <p className="m-0 mb-4 text-[13px] text-muted">
            {eating.length} foods, adding up across the stages so far.
          </p>
          <div className="flex flex-wrap gap-2">
            {eating.map((f) => (
              <span
                key={f.name}
                className="rounded-pill border border-moss-tint px-3.5 py-1.5 text-[13px] text-midnight"
              >
                {f.name}
                {f.local ? <span className="text-muted"> · {f.local}</span> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <ToolDisclaimer source="WHO and IAP infant feeding guidance" />
    </section>
  );
}

function StagePanel({ stage, isCurrent }: { stage: WeaningStage; isCurrent: boolean }) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="m-0 font-display text-[clamp(18px,2.1vw,22px)] leading-tight text-midnight">
          {stage.label}
        </h4>
        {isCurrent ? (
          <span className="rounded-pill bg-moss-tint px-2.5 py-0.5 text-[12px] font-semibold text-moss-deep">
            Where you are
          </span>
        ) : null}
      </div>
      {/* The current stage's intro is already in the card above; repeating it
          two hundred pixels lower is the same paragraph twice on one screen. */}
      {isCurrent ? null : (
        <p className="m-0 mt-2 max-w-[62ch] text-sm leading-[1.65] text-muted">{stage.intro}</p>
      )}

      {stage.newFoods.length > 0 ? (
        <ul className="m-0 mt-5 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
          {stage.newFoods.map((food) => (
            <FoodRow key={food.name} food={food} />
          ))}
        </ul>
      ) : null}

      <p className="m-0 mt-5 rounded-chip bg-moss-tint/40 px-4 py-3 text-sm leading-[1.6] text-midnight">
        {stage.tip}
      </p>
    </div>
  );
}

function FoodRow({ food }: { food: Food }) {
  return (
    <li className="rounded-chip border border-moss-tint px-4 py-3">
      <div className="text-sm font-semibold text-midnight">
        {food.name}
        {food.local ? <span className="font-normal text-muted"> · {food.local}</span> : null}
      </div>
      <div className="mt-1 text-[13px] leading-[1.5] text-muted">{food.form}</div>
      {food.note ? (
        <div className="mt-1.5 text-[13px] leading-[1.5] text-moss-deep">{food.note}</div>
      ) : null}
    </li>
  );
}
