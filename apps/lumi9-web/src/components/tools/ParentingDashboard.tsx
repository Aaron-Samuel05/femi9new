"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ageInDays, ageInMonths, formatMonthYear } from "@/lib/baby-age";
import { useBabyProfile } from "@/lib/baby-profile";
import { useVaccinations } from "@/lib/baby-vaccinations";
import { useCatalogData } from "@/lib/catalog-context";
import { defaultPerDay, planDiapers } from "@/lib/diaper-planning";
import { scheduleFor } from "@/lib/immunisation-schedule";
import { useParenting } from "@/lib/parenting-context";
import { sizeForWeight } from "@/lib/size-projection";
import { useSession } from "@/lib/auth-context";

// `nextDeliveryOn` is the ISO day; `nextDelivery` is the formatted string the
// card prints. Both come from SubscriptionView — see the note there for why the
// display one must never be used for arithmetic.
type ActiveSub = { status: string; nextDelivery?: string; nextDeliveryOn?: string };

/**
 * The "at a glance" panel. Everything here is derived from the on-device baby
 * profile, except the subscription line, which needs the signed-in shopper.
 * It renders nothing until there is a profile - the form above is the prompt.
 */
export function ParentingDashboard() {
  // The catalogue from the DATABASE. `WEIGHT_OPTIONS` and `getSizeOrDefault` in
  // `@/lib/catalog` are the seed's input - the provider derives the same two
  // from the live rows, so a size or weight range edited in the console lands
  // here instead of only in the next deploy.
  const { getSizeOrDefault, weightOptions, sizeBounds } = useCatalogData();
  const profile = useBabyProfile();
  // The published schedule and this parent's ticks, both from the backend.
  const { schedule: doses } = useParenting();
  const records = useVaccinations();
  const { user } = useSession();
  // Tagged with the shopper it was fetched for, so signing out - or switching
  // accounts - falls back to null in render rather than needing the effect to
  // clear it. A setState in an effect body would only cascade a second render.
  const [fetched, setFetched] = useState<{ userId: string; sub: ActiveSub | null } | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetch("/api/subscriptions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { subscriptions?: ActiveSub[] } | null) => {
        if (!live) return;
        const active = data?.subscriptions?.find((s) => s.status === "active") ?? null;
        setFetched({ userId, sub: active });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId]);

  const sub = fetched && fetched.userId === userId ? fetched.sub : null;

  if (!profile) return null;

  const today = new Date().toISOString().slice(0, 10);

  /*
   * ── Vaccinations ──
   *
   * "Done" is what the PARENT ticked, not what the calendar passed.
   *
   * It used to count doses whose due date had gone by, which says nothing about
   * whether the baby was actually taken — a six-week-old with no vaccinations at
   * all read as fully up to date the day after their six-week appointment, and
   * there was no control anywhere to say otherwise. A record is the only thing
   * that knows.
   *
   * "Due now" is the calendar's answer MINUS what is already ticked, so a dose
   * given early stops nagging; "upcoming" is everything else, which keeps the
   * three numbers adding up to the schedule's length however they are reached.
   */
  const schedule = scheduleFor({ dob: profile.dob, today, track: "UIP" }, doses);
  const isDone = (id: string) => records[id]?.status === "given";
  const done = schedule.filter((d) => isDone(d.id)).length;
  const dueNow = schedule.filter((d) => !isDone(d.id) && d.status === "due");
  const upNext = schedule.filter((d) => !isDone(d.id) && d.status === "upcoming").slice(0, 3);

  // ── Diapers / restock ──
  const ageMonths = ageInMonths(profile.dob, today);
  const perDay = defaultPerDay(ageMonths);
  // Bands from the CATALOGUE, so a weight range edited in the console moves the
  // size this card names. `sizeForWeight`'s own SIZE_BOUNDS is the fallback.
  const sizeCode = (profile.weightKg && sizeForWeight(profile.weightKg, sizeBounds)) || null;
  const size = getSizeOrDefault(sizeCode);
  const sizeLabel = weightOptions.find((w) => w.size === size.size)?.label;
  // `size` is already the catalogue's row, so pass it straight in - the planner
  // no longer looks a size code up in the hardcoded module.
  const plan = planDiapers({ product: size, perDay });

  // ── Subscription ──
  // `nextDeliveryOn`, not `nextDelivery`. The latter is the DISPLAY string
  // ("18 Jun 2026"), and `.slice(0, 10)` made it "18 Jun 20" — which
  // `ageInDays` could not read, so every subscriber was told their next box
  // "ships in about 0 days", every day, forever.
  const subDays =
    sub?.nextDeliveryOn && !Number.isNaN(Date.parse(sub.nextDeliveryOn))
      ? ageInDays(today, sub.nextDeliveryOn)
      : null;

  return (
    <section aria-label="Your dashboard" className="gap-block flex flex-col">
      <h2 className="m-0 font-display text-[clamp(20px,2.6vw,28px)] font-normal leading-tight">
        {profile.name ? `${profile.name}'s` : "Your"} dashboard
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Vaccinations */}
        <div className="panel p-card flex flex-col">
          <div className="flex items-center gap-2.5">
            <Icon kind="shield" />
            <h3 className="m-0 text-base font-semibold text-midnight">Vaccinations</h3>
          </div>

          <div className="mt-4 flex gap-2">
            <Stat n={done} label="done" />
            <Stat n={dueNow.length} label="due now" accent={dueNow.length > 0} />
            <Stat n={schedule.length - done - dueNow.length} label="upcoming" />
          </div>

          {dueNow.length > 0 ? (
            <div className="mt-4 rounded-chip bg-[#fdf1e2] px-4 py-3">
              <div className="text-[13px] font-semibold tracking-wide text-[#b45309] uppercase">
                Due now
              </div>
              <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0 text-sm text-midnight">
                {dueNow.map((d) => (
                  <li key={d.id}>
                    {d.vaccine} <span className="text-muted">· {d.dose}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : upNext.length > 0 ? (
            <p className="mt-4 text-sm text-muted">
              Next up: <b className="text-midnight">{upNext[0].vaccine}</b> ({upNext[0].dose}) around{" "}
              {formatMonthYear(upNext[0].dueOn)}.
            </p>
          ) : schedule.length === 0 ? (
            /* No schedule at all is NOT "all caught up". An unseeded `lumi9`
               schema would otherwise congratulate a parent on a list that does
               not exist - the one wrong answer this card must never give. */
            <p className="mt-4 text-sm text-muted">
              The vaccination schedule isn&apos;t available yet.
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted">All caught up for now - nothing due.</p>
          )}

          <Link href="/parenting-tools/vaccination" className="mt-auto pt-4 text-sm font-semibold text-moss-deep">
            See the full schedule →
          </Link>
        </div>

        {/* Diapers / restock */}
        <div className="panel p-card flex flex-col">
          <div className="flex items-center gap-2.5">
            <Icon kind="box" />
            <h3 className="m-0 text-base font-semibold text-midnight">Diapers &amp; restock</h3>
          </div>

          <p className="mt-4 text-sm text-midnight">
            You&apos;re around <b>size {size.size}</b>
            {sizeLabel ? <span className="text-muted"> · {sizeLabel}</span> : null}, using roughly{" "}
            <b>{perDay} a day</b>.
          </p>
          {plan ? (
            <p className="mt-1.5 text-sm text-muted">
              A {plan.pack.count}-pack lasts about <b className="text-midnight">{plan.packLastsDays} days</b>.
            </p>
          ) : null}

          {sub ? (
            <div className="mt-4 rounded-chip bg-moss-tint/40 px-4 py-3 text-sm">
              <div className="font-semibold text-moss-deep">You&apos;re subscribed</div>
              <p className="m-0 mt-1 text-midnight">
                {sub.nextDelivery ? (
                  subDays !== null && subDays <= 14 ? (
                    <>
                      Your next box ships in about <b>{Math.max(subDays, 0)} days</b> - you&apos;re
                      covered.
                    </>
                  ) : (
                    <>Next box ships {sub.nextDelivery}.</>
                  )
                ) : (
                  <>Your plan is active.</>
                )}
              </p>
              <Link href="/account?tab=subscription" className="mt-1 inline-block font-semibold text-moss-deep">
                Manage subscription →
              </Link>
            </div>
          ) : (
            <div className="mt-4 rounded-chip border border-moss-tint px-4 py-3 text-sm">
              <p className="m-0 text-midnight">
                At this rate a pack runs low every couple of weeks. Subscribe and the next one arrives
                before you run out.
              </p>
              <Link href="/subscription" className="mt-1 inline-block font-semibold text-moss-deep">
                Set up auto-restock →
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-chip px-3 py-2.5 text-center ${
        accent ? "bg-[#fdf1e2]" : "bg-moss-tint/40"
      }`}
    >
      <div
        className={`font-display text-[clamp(22px,3vw,30px)] leading-none ${
          accent ? "text-[#b45309]" : "text-midnight"
        }`}
      >
        {n}
      </div>
      <div className="mt-1 text-[12px] text-muted">{label}</div>
    </div>
  );
}

function Icon({ kind }: { kind: "shield" | "box" }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "text-moss-deep",
  };
  return (
    <span aria-hidden className="grid size-9 place-items-center rounded-full bg-moss-tint/50">
      {kind === "shield" ? (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      ) : (
        <svg {...common}>
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 7v10l9 4 9-4V7" />
          <path d="M12 11v10" />
        </svg>
      )}
    </span>
  );
}
