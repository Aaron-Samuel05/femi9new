import { NextResponse, type NextRequest } from "next/server";
import { generateInvoicePdf, invoiceFilename } from "@femi9/core/services/invoice";
import { verifyOrderToken } from "@femi9/core/order-token";
import { getSession } from "@femi9/core/auth";
import { dbFor } from "@femi9/db";
import { logger } from "@femi9/core/logger";

/**
 * GET /api/orders/[orderNo]/invoice - the order receipt as a PDF.
 *
 * ── Authorisation is the same rule as /order/[orderNo], deliberately ────────
 * This document carries a name, a full postal address and a phone number, and
 * `orderNo` is short and sequential - LM-00042 is one guess away from LM-00041.
 * So it is NOT public, and it must not be a softer door into the same PII than
 * the page that shows it. Access is EITHER the unguessable capability token in
 * `?t=` (how a guest reaches her own receipt from the confirmation email,
 * having no account at all) OR a session that owns the order.
 *
 * Anything else gets 404, not 403 - the same answer an order that does not
 * exist gets, so the route never confirms whether an order number is real.
 * That is the property that makes enumeration pointless, and a 403 here would
 * quietly destroy it while looking more correct.
 *
 * node:crypto (via order-token) and pdf-lib both need the Node runtime; on the
 * edge this route would fail at import time rather than at request time.
 */
export const runtime = "nodejs";

// Order status and address can change after the order is placed, and a receipt
// downloaded twice should reflect the second read. Nothing here is cacheable
// anyway - see the Cache-Control below.
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderNo: string }> },
) {
  const { orderNo } = await context.params;

  const authorized = await canRead(orderNo, request.nextUrl.searchParams.get("t"));
  if (!authorized) return new NextResponse(null, { status: 404 });

  try {
    const pdf = await generateInvoicePdf("lumi9", orderNo);
    if (!pdf) return new NextResponse(null, { status: 404 });

    return new NextResponse(pdf.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        // `attachment` rather than `inline`: the shopper pressed a button that
        // says Download, and a PDF that hijacks the tab instead loses her the
        // order page she was reading.
        "content-disposition": `attachment; filename="${invoiceFilename(orderNo)}"`,
        "content-length": String(pdf.bytes.byteLength),
        // A receipt is PII behind a capability token. `private, no-store` keeps
        // it out of any shared cache that would otherwise serve one customer's
        // address to a URL guess.
        "cache-control": "private, no-store, max-age=0",
        // The token travels in the query string; do not leak it to whatever the
        // shopper clicks next.
        "referrer-policy": "no-referrer",
      },
    });
  } catch (err) {
    // A render failure is ours, not hers - 500 rather than the 404 above, so it
    // is distinguishable in the logs from an enumeration attempt.
    logger.error("invoice_pdf_failed", { orderNo, err: String(err) });
    return new NextResponse(null, { status: 500 });
  }
}

/** The capability token, or a session that owns the order. Nothing else. */
async function canRead(orderNo: string, token: string | null): Promise<boolean> {
  if (verifyOrderToken(orderNo, token)) return true;

  const session = await getSession("lumi9");
  if (!session) return false;

  const owned = await dbFor("lumi9").order.findFirst({
    where: { orderNo, userId: session.sub },
    select: { id: true },
  });
  return owned !== null;
}
