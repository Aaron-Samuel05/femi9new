/**
 * Lumi9's own OAuth handshake cookie names.
 *
 * `@femi9/core/google-oauth` exports `OAUTH_STATE_COOKIE` / `OAUTH_NEXT_COOKIE`
 * as the literals `femi9_oauth_state` / `femi9_oauth_next`. They were named
 * before there was a second brand, Femi9 sets them today, and renaming them
 * there would invalidate any handshake in flight during a deploy for no benefit.
 *
 * So Lumi9 brings its own, following the same convention `sessionCookieName`
 * already uses (`lumi9_session`). The brands are on separate hosts, which
 * already isolates cookies — this is the same belt-and-braces reasoning as the
 * session audience: if the two are ever served from one domain, a Femi9
 * handshake cannot be completed as a Lumi9 one.
 *
 * Both are single-use and short-lived; the callback clears them on EVERY exit
 * path, including failures, so an abandoned attempt cannot leave a stale
 * destination behind for the next one.
 */
export const OAUTH_STATE_COOKIE = "lumi9_oauth_state";
export const OAUTH_NEXT_COOKIE = "lumi9_oauth_next";

/** 10 minutes: nobody leaves a consent screen open longer than that. */
export const OAUTH_STATE_MAX_AGE = 10 * 60;
