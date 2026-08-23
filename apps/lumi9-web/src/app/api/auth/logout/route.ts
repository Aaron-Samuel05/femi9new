import { NextResponse } from "next/server";
import { sessionCookieName } from "@femi9/core/auth";
import { GUEST_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout — clear the session.
 *
 * The guest cart cookie goes too. Leaving it would hand the next person at a
 * shared device the previous shopper's basket, which is both a surprise and a
 * small privacy leak.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const name of [sessionCookieName("lumi9"), GUEST_COOKIE]) {
    res.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}
