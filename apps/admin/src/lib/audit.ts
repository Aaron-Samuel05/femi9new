import 'server-only'
import { audit, type AdminSession } from '@femi9/core/admin-identity'
import { clientIp } from '@femi9/core/rate-limit'

/**
 * Record a console action against the platform audit log.
 *
 * `AdminAuditLog` has existed since the console was split out, and until now the
 * only two things ever written to it were `admin.login` and
 * `admin.login.failed`. So the table could tell you that someone signed in and
 * nothing whatsoever about what they did next — in a console that refunds
 * money, rewrites prices, adjusts loyalty balances and changes what a customer
 * account is. When a refund is disputed weeks later, "who issued it" had no
 * answer anywhere in the system.
 *
 * Called AFTER the write succeeds, deliberately: a log line for an action that
 * then failed is worse than no line, because it is read as fact. `audit()` in
 * core swallows its own errors, so a logging failure can never turn a completed
 * refund into a 500.
 *
 * `target` is the row the action touched (an order number, a product id) and
 * `meta` the details worth reading back — the new status, the points delta. Do
 * not put a customer's address, phone or email in either: this table is read by
 * whoever can read the platform schema, which is a wider set than the people
 * who can read one brand's customers.
 */
export async function auditConsole(
  session: AdminSession,
  req: Request,
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await audit({
    adminUserId: session.sub,
    // The SESSION's brand, like every other read and write in this console.
    brand: session.brand,
    action,
    target,
    meta,
    ip: clientIp(req),
  })
}
