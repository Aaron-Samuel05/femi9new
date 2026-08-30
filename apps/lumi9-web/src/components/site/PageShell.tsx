import type { ReactNode } from "react";
import { Nav, type NavLink } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";

/** Standard page chrome: sticky nav, page content, 3-panel footer. */
export function PageShell({
  children,
  links,
  variant = "solid",
}: {
  children: ReactNode;
  links?: NavLink[];
  variant?: "solid" | "home";
}) {
  return (
    <>
      <Nav links={links} variant={variant} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
