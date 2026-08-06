import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * Shared JSON response helpers for route handlers. Keeps success/error envelopes
 * consistent across every /api endpoint.
 */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 })
}

export function badRequest(error: string, details?: unknown) {
  return NextResponse.json({ error, details }, { status: 400 })
}

export function unauthorized(error = 'Unauthorized') {
  return NextResponse.json({ error }, { status: 401 })
}

export function forbidden(error = 'Forbidden') {
  return NextResponse.json({ error }, { status: 403 })
}

export function notFound(error = 'Not found') {
  return NextResponse.json({ error }, { status: 404 })
}

export function serverError(error = 'Internal server error') {
  return NextResponse.json({ error }, { status: 500 })
}

export function serviceUnavailable(error = 'Service temporarily unavailable') {
  return NextResponse.json({ error }, { status: 503 })
}

/** Wrap a handler body so thrown errors become a 500 instead of crashing. */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (err) {
    logger.error('api_unhandled', { err: String(err) })
    return serverError()
  }
}
