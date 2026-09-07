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

/**
 * Every child's ticks, keyed by baby id then by dose code.
 *
 * The flat `code -> record` map this replaced was the one-baby shape, and with
 * siblings it is actively wrong: two children are on the same schedule at
 * different dates, so a single map would have marked the younger one's doses
 * given the moment the elder had them — on a vaccination list, which is the one
 * place this page must never guess.
 */
export type VaccinationsByBaby = Readonly<Record<string, VaccinationMap>>;

const KEY = "lumi9.babyVaccinations.v2";
/** The flat, single-baby store. Migrated onto the first child, then removed. */
const LEGACY_KEY = "lumi9.babyVaccinations.v1";
const EMPTY: VaccinationMap = Object.freeze({});
const EMPTY_ALL: VaccinationsByBaby = Object.freeze({});

/** One child's map. Untrusted input: anything unrecognised is dropped. */
function readMap(parsed: unknown): VaccinationMap {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;
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
}

function read(legacyOwnerId: string | null): VaccinationsByBaby {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_ALL;
      const out: Record<string, VaccinationMap> = {};
      for (const [babyId, value] of Object.entries(parsed as Record<string, unknown>)) {
        out[babyId] = readMap(value);
      }
      return Object.freeze(out);
    }

    /* The flat store. Its ticks belong to whichever child the one-baby store
       held, so they are filed under the FIRST child — which the profile store's
       own migration has already put in place. Without an owner to attribute
       them to they are dropped rather than guessed at: attaching one child's
       vaccination record to another is worse than losing it. */
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      window.localStorage.removeItem(LEGACY_KEY);
      if (legacyOwnerId) {
        const migrated = Object.freeze({ [legacyOwnerId]: readMap(JSON.parse(legacy)) });
        writeAll(migrated);
        return migrated;
      }
    }
    return EMPTY_ALL;
  } catch {
    return EMPTY_ALL;
  }
}

function writeAll(all: VaccinationsByBaby) {
  try {
    const anyTicks = Object.values(all).some((m) => Object.keys(m).length > 0);
    if (!anyTicks) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode, or site data blocked */
  }
}

let cache: VaccinationsByBaby | undefined;
let origin: "device" | "account" = "device";
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getAll(): VaccinationsByBaby {
  if (cache === undefined) cache = read(pendingLegacyOwner);
  return cache;
}

/**
 * The id the flat v1 store's ticks belong to.
 *
 * Set by the provider from the profile store's first child before anything
 * reads this, because the two migrations are one migration: the ticks have no
 * owner recorded anywhere, and the only defensible owner is the single baby the
 * single-baby store held.
 */
let pendingLegacyOwner: string | null = null;

export function setLegacyVaccinationOwner(babyId: string | null): void {
  pendingLegacyOwner = babyId;
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

function publish(all: VaccinationsByBaby) {
  cache = all;
  writeAll(all);
  for (const listener of listeners) listener();
}

/**
 * One child's ticks.
 *
 * Takes the baby id rather than reading the selection itself, so the schedule
 * component states which child it is showing and cannot drift out of step with
 * the switcher above it.
 */
export function useVaccinations(babyId: string | null): VaccinationMap {
  return useSyncExternalStore(
    subscribe,
    () => (babyId ? (getAll()[babyId] ?? EMPTY) : EMPTY),
    getServerSnapshot,
  );
}

/**
 * Adopt the account's records, once per page load.
 *
 * The server's set REPLACES the device's for a signed-in parent — the same
 * reasoning the profile uses: a stale mirror on one machine must not resurrect
 * a tick that was removed on another.
 *
 * A guest's existing ticks are pushed up when the account has none, so making an
 * account after using the tool does not silently discard the list. `remap`
 * carries the local ids the profile store just exchanged for real ones — a tick
 * filed under `local_x` would otherwise be orphaned the moment its child got a
 * database row.
 */
export async function adoptAccountVaccinations(
  remote: VaccinationsByBaby,
  remap: ReadonlyMap<string, string> = new Map(),
): Promise<void> {
  origin = "account";
  const local = getAll();

  if (Object.values(remote).some((m) => Object.keys(m).length > 0)) {
    publish(Object.freeze({ ...remote }));
    return;
  }

  const moved: Record<string, VaccinationMap> = {};
  for (const [babyId, map] of Object.entries(local)) {
    moved[remap.get(babyId) ?? babyId] = map;
  }
  publish(Object.freeze(moved));

  // Sequential, not `Promise.all`: each write is an upsert against one baby
  // row, and firing a dozen at once is a dozen concurrent transactions for a
  // list nobody is waiting on.
  for (const [babyId, map] of Object.entries(moved)) {
    // A child that never reached the server has no row to hang a tick on.
    if (babyId.startsWith("local_")) continue;
    for (const [code, record] of Object.entries(map)) {
      await put(babyId, code, record.status, record.givenOn);
    }
  }
}

export function adoptDeviceVaccinations(): void {
  origin = "device";
}

async function put(
  babyId: string,
  code: string,
  status: VaccinationStatus | null,
  givenOn: IsoDate | null,
): Promise<boolean> {
  try {
    const res = await fetch("/api/parenting/vaccinations", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ babyId, code, status, givenOn }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Drop a removed child's ticks, so they do not linger keyed to nothing. */
export function forgetBabyVaccinations(babyId: string): void {
  const all = getAll();
  if (!(babyId in all)) return;
  const next = { ...all };
  delete next[babyId];
  publish(Object.freeze(next));
}

/**
 * Tick, re-tick or untick one dose, for one child.
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
  babyId: string,
  code: string,
  status: VaccinationStatus | null,
  givenOn: IsoDate | null = null,
): Promise<void> {
  const all = getAll();
  const current = all[babyId] ?? EMPTY;
  const next = { ...current };
  if (status === null) delete next[code];
  else next[code] = { status, givenOn: status === "given" ? givenOn : null };
  publish(Object.freeze({ ...all, [babyId]: Object.freeze(next) }));

  if (origin !== "account" || babyId.startsWith("local_")) return;
  await put(babyId, code, status, givenOn);
}
