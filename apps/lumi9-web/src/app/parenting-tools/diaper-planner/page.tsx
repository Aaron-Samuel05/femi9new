import type { Metadata } from "next";
import { ToolPageFrame } from "@/components/tools/ToolPageFrame";
import { DiaperPlanner } from "@/components/tools/DiaperPlanner";
import { absoluteUrl, canonical, SITE_NAME } from "@/lib/seo";

const TITLE = "How Many Diapers Will You Need? Planner & Cost | Lumi9";
const DESCRIPTION =
  "Work out how many diapers your baby needs a day, the right pack size, and roughly what a month costs — from your baby's age.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: canonical("/parenting-tools/diaper-planner"),
  openGraph: { type: "website", url: absoluteUrl("/parenting-tools/diaper-planner"), siteName: SITE_NAME, title: TITLE, description: DESCRIPTION },
};

export default function DiaperPlannerPage() {
  return (
    <ToolPageFrame
      title="How many will you need?"
      subtitle="A realistic diaper count and monthly cost — start from the estimate, then set your baby's actual rate."
      crumb="Diaper planner"
      path="/parenting-tools/diaper-planner"
    >
      <DiaperPlanner />
    </ToolPageFrame>
  );
}
