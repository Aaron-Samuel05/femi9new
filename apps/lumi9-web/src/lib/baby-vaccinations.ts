"use client";

import { useSyncExternalStore } from "react";
import type { IsoDate } from "@/lib/baby-age";

/**
 * What a parent has actually ticked off.
 *
 * The dashboard used to count "3 done" from the CALENDAR alone — doses whose due
 * date had passed — which says nothing about whether the baby was taken. A
 * six-week-old with no vaccinations at all read as fully up to date the day
 * after their six-week appointment, and there was no control anywhere to say
 * otherwise.
 *
 * Same local-first shape as the baby profile: a guest's ticks stay on the
 * device, a signed-in parent's are rows in `lumi9.BabyVaccination`, and the
 * device copy is a mirror so the list still answers instantly.
 *
 * Keyed by dose CODE ("penta-1"), never by database id: the code is what the
 * schedule seed upserts on, so correcting a published dose leaves every
 * parent's record pointing at the dose they actually ticked.
 */

export type VaccinationStatus = "given" | "skipped";

export type VaccinationRecord = {
  status: VaccinationStatus;
  /** Null for `skipped`, which has no date by definition. */
  givenOn: IsoDate | null;
};

export type VaccinationMap = Readonly<Record<string, VaccinationRecord>>;

const KEY = "lumi9.babyVaccinations.v1";
const EMPTY: VaccinationMap = Object.freeze({});

function read(): VaccinationMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;

    // Stored blobs are untrusted: hand-editable, and they outlive any deploy
    // that changes this shape. Anything that is not a recognised status is
    // dropped rather than handed to a component that will render it.
    const out: Record<string, VaccinationRecord> = {};
    for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = value as Partial<VaccinationRecord>;
      if (record?.status !== "given" && record?.status !== "skipped") continue;
      out[code] = {
        status: record.status,
        givenOn: typeof record.givenOn === "string" ? record.givenOn : null,
      };
    }
    return Object.freeze(out);
  } catch {
    return EMPTY;
  }
}

function write(map: VaccinationMap) {
  try {
    if (Object.keys(map).length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* private mode, or site data blocked */
  }
}

let cache: VaccinationMap | undefined;
let origin: "device" | "account" = "device";
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): VaccinationMap {
  if (cache === undefined) cache = read();
  return cache;
}

/**
 * A stable frozen empty map, not a fresh `{}`.
 *
 * `useSyncExternalStore` compares snapshots by reference and calls this on every
 * server render; a new object each time is an infinite loop in dev and a
 * hydration mismatch in production.
 */
function getServerSnapshot(): VaccinationMap {
  return EMPTY;
}

function publish(map: VaccinationMap) {
  cache = map;
  write(map);
  for (const listener of listeners) listener();
}

export function useVaccinations(): VaccinationMap {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Adopt the account's records, once per page load.
 *
 * The server's set REPLACES the device's for a signed-in parent — the same
 * reasoning the profile uses: a stale mirror on one machine must not resurrect
 * a tick that was removed on another.
 *
 * A guest's existing ticks are pushed up when the account has none, so making an
 * account after using the tool does not silently discard the list.
 */
export async function adoptAccountVaccinations(remote: VaccinationMap): Promise<void> {
  origin = "account";
  const local = getSnapshot();

  if (Object.keys(remote).length > 0) {
    publish(Object.freeze({ ...remote }));
    return;
  }

  publish(local);
  // Sequential, not `Promise.all`: each write is an upsert against the same
  // baby row, and firing a dozen at once is a dozen concurrent transactions on
  // one profile for a list nobody is waiting on.
  for (const [code, record] of Object.entries(local)) {
    await put(code, record.status, record.givenOn);
  }
}

export function adoptDeviceVaccinations(): void {
  origin = "device";
}

async function put(
  code: string,
  status: VaccinationStatus | null,
  givenOn: IsoDate | null,
): Promise<boolean> {
  try {
    const res = await fetch("/api/parenting/vaccinations", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, status, givenOn }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Tick, re-tick or untick one dose.
 *
 * `status: null` REMOVES the record. Un-ticking a box a parent ticked by mistake
 * has to remove the claim, not store a third state meaning "actually no" — a
 * vaccination list where nothing can be taken back is one nobody will trust
 * enough to use.
 *
 * Optimistic, like the profile: the list moves at once and the write follows.
 * A failed write leaves the device copy in place, which is exactly the
 * behaviour this page had before it had a backend.
 */
export async function setVaccination(
  code: string,
  status: VaccinationStatus | null,
  givenOn: IsoDate | null = null,
): Promise<void> {
  const current = getSnapshot();
  const next = { ...current };
  if (status === null) delete next[code];
  else next[code] = { status, givenOn: status === "given" ? givenOn : null };
  publish(Object.freeze(next));

  if (origin !== "account") return;
  await put(code, status, givenOn);
}
