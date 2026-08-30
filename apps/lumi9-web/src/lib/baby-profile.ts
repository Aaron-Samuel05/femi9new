"use client";

import { useSyncExternalStore } from "react";
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
};

const KEY = "lumi9.babyProfile.v1";

function read(): BabyProfile | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BabyProfile>;
    // A stored blob is untrusted input — it survives across deploys and can be
    // hand-edited. Anything without the two required fields is discarded rather
    // than handed to the percentile maths.
    if (typeof parsed.dob !== "string") return null;
    if (parsed.sex !== "male" && parsed.sex !== "female") return null;
    return parsed as BabyProfile;
  } catch {
    return null;
  }
}

function write(profile: BabyProfile | null) {
  try {
    if (profile) window.localStorage.setItem(KEY, JSON.stringify(profile));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode, or site data blocked */
  }
}

let cache: BabyProfile | null | undefined;
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

function publish(profile: BabyProfile | null) {
  cache = profile;
  write(profile);
  for (const listener of listeners) listener();
}

export function useBabyProfile(): BabyProfile | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function saveBabyProfile(profile: BabyProfile) {
  publish(profile);
}

export function clearBabyProfile() {
  publish(null);
}
