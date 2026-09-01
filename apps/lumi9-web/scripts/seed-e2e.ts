#!/usr/bin/env node
/**
 * Seed the fixtures the Lumi9 browser E2E suite needs, in BOTH brands.
 *
 * Two brands on purpose. The suite's job is not only "a Lumi9 coupon works on
 * Lumi9" — it is "a FEMI9 coupon does not". An isolation assertion whose
 * negative case was never created is a test that passes because the row is
 * missing everywhere, which is exactly the bug it is supposed to catch. So this
 * writes a matched pair:
 *
 *   LUMI9ONLY   coupon,   lumi9 schema   → must discount a Lumi9 basket
 *   FEMI9ONLY   coupon,   femi9 schema   → must be refused by a Lumi9 basket
 *   LUMI9CREATOR affiliate, lumi9 schema → must log a click on /a/LUMI9CREATOR
 *   FEMI9CREATOR affiliate, femi9 schema → must log NOTHING on Lumi9
 *
 * Writes through `dbFor(brand)` rather than through the console's services.
 * Every service in `@femi9/core` opens with `import "server-only"`, which
 * throws the moment a plain Node process requires it — so a seed that called
 * `createCoupon`/`apply`/`approve` died before its first statement. Fixture
 * SETUP is also not the thing under test: the specs exercise the real service
 * paths through the running app, and going straight to Prisma here keeps the
 * setup from mailing an ops inbox and a creator on every CI run.
 *
 * Local:
 *   npm run e2e:seed --workspace lumi9-web
 *
 * Writing anywhere non-local needs an explicit opt-in:
 *   ALLOW_PRODUCTION_SEED=true npm run e2e:seed --workspace lumi9-web
 */
import { dbFor, type Brand } from "@femi9/db";

const baseUrl = (process.env.E2E_BASE_URL || "http://127.0.0.1:3101").replace(/\/$/, "");
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl);

if (!isLocal && process.env.ALLOW_PRODUCTION_SEED !== "true") {
  throw new Error(
    `Refusing to write to non-local URL ${baseUrl}. Set ALLOW_PRODUCTION_SEED=true to confirm.`,
  );
}

/** Flat discount in whole rupees — small enough never to exceed a basket. */
export const COUPON_VALUE = 50;
export const LUMI9_COUPON = "LUMI9ONLY";
export const FEMI9_COUPON = "FEMI9ONLY";
export const LUMI9_CREATOR = "LUMI9CREATOR";
export const FEMI9_CREATOR = "FEMI9CREATOR";

/** Reruns must not duplicate or fail — the E2E job seeds on every run. */
async function ensureCoupon(brand: Brand, code: string): Promise<void> {
  const db = dbFor(brand);
  const existing = await db.coupon.findUnique({ where: { code } });
  if (existing) {
    // Re-arm it: an earlier run may have spent its uses or deactivated it.
    await db.coupon.update({
      where: { code },
      data: { active: true, usedCount: 0, maxUses: null, expiresAt: null, value: COUPON_VALUE },
    });
    return;
  }
  await db.coupon.create({
    data: {
      code,
      type: "flat",
      value: COUPON_VALUE,
      minOrder: 0,
      maxUses: null,
      expiresAt: null,
      active: true,
    },
  });
}

/**
 * An APPROVED creator whose promo code is exactly `code`.
 *
 * The code is fixed rather than allocated, because the specs have to name a
 * stable `/a/<code>` URL. `role: "affiliate"` matches what `apply` sets — a
 * creator account is a distinct identity from a shopper and is excluded from
 * the customers list in the console.
 *
 * The affiliate specs sign this user in by email magic link to read her own
 * click count, so the email has to be a real, unique address on the row.
 */
async function ensureApprovedCreator(brand: Brand, code: string): Promise<void> {
  const db = dbFor(brand);
  const email = `e2e-${code.toLowerCase()}@example.test`;

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: `E2E ${code}`, role: "affiliate" },
    select: { id: true },
  });

  await db.affiliate.upsert({
    where: { userId: user.id },
    update: { status: "approved", promoCode: code },
    create: {
      userId: user.id,
      handle: code.toLowerCase(),
      platform: "Instagram",
      followerBand: "5k - 25k",
      status: "approved",
      promoCode: code,
    },
  });
}

async function main() {
  await ensureCoupon("lumi9", LUMI9_COUPON);
  await ensureCoupon("femi9", FEMI9_COUPON);
  await ensureApprovedCreator("lumi9", LUMI9_CREATOR);
  await ensureApprovedCreator("femi9", FEMI9_CREATOR);

  // Prove the pair really is split across the two schemas. If this ever passes
  // when it should not, the brands are sharing a database and every isolation
  // assertion in the suite is meaningless.
  const lumi9SeesFemi9 = await dbFor("lumi9").coupon.findUnique({ where: { code: FEMI9_COUPON } });
  if (lumi9SeesFemi9) {
    throw new Error(
      `${FEMI9_COUPON} is visible from the lumi9 client — the two brands are not isolated.`,
    );
  }
  const femi9SeesLumi9 = await dbFor("femi9").coupon.findUnique({ where: { code: LUMI9_COUPON } });
  if (femi9SeesLumi9) {
    throw new Error(
      `${LUMI9_COUPON} is visible from the femi9 client — the two brands are not isolated.`,
    );
  }

  console.log(
    `Seeded: ${LUMI9_COUPON} + ${LUMI9_CREATOR} in lumi9, ${FEMI9_COUPON} + ${FEMI9_CREATOR} in femi9.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
