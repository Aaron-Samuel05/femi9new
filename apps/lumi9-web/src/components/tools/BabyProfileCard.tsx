"use client";

import { useState } from "react";
import { ageInDays, ageInMonths } from "@/lib/baby-age";
import {
  BLOOD_GROUPS,
  MAX_CHILDREN,
  localBabyId,
  removeBaby,
  saveBabyProfile,
  selectBaby,
  useBabies,
  useBabyProfile,
  useProfileSync,
  type BabyProfile,
  type BabySex,
  type BloodGroup,
} from "@/lib/baby-profile";
import { forgetBabyVaccinations } from "@/lib/baby-vaccinations";
import { useCatalogData } from "@/lib/catalog-context";
import { defaultPerDay } from "@/lib/diaper-planning";
import { scheduleFor } from "@/lib/immunisation-schedule";
import { useParenting } from "@/lib/parenting-context";
import { sizeForWeight } from "@/lib/size-projection";

/**
 * One profile, read by every tool.
 *
 * Nothing here gates anything: a parent who skips it still gets working tools,
 * they just type more. That is why there is no "continue" step and no validation
 * beyond what the maths genuinely needs.
 *
 * **The card answers before it is saved.** The right-hand panel runs the same
 * functions the tools run, on whatever has been typed so far, so a parent can
 * see what the page is FOR without committing anything. That is the whole
 * reason the layout is two columns: the form used to be eight identical inputs
 * above a dashboard that rendered `null` until they were filled, so the page's
 * first impression was a form with no visible reason to fill it in.
 *
 * **Only two answers are load-bearing** - date of birth and sex - and the card
 * is arranged to say so. Everything else lives behind a disclosure, labelled by
 * what it unlocks rather than by what it is, because "Height (cm)" does not
 * tell a tired parent why they should bother.
 *
 * **The resting card no longer states where a child is stored.** It used to
 * carry a line bound to `useProfileOrigin()` — "Saved on this device only" for
 * a guest, "Saved to your account" once signed in — because a page that says
 * "stays on this device" while POSTing a child's date of birth is lying. The
 * line is gone by request now that children are account rows; what stays is the
 * FAILURE line, because a card that says nothing after a write that did not
 * land is a different thing from one that is merely quiet.
 *
 * The email is never stored either way. It belongs to the care-plan REQUEST, not
 * to the baby: the server keeps a `ParentingLead` because that is a record of
 * consent with an owner, and the browser keeps nothing. It sits below the save
 * button rather than in the grid of baby details for the same reason - it is a
 * different kind of thing, and putting it in the grid read as a ninth fact about
 * the child.
 */
export function BabyProfileCard() {
  const babies = useBabies();
  const profile = useBabyProfile();
  const sync = useProfileSync();
  const { signedIn, schedule: doses } = useParenting();
  const { getSizeOrDefault, sizeBounds } = useCatalogData();
  /* null = showing the saved card. A baby id = editing that child. "new" =
     adding one. A boolean could not tell the last two apart, and "add" reusing
     "edit" is exactly how a second child overwrites the first. */
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const [name, setName] = useState(profile?.name ?? "");
  const [dob, setDob] = useState(profile?.dob ?? "");
  const [sex, setSex] = useState<BabySex | "">(profile?.sex ?? "");
  const [weight, setWeight] = useState(profile?.weightKg?.toString() ?? "");
  const [height, setHeight] = useState(profile?.heightCm?.toString() ?? "");
  const [preterm, setPreterm] = useState(profile?.gestationalWeeks?.toString() ?? "");
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | "">(profile?.bloodGroup ?? "");
  // Deliberately NOT seeded from the profile: it is not stored any more, so
  // there is nothing to seed it from. A parent who wants a second plan types the
  // address again, which is the honest amount of friction for "send me an email".
  const [email, setEmail] = useState("");

  const [mail, setMail] = useState<
    { state: "idle" } | { state: "sending" } | { state: "sent"; to: string } | { state: "error"; msg: string }
  >({ state: "idle" });

  const today = new Date().toISOString().slice(0, 10);
  const emailValid = email.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSave = dob !== "" && dob <= today && (sex === "male" || sex === "female") && emailValid;

  async function save() {
    if (!canSave) return;
    const trimmedEmail = email.trim().toLowerCase();

    // Awaited, so the account write is in flight (and its failure already
    // surfaced) before the card flips back to its summary view.
    const saved = await saveBabyProfile({
      // An existing child keeps its id; a new one is minted here and swapped
      // for the server's row id when the write lands.
      id: editing && editing !== "new" ? editing : localBabyId(),
      name: name.trim() || undefined,
      dob,
      sex: sex as BabySex,
      weightKg: weight ? Number(weight) : undefined,
      heightCm: height ? Number(height) : undefined,
      gestationalWeeks: preterm ? Number(preterm) : undefined,
      bloodGroup: bloodGroup || undefined,
    });
    // Refused: everything typed stays on screen with the reason beside the
    // button, rather than being discarded and explained on another view.
    if (saved === "too-many") return;
    setEditing(null);

    if (!trimmedEmail) {
      setMail({ state: "idle" });
      return;
    }
    setMail({ state: "sending" });
    try {
      const res = await fetch("/api/parenting/care-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          name,
          dob,
          sex,
          bloodGroup,
          // Which tool page asked, so the lead list can tell an entry point that
          // works from one that nobody ever reaches.
          source: window.location.pathname,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) setMail({ state: "sent", to: trimmedEmail });
      else setMail({ state: "error", msg: data.error ?? "We couldn't send the email just now." });
    } catch {
      setMail({ state: "error", msg: "We couldn't send the email just now." });
    }
    // Cleared whichever way it went: the field is a one-shot request, not a
    // stored preference, and leaving an address sitting in an input on a page
    // about somebody's child is the kind of thing a shared laptop punishes.
    setEmail("");
  }

  function loadInto(baby: BabyProfile | null) {
    setName(baby?.name ?? "");
    setDob(baby?.dob ?? "");
    setSex(baby?.sex ?? "");
    setWeight(baby?.weightKg?.toString() ?? "");
    setHeight(baby?.heightCm?.toString() ?? "");
    setPreterm(baby?.gestationalWeeks?.toString() ?? "");
    setBloodGroup(baby?.bloodGroup ?? "");
    setEmail("");
  }

  function beginEdit() {
    if (!profile) return;
    loadInto(profile);
    setEditing(profile.id);
  }

  /* Blank fields, not the selected child's. Prefilling from a sibling is how a
     parent ends up with two children who share a birthday they never typed. */
  function beginAdd() {
    loadInto(null);
    setEditing("new");
  }

  if (profile && editing === null) {
    return (
      <div className="flex flex-col gap-4">
        <ChildSwitcher
          babies={babies}
          selectedId={profile.id}
          onSelect={selectBaby}
          onAdd={beginAdd}
        />
        <SavedCard
          profile={profile}
          sync={sync}
          mail={mail}
          today={today}
          sizeBounds={sizeBounds}
          getSizeOrDefault={getSizeOrDefault}
          onEdit={beginEdit}
          onRemove={() => {
            void removeBaby(profile.id);
            // The ticks go with the child. A record keyed to an id no child has
            // any more is invisible and would resurface if the id were reused.
            forgetBabyVaccinations(profile.id);
          }}
        />
      </div>
    );
  }

  /* ── The live answer, from whatever has been typed so far ──
     Same functions the tools call, so nothing here can quietly disagree with
     the page a parent lands on next. Each value is null until its own inputs
     exist, and the panel prints the missing input rather than a zero. */
  const dobUsable = dob !== "" && dob <= today;
  const ageMonths = dobUsable ? ageInMonths(dob, today) : null;
  const perDay = ageMonths === null ? null : defaultPerDay(ageMonths);
  const weightKg = weight === "" ? null : Number(weight);
  const sizeCode =
    weightKg !== null && Number.isFinite(weightKg) && weightKg > 0
      ? sizeForWeight(weightKg, sizeBounds)
      : null;
  const size = sizeCode ? getSizeOrDefault(sizeCode) : null;
  const dueNow = dobUsable
    ? scheduleFor({ dob, today, track: "UIP" }, doses).filter((d) => d.status === "due").length
    : null;

  const missing = !dobUsable
    ? "Add a date of birth to see this fill in."
    : sex === ""
      ? "One more - girl or boy - and every tool is ready."
      : null;

  return (
    <div className="flex flex-col gap-4">
      {babies.length > 0 ? (
        <ChildSwitcher
          babies={babies}
          selectedId={editing !== "new" && editing !== null ? editing : null}
          /* Leaving the form as well as switching. Selecting alone changed the
             child every tool answered about while the form carried on showing
             a different one — the chip looked broken because nothing above the
             fold moved. */
          onSelect={(id) => {
            selectBaby(id);
            setEditing(null);
          }}
          /* Already adding one; a second "add" would only wipe the fields. */
          onAdd={editing === "new" ? null : beginAdd}
        />
      ) : null}
      <div className="panel overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
        {/* ── The questions ── */}
        <div className="p-card-lg">
          <h2 className="m-0 mb-1.5 font-display text-[clamp(21px,2.6vw,30px)] font-normal leading-tight">
            {editing === "new"
              ? "Add a child"
              : babies.length > 0
                ? "Edit their details"
                : "Tell us about your baby"}
          </h2>
          <p className="m-0 mb-6 max-w-[46ch] text-sm leading-[1.6] text-muted">
            {editing === "new"
              ? "Two answers, same as the first. Each child keeps their own growth chart and their own vaccination record."
              : "Two answers is all it takes - every tool on the page reads it from here."}
          </p>

          <div className="flex max-w-[440px] flex-col gap-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-midnight">
                Baby&apos;s name <span className="font-normal text-muted">(optional)</span>
              </span>
              <input
                className="field"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-midnight">
                When were they born?
              </span>
              <input
                type="date"
                className="field"
                max={today}
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                aria-describedby="dob-help"
              />
              <span id="dob-help" className="mt-1.5 block text-[13px] leading-[1.5] text-muted">
                Every vaccination date is counted from this day.
              </span>
            </label>

            <div>
              {/* Two chips rather than a dropdown: it is a choice between two
                  named things, and a <select> made a one-tap answer into three.
                  `aria-pressed` toggles are the pattern the size chips on the
                  homepage already use. */}
              <span className="mb-2 block text-sm font-semibold text-midnight">Girl or boy?</span>
              <div className="flex gap-2.5" role="group" aria-label="Sex">
                {(
                  [
                    ["female", "Girl"],
                    ["male", "Boy"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={sex === value}
                    onClick={() => setSex(value)}
                    className="chip flex-1 border-midnight sm:flex-none sm:min-w-[104px]"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="mt-1.5 block text-[13px] leading-[1.5] text-muted">
                The WHO growth charts are different for each, so percentiles need it.
              </span>
            </div>

            {/* Everything below is genuinely optional, so it is folded away and
                each field is labelled by what it UNLOCKS. `<details>` because it
                is keyboard-operable and open-by-default-on-print for free. */}
            <details className="group border-t border-moss-tint pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-moss-deep coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                Add weight, height and more
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-midnight">
                    Weight (kg)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    className="field"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    aria-describedby="weight-help"
                  />
                  <span id="weight-help" className="mt-1.5 block text-[13px] leading-[1.5] text-muted">
                    Unlocks the diaper size and the size-up date.
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-midnight">
                    Height (cm)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    className="field"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    aria-describedby="height-help"
                  />
                  <span id="height-help" className="mt-1.5 block text-[13px] leading-[1.5] text-muted">
                    Unlocks the height-for-age percentile.
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-midnight">
                    Blood group
                  </span>
                  <select
                    className="field"
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value as BloodGroup | "")}
                    aria-describedby="blood-help"
                  >
                    <option value="">Select</option>
                    {BLOOD_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <span id="blood-help" className="mt-1.5 block text-[13px] leading-[1.5] text-muted">
                    Printed on the care plan. Never used in any calculation.
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-midnight">
                    Weeks at birth, if early
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="22"
                    max="42"
                    className="field"
                    value={preterm}
                    onChange={(e) => setPreterm(e.target.value)}
                    aria-describedby="preterm-help"
                  />
                  <span id="preterm-help" className="mt-1.5 block text-[13px] leading-[1.5] text-muted">
                    Corrects growth percentiles. Vaccination dates are never corrected.
                  </span>
                </label>
              </div>
            </details>
          </div>
        </div>

        {/* ── The answer, live ── */}
        <div className="bg-butter p-card-lg lg:border-l lg:border-moss-tint">
          <div className="eyebrow mb-4">What we work out</div>

          <div className="font-display text-[clamp(24px,3vw,34px)] leading-none text-midnight">
            {name.trim() || "Your baby"}
          </div>
          <div className="mt-2 text-sm text-midnight/70">
            {ageMonths === null ? "Age appears here" : describeAge(dob, today)}
          </div>

          <dl className="m-0 mt-6 flex flex-col">
            <PreviewRow
              label="Diaper size"
              value={size ? size.size : null}
              hint="Add a weight"
            />
            <PreviewRow
              label="Diapers a day"
              value={perDay === null ? null : `about ${perDay}`}
              hint="Add a birthday"
            />
            <PreviewRow
              label="Vaccinations due now"
              value={dueNow === null ? null : String(dueNow)}
              hint="Add a birthday"
              accent={dueNow !== null && dueNow > 0}
            />
          </dl>

          <p className="m-0 mt-6 border-t border-midnight/10 pt-4 text-[13px] leading-[1.6] text-midnight/70">
            {missing ?? (
              <>
                That&apos;s everything the tools need. Save it and the diaper planner, growth chart,
                size-up date and vaccination schedule all open with {name.trim() || "your baby"}
                &apos;s numbers already in them.
              </>
            )}
          </p>

          {/* The button lives beside the answer it produces, not at the foot of
              the questions. It is also what stops this column being a tall
              yellow void while a parent is still typing. */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-dark"
              disabled={!canSave || sync.state === "saving"}
              onClick={() => void save()}
            >
              {sync.state === "saving" ? "Saving…" : email.trim() ? "Save & email my plan" : "Save"}
            </button>
            {babies.length > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
            ) : null}
          </div>

          {/* The form used to render no sync state at all, so a refused save
              looked like a dead button. */}
          {sync.state === "error" ? (
            <p className="m-0 mt-3 max-w-[46ch] text-sm leading-[1.5] text-[#b45309]">
              {sync.message}
            </p>
          ) : null}

          <p className="m-0 mt-3.5 max-w-[46ch] text-[13px] leading-[1.55] text-midnight/70">
            {signedIn ? (
              <>Saves to your Lumi9 account, so it&apos;s on your phone as well as here.</>
            ) : (
              <>
                Stays on this device.{" "}
                <a href="/login?next=%2Fparenting-tools" className="underline">
                  Sign in
                </a>{" "}
                to keep it on your account instead, or skip it and use the tools directly.
              </>
            )}
          </p>

          {/* A different kind of thing from the baby's details, and separated so
              it reads that way: it belongs to the care-plan request, not to the
              child. The white surface is what keeps it from reading as a fourth
              row of the answer above. */}
          <div className="mt-6 rounded-chip bg-canvas p-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-midnight">
                Email me the plan <span className="font-normal text-muted">(optional)</span>
              </span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                className="field border-moss-tint"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!emailValid}
                aria-describedby={emailValid ? "email-help" : "email-help email-error"}
              />
            </label>
            <span id="email-help" className="mt-1.5 block text-[13px] leading-[1.55] text-muted">
              One email with a care plan and the upcoming vaccination dates. We keep the address so
              we can send it, and nothing else.
            </span>
            {emailValid ? null : (
              <span id="email-error" className="mt-1 block text-[13px] font-semibold text-[#b45309]">
                That doesn&apos;t look like an email address.
              </span>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

/**
 * The children on this account, and the way between them.
 *
 * A row of chips rather than a dropdown: a parent has two or three children,
 * not a list, and every one of them should be one tap away with their name
 * visible. It renders for a single child too — that is what makes "you can add
 * another" discoverable before there is anything to switch to.
 */
function ChildSwitcher({
  babies,
  selectedId,
  onSelect,
  onAdd,
}: {
  babies: BabyProfile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Null hides the control — there is nothing sensible for it to do. */
  onAdd: (() => void) | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Your children">
      {babies.map((baby, i) => (
        <button
          key={baby.id}
          type="button"
          className="chip btn-sm border-midnight"
          aria-pressed={baby.id === selectedId}
          onClick={() => onSelect(baby.id)}
        >
          {baby.name || `Child ${i + 1}`}
        </button>
      ))}
      {onAdd && babies.length < MAX_CHILDREN ? (
        <button
          type="button"
          onClick={onAdd}
          className="chip btn-sm border-dashed border-moss-soft text-moss-deep"
        >
          + Add a child
        </button>
      ) : null}
    </div>
  );
}

/** One label/value pair in the live panel. A dash is never printed on its own -
 *  the row says which input is missing instead, because "-" is not an answer. */
function PreviewRow({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | null;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-midnight/10 py-3 first:border-t-0 first:pt-0">
      <dt className="text-sm text-midnight/70">{label}</dt>
      <dd
        className={`m-0 text-right font-display text-[clamp(17px,1.8vw,21px)] leading-none ${
          value === null ? "text-midnight/35" : accent ? "text-[#b45309]" : "text-midnight"
        }`}
      >
        {value ?? <span className="font-ui text-[13px]">{hint}</span>}
      </dd>
    </div>
  );
}

/**
 * The saved profile, at rest.
 *
 * It leads with the age rather than the raw ISO date it used to print: "Born
 * 2026-03-01" is the value the form collected, not the fact a parent wants back.
 */
function SavedCard({
  profile,
  sync,
  mail,
  today,
  sizeBounds,
  getSizeOrDefault,
  onEdit,
  onRemove,
}: {
  profile: NonNullable<ReturnType<typeof useBabyProfile>>;
  sync: ReturnType<typeof useProfileSync>;
  mail: { state: "idle" } | { state: "sending" } | { state: "sent"; to: string } | { state: "error"; msg: string };
  today: string;
  sizeBounds: ReturnType<typeof useCatalogData>["sizeBounds"];
  getSizeOrDefault: ReturnType<typeof useCatalogData>["getSizeOrDefault"];
  onEdit: () => void;
  onRemove: () => void;
}) {
  const sizeCode = profile.weightKg ? sizeForWeight(profile.weightKg, sizeBounds) : null;
  const size = sizeCode ? getSizeOrDefault(sizeCode) : null;

  const facts: { label: string; value: string }[] = [
    { label: "Age", value: describeAge(profile.dob, today) },
    ...(size ? [{ label: "Diaper size", value: size.size }] : []),
    ...(profile.weightKg ? [{ label: "Weight", value: `${profile.weightKg} kg` }] : []),
    ...(profile.heightCm ? [{ label: "Height", value: `${profile.heightCm} cm` }] : []),
    ...(profile.bloodGroup ? [{ label: "Blood group", value: profile.bloodGroup }] : []),
    ...(profile.gestationalWeeks && profile.gestationalWeeks < 37
      ? [{ label: "Born at", value: `${profile.gestationalWeeks} weeks` }]
      : []),
  ];

  return (
    <div className="panel p-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-display text-[clamp(21px,2.4vw,28px)] leading-tight">
            {profile.name || "Your baby"}
          </div>
          {/* The storage tag is deliberately gone from the resting card.
              It read "Saved on this device only" for every signed-out parent,
              and children are account rows now.

              What is NOT gone is the failure line below. A save that did not
              reach the account still has to say so — a card that claims nothing
              about where the data is may be quiet, but one that stays silent
              after a failed write is telling a parent their child's details are
              safe somewhere they are not. The form's own sign-in prompt reads
              `signedIn`, which is a different question — where a save is ABOUT
              to go, not where one already went. */}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <dl className="m-0 mt-5 flex flex-wrap gap-x-8 gap-y-4 border-t border-moss-tint pt-5">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-[12px] tracking-wide text-muted uppercase">{f.label}</dt>
            <dd className="m-0 mt-1 font-display text-[clamp(17px,1.8vw,21px)] leading-none text-midnight">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* The account write, separately from the email. A profile that saved on
          the device but failed to reach the account is a working page with a
          silent gap in it, which is exactly the class of failure this whole
          surface used to be made of. */}
      {sync.state === "error" ? (
        <p className="mt-4 text-sm text-[#b45309]">{sync.message}</p>
      ) : null}

      {mail.state === "sending" ? (
        <p className="mt-4 text-sm text-muted">Sending your plan…</p>
      ) : mail.state === "sent" ? (
        <p className="mt-4 rounded-chip bg-moss-tint/40 px-4 py-2.5 text-sm text-moss-deep">
          Your care &amp; vaccination plan is on its way to <b>{mail.to}</b>.
        </p>
      ) : mail.state === "error" ? (
        <p className="mt-4 text-sm text-[#b45309]">{mail.msg}</p>
      ) : null}
    </div>
  );
}

/**
 * "6 weeks old", not "Born 2026-03-01".
 *
 * The unit follows how a parent actually counts: days for the first fortnight,
 * then weeks until the two-month appointment, then months, then years. Anything
 * coarser than that is wrong early on - "0 months old" is a newborn's whole
 * first month.
 */
function describeAge(dob: string, today: string): string {
  const days = ageInDays(dob, today);
  if (days < 0) return "Not born yet";
  if (days < 14) return plural(days, "day") + " old";
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return plural(weeks, "week") + " old";
  const months = ageInMonths(dob, today);
  if (months < 24) return plural(months, "month") + " old";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? plural(years, "year") + " old" : `${plural(years, "year")} ${rem}m old`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}
