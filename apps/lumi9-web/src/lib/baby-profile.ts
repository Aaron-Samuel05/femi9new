"use client";

import { useSyncExternalStore } from "react";
import type { BloodGroup as CoreBloodGroup } from "@femi9/core/services/parenting";
import { parseIsoDate, type IsoDate } from "@/lib/baby-age";

export type BabySex = "male" | "female";

export type BabyProfile = {
  /**
   * Stable identity for one child.
   *
   * A server cuid once the account owns the row; a `local_`-prefixed id minted
   * here for a guest, whose children never reach a database. The prefix is what
   * `saveBaby` reads to decide whether a PUT is an edit or a create — an id the
   * server has never seen must not be sent as one it should update.
   */
  id: string;
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

const KEY = "lumi9.babies.v1";
/** The one-baby store this replaced. Read once, to migrate, then removed. */
const LEGACY_KEY = "lumi9.babyProfile.v1";

/**
 * The same ceiling the server enforces, and it is stated twice on purpose.
 *
 * `MAX_CHILDREN` in `packages/core/src/services/parenting.ts` is the real
 * guard — this copy only stops the form offering a save that would be refused.
 * A number cannot be shared across that boundary the way `BLOOD_GROUPS` is,
 * because the service module is `server-only` and its VALUES cannot be
 * imported here. **Change one and you must change the other.**
 */
export const MAX_CHILDREN = 12;

export type BabyStore = {
  babies: BabyProfile[];
  /** Which child every tool on the page is currently answering about. */
  selectedId: string | null;
};

const EMPTY: BabyStore = { babies: [], selectedId: null };

/** A guest's child has no database row to get an id from. */
export function localBabyId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `local_${rand}`;
}

export function isLocalId(id: string): boolean {
  return id.startsWith("local_");
}

/**
 * The device copy is untrusted input: it survives across deploys, it can be
 * hand-edited, and for an account-backed parent it is a cache that may be
 * arbitrarily stale. Anything without the two required fields is discarded
 * rather than handed to the percentile maths.
 */
function readOne(raw: unknown): BabyProfile | null {
  const parsed = raw as Partial<BabyProfile> | null;
  if (!parsed || typeof parsed !== "object") return null;
  /* PARSEABLE, not merely present. `typeof dob === "string"` was the whole
     check, so a stored `"not-a-date"` — hand-edited, or written by a version
     that let it through — sailed past and reached `ageInMonths`, `scheduleFor`
     and `percentileFor`, every one of which answered NaN. The page did not
     crash; it rendered nonsense about a child, which is worse. `parseIsoDate`
     is the app's one definition of a date it can use, so this cannot drift from
     what the tools actually accept. */
  if (typeof parsed.dob !== "string" || parseIsoDate(parsed.dob) === null) return null;
  if (parsed.sex !== "male" && parsed.sex !== "female") return null;
  // An id is required now, but a blob written before this change has none and a
  // child is not worth discarding over it — mint one rather than drop them.
  const id = typeof parsed.id === "string" && parsed.id ? parsed.id : localBabyId();
  return { ...(parsed as BabyProfile), id };
}

function read(): BabyStore {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BabyStore>;
      const babies = Array.isArray(parsed.babies)
        ? parsed.babies.map(readOne).filter((b): b is BabyProfile => b !== null)
        : [];
      // A selection pointing at a child who is gone is worse than no selection:
      // every tool would answer about nobody while the switcher looked fine.
      const selectedId =
        typeof parsed.selectedId === "string" && babies.some((b) => b.id === parsed.selectedId)
          ? parsed.selectedId
          : (babies[0]?.id ?? null);
      return { babies, selectedId };
    }

    /* The one-baby store. A parent who filled the form in before this shipped
       has a child sitting under the old key, and dropping them would look
       exactly like the site forgetting their baby. Read once, then remove — a
       migration that runs twice would resurrect a child they later deleted. */
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const one = readOne(JSON.parse(legacy));
      window.localStorage.removeItem(LEGACY_KEY);
      if (one) {
        const migrated: BabyStore = { babies: [one], selectedId: one.id };
        writeStore(migrated);
        return migrated;
      }
    }
    return EMPTY;
  } catch {
    return EMPTY;
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
function writeStore(store: BabyStore) {
  try {
    if (store.babies.length === 0) {
      window.localStorage.removeItem(KEY);
      return;
    }
    // Built key by key rather than by spreading and deleting `email`: a field
    // added to `BabyProfile` later is then absent from storage until somebody
    // adds it here, which is the safe direction to fail for a record about a
    // child. A rest-spread would silently start persisting it.
    const babies = store.babies.map((profile) => ({
      id: profile.id,
      name: profile.name,
      dob: profile.dob,
      sex: profile.sex,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      gestationalWeeks: profile.gestationalWeeks,
      bloodGroup: profile.bloodGroup,
    }));
    window.localStorage.setItem(KEY, JSON.stringify({ babies, selectedId: store.selectedId }));
  } catch {
    /* private mode, or site data blocked */
  }
}

// ── The store ────────────────────────────────────────────────────────────────

let cache: BabyStore | undefined;
let origin: ProfileOrigin = "device";
let sync: SyncState = { state: "idle" };
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): BabyStore {
  if (cache === undefined) cache = read();
  return cache;
}

/** Empty on the server, so SSR and first paint agree. */
function getServerSnapshot(): BabyStore {
  return EMPTY;
}

function emit() {
  for (const listener of listeners) listener();
}

function publish(store: BabyStore) {
  cache = store;
  writeStore(store);
  emit();
}

/** Every child on this device, in the order they were added. */
export function useBabies(): BabyProfile[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).babies;
}

/**
 * The child every tool is currently answering about.
 *
 * Still called `useBabyProfile` and still returns one child or null, which is
 * the whole reason adding siblings did not touch a single tool: the planner,
 * the growth chart, the size projector and the dashboard all ask "which baby"
 * and the answer is now "the selected one" rather than "the only one".
 */
export function useBabyProfile(): BabyProfile | null {
  const { babies, selectedId } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return babies.find((b) => b.id === selectedId) ?? babies[0] ?? null;
}

/**
 * The current ids, in order, read OUTSIDE React.
 *
 * The provider needs them before and after adopting the account, to work out
 * which local ids became which server ids. A hook cannot answer that — it would
 * be two renders apart, and by then the ticks are already orphaned.
 */
export function currentBabyIds(): string[] {
  return getSnapshot().babies.map((b) => b.id);
}

/** The child a pre-siblings tick store's records belong to, if any. */
export function firstLocalBabyId(): string | null {
  return getSnapshot().babies[0]?.id ?? null;
}

/** Switch which child the page is about. Unknown ids are ignored. */
export function selectBaby(id: string): void {
  const store = getSnapshot();
  if (store.selectedId === id || !store.babies.some((b) => b.id === id)) return;
  publish({ ...store, selectedId: id });
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
    // A locally-minted id has never been near the database. Sending it would
    // ask the server to update a row that does not exist, which comes back as
    // "that child isn't on your account" for a child the parent just added.
    id: isLocalId(profile.id) ? null : profile.id,
    name: profile.name ?? null,
    dob: profile.dob,
    sex: profile.sex,
    weightKg: profile.weightKg ?? null,
    heightCm: profile.heightCm ?? null,
    gestationalWeeks: profile.gestationalWeeks ?? null,
    bloodGroup: profile.bloodGroup ?? null,
  };
}

/**
 * The outcome of an account write, kept apart from each other on purpose.
 *
 * This used to be a `boolean`, which collapsed "your session expired", "your
 * details were rejected" and "the network dropped" into one amber sentence that
 * told a parent nothing they could act on — and made the failure undiagnosable
 * from the browser. Each one has a different thing for them to do.
 */
type WriteResult = "ok" | "signed-out" | "rejected" | "offline";

async function putProfile(
  profile: BabyProfile,
): Promise<{ result: WriteResult; saved?: BabyProfile }> {
  try {
    const res = await fetch("/api/parenting/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toBody(profile)),
    });
    if (res.ok) {
      /* The row's id comes back, and for a child created from a local one it is
         the ONLY chance to learn it. Without adopting it here the device would
         keep the `local_` id forever and every later edit would create a second
         row — the same child, added again on every save. */
      const data = (await res.json().catch(() => null)) as
        | { profile?: { id?: string } }
        | null;
      const id = data?.profile?.id;
      return { result: "ok", saved: id ? { ...profile, id } : profile };
    }
    // 401 is the cookie outliving the account it names — see the PUT handler.
    if (res.status === 401) return { result: "signed-out" };
    if (res.status === 400) return { result: "rejected" };
    return { result: "offline" };
  } catch {
    // Never reached the server at all. The device copy is already written, so
    // this is a sync that has not happened yet rather than data that is lost.
    return { result: "offline" };
  }
}

/** What the card says for each way an account write can fail. */
const WRITE_MESSAGE: Record<Exclude<WriteResult, "ok">, string> = {
  "signed-out": "Saved on this device - sign in again to sync it to your account.",
  rejected: "Saved on this device - your account wouldn't accept these details.",
  offline: "Saved on this device - we couldn't sync it to your account.",
};

/**
 * Adopt whatever the server said, once per page load.
 *
 * Called by `<ParentingProvider>` with the payload the server component already
 * loaded — deliberately NOT a fetch of its own, which would be a second round
 * trip for data that arrived with the HTML.
 *
 * Three cases, and the third is the one that matters:
 *
 * 1. **Signed out.** Nothing happens. The device copy is the list, the origin
 *    stays `device`, and no byte leaves the browser.
 * 2. **Signed in, the account has children.** The rows win and are mirrored
 *    into localStorage. The device copy may be an older edit made on another
 *    machine or before signing in; treating the newer-looking one as
 *    authoritative would mean two devices silently fighting over a child's
 *    weight. It is a REPLACE, not a merge — merging two lists with no shared
 *    ids is how one child becomes two, and a duplicated child carrying half a
 *    vaccination record each is worse than a lost stale edit.
 * 3. **Signed in, the account has none, the device does.** Every device child
 *    is pushed UP. This is the parent who used the tools as a guest and then
 *    made an account: without it, signing in would look like the site forgot
 *    the children they had just added.
 */
export async function adoptAccountBabies(remote: BabyProfile[]): Promise<void> {
  origin = "account";

  if (remote.length > 0) {
    const keep = getSnapshot().selectedId;
    publish({
      babies: remote,
      // Hold the selection across the swap when that child came down too, so
      // signing in does not silently move the page to a different sibling.
      selectedId: remote.some((b) => b.id === keep) ? keep : (remote[0]?.id ?? null),
    });
    return;
  }

  const local = getSnapshot();
  if (local.babies.length === 0) {
    emit();
    return;
  }

  emit();
  /*
   * Best effort, with ONE exception.
   *
   * A dropped migration leaves the children exactly where they already were —
   * on the device, working — so there is nothing to tell the parent and nothing
   * for them to do about it. The next save retries.
   *
   * A 401 is different in kind: it means this browser is carrying a cookie for
   * an account that is not there, so `origin` is about to promise account
   * storage that cannot happen. Surfacing it here is what stops the card
   * claiming "follows you to any device" from first paint, before the parent has
   * touched anything.
   *
   * Sequential, not concurrent: each PUT creates a row and returns its id, and
   * the local list is rewritten as they land. Firing them together would race
   * several writes against the same `cache` and the last one home would win,
   * leaving the other children still carrying `local_` ids — which is exactly
   * the state that duplicates them on the next save.
   */
  let migrated = local.babies;
  let sawSignedOut = false;
  for (const baby of local.babies) {
    const { result, saved } = await putProfile(baby);
    if (result === "signed-out") {
      sawSignedOut = true;
      break;
    }
    if (result === "ok" && saved) {
      migrated = migrated.map((b) => (b.id === baby.id ? saved : b));
    }
  }

  const selected = migrated.find((b) => b.id === local.selectedId) ?? migrated[0];
  publish({ babies: migrated, selectedId: selected?.id ?? null });

  if (sawSignedOut) setSync({ state: "error", message: WRITE_MESSAGE["signed-out"] });
}

/** Signed out: the device is the whole story. Idempotent. */
export function adoptDeviceProfile(): void {
  origin = "device";
  emit();
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Save one child — a new one, or an edit to an existing one.
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
 *
 * A saved child is also SELECTED, which is the behaviour that makes adding a
 * sibling feel like anything happened: the tools below the form switch to the
 * child just added rather than staying on whoever was there before.
 *
 * Returns whether it saved. It used to return void and set a sync error when
 * the cap was hit, which the FORM does not render — so the card closed, threw
 * away everything the parent had typed, and explained itself on the screen
 * underneath. The caller needs to know to stay put.
 */
export async function saveBabyProfile(profile: BabyProfile): Promise<"ok" | "too-many"> {
  const store = getSnapshot();
  const exists = store.babies.some((b) => b.id === profile.id);
  if (!exists && store.babies.length >= MAX_CHILDREN) {
    setSync({
      state: "error",
      message: `You can keep ${MAX_CHILDREN} children here. Remove one to add another.`,
    });
    return "too-many";
  }

  const babies = exists
    ? store.babies.map((b) => (b.id === profile.id ? profile : b))
    : [...store.babies, profile];
  publish({ babies, selectedId: profile.id });

  // A guest's child is saved the moment it is on the device; there is no
  // account write to wait for and nothing that can refuse it.
  if (origin !== "account") return "ok";

  setSync({ state: "saving" });
  const { result, saved } = await putProfile(profile);
  if (result === "ok" && saved && saved.id !== profile.id) {
    // The row's real id, replacing the local one. Must happen against the
    // CURRENT store rather than the one read above — the parent may have typed
    // into another field while the request was in flight.
    const now = getSnapshot();
    publish({
      babies: now.babies.map((b) => (b.id === profile.id ? saved : b)),
      selectedId: now.selectedId === profile.id ? saved.id : now.selectedId,
    });
  }
  setSync(result === "ok" ? { state: "idle" } : { state: "error", message: WRITE_MESSAGE[result] });
  return "ok";
}

/**
 * Remove one child.
 *
 * The device copy goes first and unconditionally: "Remove" must remove even if
 * the network is down, and a button that leaves the data on screen while it
 * waits for a round trip reads as broken.
 *
 * Selection falls to whoever is left rather than to null, so removing a sibling
 * does not drop the page back to its empty state with children still on it.
 */
export async function removeBaby(id: string): Promise<void> {
  const wasAccount = origin === "account";
  const store = getSnapshot();
  const babies = store.babies.filter((b) => b.id !== id);
  publish({
    babies,
    selectedId: store.selectedId === id ? (babies[0]?.id ?? null) : store.selectedId,
  });

  // A child the server never saw has nothing to delete there.
  if (!wasAccount || isLocalId(id)) return;

  setSync({ state: "saving" });
  try {
    const res = await fetch("/api/parenting/profile", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSync(
      res.ok
        ? { state: "idle" }
        : { state: "error", message: "Removed here - your account copy is still being removed." },
    );
  } catch {
    setSync({
      state: "error",
      message: "Removed here - your account copy is still being removed.",
    });
  }
}
