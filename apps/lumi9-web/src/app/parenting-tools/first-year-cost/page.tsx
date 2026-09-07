import type { Metadata } from "next";
import { ToolPageFrame } from "@/components/tools/ToolPageFrame";
import { FirstYearCost } from "@/components/tools/FirstYearCost";
import { absoluteUrl, canonical, og } from "@/lib/seo";

const TITLE = "How Much Do Diapers Cost in the First Year? | Lumi9";
const DESCRIPTION =
  "What a year of diapers actually costs, priced from real Lumi9 prices - with the size growing as your baby does, the best-value pack in each size, and the subscription saving.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "diaper cost per month india",
    "how much do diapers cost first year",
    "baby diaper budget calculator",
    "how many diapers in first year",
  ],
  alternates: canonical("/parenting-tools/first-year-cost"),
  openGraph: og({ type: "website", url: absoluteUrl("/parenting-tools/first-year-cost"), title: TITLE, description: DESCRIPTION }),
};

export default function FirstYearCostPage() {
  return (
    <ToolPageFrame
      title="A year in diapers"
      subtitle="What the first year costs at real prices - the size grows with your baby, and you can set your own daily rate."
      crumb="Year one cost"
      path="/parenting-tools/first-year-cost"
    >
      <FirstYearCost />
    </ToolPageFrame>
  );
}
