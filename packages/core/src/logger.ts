import 'server-only'
import * as Sentry from '@sentry/nextjs'

/**
 * Tiny structured logger — a single seam for all server-side logging so that
 * output stays machine-parseable and can be forwarded to an aggregator (Sentry)
 * without touching call sites.
 *
 * Each call JSON-stringifies a flat record: { level, event, ...meta, t: ISO }.
 *
 * PII / SECRETS POLICY (do not violate):
 *   Never pass secrets, OTP codes, full card / UPI / bank data, auth tokens,
 *   session cookies, passwords, or raw request/response bodies into `meta`.
 *   Log stable identifiers and short, non-sensitive summaries only (e.g. an
 *   error class string, an event name, a numeric id). Callers are responsible
 *   for redacting before they reach this module — the logger does not scrub.
 */

type Level = 'error' | 'warn' | 'info'

/** Arbitrary structured context. Keep values small and free of PII/secrets. */
type Meta = Record<string, unknown>

function emit(level: Level, event: string, meta?: Meta) {
  const record = {
    level,
    event,
    ...meta,
    t: new Date().toISOString(),
  }

  // Primary sink: structured line to stdout/stderr. Chosen console method keeps
  // the level meaningful for platforms that route by stream/severity.
  const line = JSON.stringify(record)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.info(line)
  }

  if (level === 'error' && process.env.SENTRY_DSN) {
    Sentry.captureMessage(event, { level: 'error', extra: meta })
  }
}

export const logger = {
  error(event: string, meta?: Meta) {
    emit('error', event, meta)
  },
  warn(event: string, meta?: Meta) {
    emit('warn', event, meta)
  },
  info(event: string, meta?: Meta) {
    emit('info', event, meta)
  },
}
