"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * The signed-in shopper, resolved ONCE for the whole client tree.
 *
 * The session cookie is httpOnly, so the browser cannot read it - the only way
 * for a client component to know who it is talking to is to ask the server.
 * Femi9's nav does that inline, which is fine for one consumer; here the nav,
 * the checkout prefill and the account entry point all want it, and three
 * copies of the same fetch means three answers that can disagree mid-render.
 *
 * `null` is the SAFE default: an unresolved or failed /api/auth/me leaves the
 * account control pointing at /login, which is the harmless wrong answer. The
 * dangerous one is the other way round.
 *
 * Nothing here is an authorisation. Every guarded surface re-reads the session
 * server-side - this only decides what the chrome says.
 */

/** Which of the three contact fields the account still has no value for. */
export type ProfileField = "name" | "email" | "phone";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
}

interface SessionState {
  user: SessionUser | null;
  /** Empty when signed out. Drives which fields /welcome renders. */
  missing: ProfileField[];
  profileComplete: boolean;
  /** False until the first /api/auth/me resolves, so the nav can hold still
   *  rather than flashing "Sign in" at somebody who is signed in. */
  ready: boolean;
  /** Re-read the session - after sign-in, or after a profile edit. */
  refresh: () => Promise<void>;
  /** Clear the session and hand back the destination to land on. */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

/** What /api/auth/me answers with. */
interface MeResponse {
  user: SessionUser | null;
  missing: ProfileField[];
  profileComplete: boolean;
}

const SIGNED_OUT: MeResponse = { user: null, missing: [], profileComplete: false };

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse>(SIGNED_OUT);
  const [ready, setReady] = useState(false);

  const read = useCallback(async (): Promise<MeResponse> => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return SIGNED_OUT;
      const body = (await res.json()) as Partial<MeResponse>;
      if (!body.user) return SIGNED_OUT;
      return {
        user: body.user,
        missing: body.missing ?? [],
        profileComplete: body.profileComplete ?? false,
      };
    } catch {
      // Offline or a dropped request: stay signed out rather than guessing.
      return SIGNED_OUT;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void read().then((next) => {
      if (cancelled) return;
      setMe(next);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [read]);

  const refresh = useCallback(async () => {
    setMe(await read());
  }, [read]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even a failed request should send her home: the server re-resolves the
      // session on the next render, and staying put looks like the control did
      // nothing.
    }
    setMe(SIGNED_OUT);
    /*
     * A hard navigation, deliberately.
     *
     * The session cookie has just been cleared underneath a router cache that
     * still holds the signed-in render. router.push + refresh was tried on the
     * account page and did not leave it - the shopper stayed looking at her own
     * orders after signing out. Reloading throws that cache away, which is the
     * whole point of signing out.
     *
     * The lint rule below is right about ordinary navigation and wrong here:
     * `router.push` is precisely the thing that keeps the stale cache.
     */
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }, []);

  const value = useMemo(
    () => ({
      user: me.user,
      missing: me.missing,
      profileComplete: me.profileComplete,
      ready,
      refresh,
      signOut,
    }),
    [me, ready, refresh, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

/** The greeting name, or null when there is nobody or no name to greet. */
export function firstNameOf(user: SessionUser | null): string | null {
  const name = user?.name?.trim();
  if (!name) return null;
  return name.split(/\s+/)[0] ?? null;
}

/**
 * Two uppercase letters for the avatar - the WhatsApp/Gmail convention.
 *
 * "Priya Raman" → PR. A single-word name takes its first two letters ("Priya" →
 * PR) rather than one lonely glyph in a circle sized for two. Falls back to the
 * email, then the phone, because an account that signed in by link or OTP has
 * no name until /welcome captures one - and a blank circle looks like a failed
 * image rather than a person.
 *
 * Returns null only when there is genuinely nothing, which the caller renders
 * as the outline user icon instead.
 */
export function initialsOf(user: SessionUser | null): string | null {
  if (!user) return null;

  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    }
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }

  // Only the local part: the domain is the same for thousands of shoppers and
  // would make every Gmail account read "GM".
  const email = user.email?.trim();
  if (email) {
    const local = email.split("@")[0]?.replace(/[^a-z0-9]/gi, "");
    if (local) return local.slice(0, 2).toUpperCase();
  }

  // The last two digits - the end of a number is what people recognise their
  // own by, and the leading digits of an Indian mobile are near-constant.
  const phone = user.phone?.replace(/\D/g, "");
  if (phone && phone.length >= 2) return phone.slice(-2);

  return null;
}
