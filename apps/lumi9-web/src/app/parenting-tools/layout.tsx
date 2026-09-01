import { loadParenting } from "@/lib/parenting.server";
import { ParentingProvider } from "@/lib/parenting-context";

/**
 * One query for the whole parenting surface.
 *
 * Every page under `/parenting-tools` renders the baby profile card, and four of
 * the five read the vaccination schedule. A segment layout loads that once and
 * hands it to the client tree, exactly as the root layout does for the
 * catalogue — and, importantly, NOT in the root layout: a vaccination schedule
 * is on five routes, and querying it up there would run it for every homepage,
 * product page and article that will never read it.
 *
 * `force-dynamic` for the same two reasons the catalogue is: the schedule is
 * live data an admin can correct, and the payload depends on the session, which
 * has no meaning at build time. The Docker build stage also has no database
 * credentials, so prerendering this would turn seeding a vaccine into a build
 * failure.
 */
export const dynamic = "force-dynamic";

export default async function ParentingToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const payload = await loadParenting();
  return <ParentingProvider payload={payload}>{children}</ParentingProvider>;
}
