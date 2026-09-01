"use client";

import { useSyncExternalStore } from "react";
import type { BloodGroup as CoreBloodGroup } from "@femi9/core/services/parenting";
import type { IsoDate } from "@/lib/baby-age";

export type BabySex = "male" | "female";

export type BabyProfile = {
  name?: string;
  dob: IsoDate;
  /**
   * Required, not optional. WHO growth tables are sex-specific, so a percentile
   * without it is meaningless rather than merely less precise.
   */
  sex: BabySex;
  weightKg?: number;
  heightCm?: number;
  /** Below 37 triggers corrected age for GROWTH only. Absent means term. */
  gestationalWeeks?: number;
  /** Optional, informational only - surfaced on the card, never used in maths. */
  bloodGroup?: BloodGroup;
  /**
   * Optional, and NOT part of the stored profile any more - see the note on
   * `saveBabyProfile`. It is carried on the type because the form binds it and
   * the care-plan request needs it; `write()` strips it before anything is
   * persisted, on the device or on the server.
   */
  email?: string;
};

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

/*
 * The same eight strings are declared in `@femi9/core/services/parenting`, which
 * is `server-only` and so cannot be imported for its VALUES here. This asserts
 * at compile time that the two lists have not drifted.
 *
 * `import type` is fully erased before the bundle exists, so nothing about the
 * server module reaches the browser — the guard costs one type alias and
 * catches the failure it protects against: a group added to the enum on one
 * side, a dropdown option the API then rejects on the other.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _BloodGroupsAgree = Same<BloodGroup, CoreBloodGroup>;

/**
 * Where this profile actually lives.
 *
 * `device` - localStorage, and nowhere else. The state for every signed-out
 *   parent, and the reason the card can go on promising that the details stay
 *   on the device: for a guest that promise is still literally true.
 * `account` - the `lumi9.BabyProfile` row, mirrored into localStorage so the
 *   tools still answer instantly and still work offline. The mirror is a cache;
 *   the row is the truth.
 *
 * The card renders a different sentence for each, because a page that says
 * "stays on this device" while POSTing a child's date of birth is lying.
 */
export type ProfileOrigin = "device" | "account";

export type SyncState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "error"; message: string };

const KEY = "lumi9.babyProfile.v1";

/**
 * The device copy is untrusted input: it survives across deploys, it can be
 * hand-edited, and for an account-backed parent it is a cache that may be
 * arbitrarily stale. Anything without the two required fields is discarded
 * rather than handed to the percentile maths.
 */
function read(): BabyProfile | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BabyProfile>;
    if (typeof parsed.dob !== "string") return null;
    if (parsed.sex !== "male" && parsed.sex !== "female") return null;
    return parsed as BabyProfile;
  } catch {
    return null;
  }
}

/**
 * The email is stripped before writing.
 *
 * It was in the stored blob, which meant an address a parent typed once to
 * receive one plan sat in their browser indefinitely and was re-sent on every
 * subsequent save. It belongs to the care-plan REQUEST, not to the baby: the
 * server keeps it as a `ParentingLead` because that is a record of consent with
 * an owner, and the device keeps nothing.
 */
function write(profile: BabyProfile | null) {
  try {
    if (!profile) {
      window.localStorage.removeItem(KEY);
      return;
    }
    // Built key by key rather than by spreading and deleting `email`: a field
    // added to `BabyProfile` later is then absent from storage until somebody
    // adds it here, which is the safe direction to fail for a record about a
    // child. A rest-spread would silently start persisting it.
    const stored: Omit<BabyProfile, "email"> = {
      name: profile.name,
      dob: profile.dob,
      sex: profile.sex,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      gestationalWeeks: profile.gestationalWeeks,
      bloodGroup: profile.bloodGroup,
    };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* private mode, or site data blocked */
  }
}

// ── The store ────────────────────────────────────────────────────────────────

let cache: BabyProfile | null | undefined;
let origin: ProfileOrigin = "device";
let sync: SyncState = { state: "idle" };
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): BabyProfile | null {
  if (cache === undefined) cache = read();
  return cache;
}

/** Null on the server, so SSR and first paint agree. */
function getServerSnapshot(): BabyProfile | null {
  return null;
}

function emit() {
  for (const listener of listeners) listener();
}

function publish(profile: BabyProfile | null) {
  cache = profile;
  write(profile);
  emit();
}

export function useBabyProfile(): BabyProfile | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ── Origin and sync state, as their own snapshots ────────────────────────────
//
// Separate `useSyncExternalStore` subscriptions rather than one object, because
// an object snapshot has to be referentially stable and building `{ profile,
// origin, sync }` fresh on every read is an infinite render loop. Three scalars
// need no memoisation at all.

function getOrigin(): ProfileOrigin {
  return origin;
}
function getServerOrigin(): ProfileOrigin {
  return "device";
}

export function useProfileOrigin(): ProfileOrigin {
  return useSyncExternalStore(subscribe, getOrigin, getServerOrigin);
}

function getSync(): SyncState {
  return sync;
}
const IDLE: SyncState = { state: "idle" };
function getServerSync(): SyncState {
  return IDLE;
}

export function useProfileSync(): SyncState {
  return useSyncExternalStore(subscribe, getSync, getServerSync);
}

function setSync(next: SyncState) {
  sync = next;
  emit();
}

// ── Talking to the server ────────────────────────────────────────────────────

/** The columns the API accepts. `email` is not one of them. */
function toBody(profile: BabyProfile) {
  return {
    name: profile.name ?? null,
    dob: profile.dob,
    sex: profile.sex,
    weightKg: profile.weightKg ?? null,
    heightCm: profile.heightCm ?? null,
    gestationalWeeks: profile.gestationalWeeks ?? null,
    bloodGroup: profile.bloodGroup ?? null,
  };
}

async function putProfile(profile: BabyProfile): Promise<boolean> {
  try {
    const res = await fetch("/api/parenting/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toBody(profile)),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Adopt whatever the server said, once per page load.
 *
 * Called by `<ParentingProvider>` with the payload the server component already
 * loaded — deliberately NOT a fetch of its own, which would be a second round
 * trip for data that arrived with the HTML.
 *
 * Three cases, and the third is the one that matters:
 *
 * 1. **Signed out.** Nothing happens. The device copy is the profile, the origin
 *    stays `device`, and no byte leaves the browser.
 * 2. **Signed in, the account has a baby.** The row wins and is mirrored into
 *    localStorage. The device copy may be an older edit made on another machine
 *    or before signing in; treating the newer-looking one as authoritative would
 *    mean two devices silently fighting over a child's weight.
 * 3. **Signed in, the account has no baby, the device does.** The device copy is
 *    pushed UP. This is the parent who used the tools as a guest and then made
 *    an account: without it, signing in would look like the site forgot the
 *    profile they had just filled in.
 */
export async function adoptAccountProfile(remote: BabyProfile | null): Promise<void> {
  origin = "account";

  if (remote) {
    publish(remote);
    return;
  }

  const local = getSnapshot();
  if (!local) {
    emit();
    return;
  }

  emit();
  // Best effort. A failed migration leaves the profile exactly where it already
  // was — on the device, working — so there is nothing to tell the parent and
  // nothing for them to do about it. The next save retries.
  await putProfile(local);
}

/** Signed out: the device is the whole story. Idempotent. */
export function adoptDeviceProfile(): void {
  origin = "device";
  emit();
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Save the profile.
 *
 * Optimistic: the device copy and every tool on the page update FIRST, then the
 * write goes up. These tools answer as you type and a parent adjusting a weight
 * should never watch a spinner to see a percentile move.
 *
 * The device copy is kept even when the server write fails, which is the whole
 * reason the local store survived this change: a dropped request degrades the
 * page to exactly what it was before it had a backend, rather than to nothing.
 * The card surfaces the failure so "saved" never means "saved somewhere you
 * cannot reach it".
 */
export async function saveBabyProfile(profile: BabyProfile): Promise<void> {
  publish(profile);

  if (origin !== "account") return;

  setSync({ state: "saving" });
  const okay = await putProfile(profile);
  setSync(
    okay
      ? { state: "idle" }
      : {
          state: "error",
          message: "Saved on this device - we couldn't sync it to your account.",
        },
  );
}

/**
 * Forget the baby.
 *
 * The device copy goes first and unconditionally: "Clear" must clear even if
 * the network is down, and a button that leaves the data on screen while it
 * waits for a round trip reads as broken.
 */
export async function clearBabyProfile(): Promise<void> {
  const wasAccount = origin === "account";
  publish(null);
  if (!wasAccount) return;

  setSync({ state: "saving" });
  try {
    const res = await fetch("/api/parenting/profile", { method: "DELETE" });
    setSync(
      res.ok
        ? { state: "idle" }
        : { state: "error", message: "Cleared here - your account copy is still being removed." },
    );
  } catch {
    setSync({
      state: "error",
      message: "Cleared here - your account copy is still being removed.",
    });
  }
}
