import Link from "next/link";
import { redirect } from "next/navigation";
import { BRANDS, brandConfig, type Brand } from "@femi9/core/brands";
import { verifyAdminSession, adminCookieName } from "@femi9/core/admin-session";
import { brandsFor } from "@femi9/core/admin-identity";
import { getGroupOverview } from "@femi9/core/services/group";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * The group view — both brands side by side.
 *
 * This is the one screen that deliberately crosses the brand boundary, and its
 * access rule is the important part: it shows a brand ONLY if the signed-in
 * admin holds a role in that brand. Someone who works on Femi9 alone sees Femi9
 * alone, and Lumi9's numbers are never even computed for them.
 *
 * There is no group session. Whoever is signed in to either console is
 * recognised here, and what they see is the intersection of their memberships
 * with the brands they are signed into.
 */
async function signedInBrands(): Promise<Brand[]> {
  const jar = await cookies();
  const found: Brand[] = [];
  for (const brand of BRANDS) {
    const token = jar.get(adminCookieName(brand))?.value;
    const session = await verifyAdminSession(token, brand);
    if (session) found.push(brand);
  }
  return found;
}

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default async function GroupPage() {
  const active = await signedInBrands();
  // Not signed into anything: send them to sign in rather than 404, since this
  // path is not brand-specific and reveals nothing by existing.
  if (active.length === 0) redirect("/login");

  // A session proves who they are; membership decides what they may see. Both
  // are required, so a stale cookie for a revoked brand shows nothing.
  const jar = await cookies();
  const first = active[0]!;
  const session = await verifyAdminSession(jar.get(adminCookieName(first))?.value, first);
  const held = session ? await brandsFor(session.sub) : [];
  const visible = active.filter((b) => held.includes(b));

  const overview = await getGroupOverview(visible);

  return (
    <div className="main" style={{ maxWidth: 1040, margin: "0 auto" }}>
      <div className="topbar">
        <h1 style={{ margin: 0, fontSize: 22 }}>Group overview</h1>
        <div className="switcher">
          {visible.map((b) => (
            <Link key={b} href={`/${b}`}>
              {brandConfig(b).shortName} console
            </Link>
          ))}
        </div>
      </div>

      <p className="who" style={{ marginTop: -8 }}>
        Showing the {visible.length === 1 ? "brand" : "brands"} you hold a role in.
      </p>

      {overview.unavailable.length > 0 && (
        // Said out loud, because a zero and "not reporting" look identical.
        <p className="who" style={{ color: "var(--danger)" }}>
          Not reporting: {overview.unavailable.map((b) => brandConfig(b).name).join(", ")}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          margin: "18px 0",
        }}
      >
        {overview.brands.map((row) => (
          <section
            key={row.brand}
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              padding: 18,
              borderTop: `3px solid ${row.accent}`,
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{row.name}</h2>
            <dl style={{ margin: 0, display: "grid", gap: 8 }}>
              <Stat label="Revenue" value={inr(row.revenue)} strong />
              <Stat label="Paid orders" value={String(row.paidOrders)} />
              <Stat label="Pending" value={String(row.pendingOrders)} />
              <Stat label="Customers" value={String(row.customers)} />
              <Stat label="Active products" value={String(row.activeProducts)} />
              <Stat label="Low stock" value={String(row.lowStock)} />
            </dl>
          </section>
        ))}
      </div>

      {visible.length > 1 && (
        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            padding: 18,
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Combined</h2>
          <dl style={{ margin: 0, display: "grid", gap: 8 }}>
            <Stat label="Revenue" value={inr(overview.totals.revenue)} strong />
            <Stat label="Paid orders" value={String(overview.totals.paidOrders)} />
            <Stat label="Customers" value={String(overview.totals.customers)} />
          </dl>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <dt style={{ color: "var(--muted)", fontSize: 13 }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: strong ? 700 : 500, fontSize: strong ? 18 : 14 }}>
        {value}
      </dd>
    </div>
  );
}
