"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { adoptAccountProfile, adoptDeviceProfile } from "@/lib/baby-profile";
import {
  adoptAccountVaccinations,
  adoptDeviceVaccinations,
  type VaccinationMap,
} from "@/lib/baby-vaccinations";
import { availableTracks, type VaccineDose, type VaccineTrack } from "@/lib/immunisation-schedule";
import type { ParentingPayload } from "@/lib/parenting.server";

/**
 * The parenting tools' server data, delivered to client components.
 *
 * Exactly the relationship `CatalogProvider` has to the catalogue, and it exists
 * for the same reason: the schedule lives in Postgres and a client component
 * cannot query one. `app/parenting-tools/layout.tsx` loads it once per request
 * and hands it down, so the hub and all four tool pages render from a single
 * query.
 *
 * It is NOT in the root layout, deliberately. The catalogue is on every page; a
 * vaccination schedule is on five, and putting this query up there would run it
 * for every homepage, product page and article that will never read it.
 */

interface ParentingData {
  /** The published doses, from the database. Empty when nothing is seeded. */
  schedule: VaccineDose[];
  /** Which tracks actually have doses — the UI renders a selector only for these. */
  tracks: VaccineTrack[];
  /**
   * Whether there is a schedule at all.
   *
   * `ImmunisationSchedule` says plainly that the list is not ready rather than
   * rendering an empty one that reads as a bug. That behaviour predates the
   * database and is now MORE important, not less: an unseeded schema is a much
   * easier state to reach than a half-written module ever was.
   */
  ready: boolean;
  /** Whether this visitor has an account for a profile to be stored against. */
  signedIn: boolean;
}

const ParentingContext = createContext<ParentingData | null>(null);

export function ParentingProvider({
  payload,
  children,
}: {
  payload: ParentingPayload;
  children: React.ReactNode;
}) {
  /*
   * Hand the server's answer to the two stores, ONCE.
   *
   * A ref rather than an empty dependency array: `payload` is a new object on
   * every navigation between the hub and a tool page, and re-adopting on each
   * one would re-push a guest's profile to the server every time they opened a
   * different tool. The guard is what makes "once per page load" mean it.
   *
   * Note the asymmetry. Signed IN, adoption is async and does real work
   * (mirroring the row, or migrating a guest's data up). Signed OUT, it is a
   * flag flip — there is nothing to fetch, and nothing must leave the device.
   */
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current) return;
    adopted.current = true;

    if (!payload.signedIn) {
      adoptDeviceProfile();
      adoptDeviceVaccinations();
      return;
    }

    const remote: VaccinationMap = Object.fromEntries(
      payload.vaccinations.map((v) => [v.code, { status: v.status, givenOn: v.givenOn }]),
    );
    void adoptAccountProfile(payload.profile);
    void adoptAccountVaccinations(remote);
  }, [payload]);

  const value = useMemo<ParentingData>(
    () => ({
      schedule: payload.schedule,
      tracks: availableTracks(payload.schedule),
      ready: payload.schedule.length > 0,
      signedIn: payload.signedIn,
    }),
    [payload],
  );

  return <ParentingContext.Provider value={value}>{children}</ParentingContext.Provider>;
}

/**
 * Throws when the provider is missing.
 *
 * An empty schedule and an unwrapped tree look identical on the page — a
 * vaccination list with nothing in it — and one of them is a bug that should be
 * loud. Same stance `useCatalogData()` takes.
 */
export function useParenting(): ParentingData {
  const value = useContext(ParentingContext);
  if (value === null) {
    throw new Error("useParenting must be used inside <ParentingProvider>");
  }
  return value;
}
