import type { Metadata } from "next";
import { ToolPageFrame } from "@/components/tools/ToolPageFrame";
import { SleepPlanner } from "@/components/tools/SleepPlanner";
import { absoluteUrl, canonical, og } from "@/lib/seo";

const TITLE = "Baby Wake Windows, Nap & Bedtime Calculator | Lumi9";
const DESCRIPTION =
  "How long your baby can stay awake between sleeps, how many naps they need, and what time bedtime lands - worked out from their age and the time they woke up.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "baby wake windows by age",
    "baby nap schedule calculator",
    "how many naps by age",
    "baby bedtime calculator",
    "how much sleep does a baby need",
  ],
  alternates: canonical("/parenting-tools/sleep"),
  openGraph: og({ type: "website", url: absoluteUrl("/parenting-tools/sleep"), title: TITLE, description: DESCRIPTION }),
};

export default function SleepPage() {
  return (
    <ToolPageFrame
      title="Naps & bedtime"
      subtitle="Wake windows by age, and the day they make - tell us when your baby woke up and the naps and bedtime fall out of it."
      crumb="Naps & bedtime"
      path="/parenting-tools/sleep"
    >
      <SleepPlanner />
    </ToolPageFrame>
  );
}
