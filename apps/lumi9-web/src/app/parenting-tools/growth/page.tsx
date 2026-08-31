import type { Metadata } from "next";
import { ToolPageFrame } from "@/components/tools/ToolPageFrame";
import { GrowthPercentile } from "@/components/tools/GrowthPercentile";
import { absoluteUrl, canonical, SITE_NAME } from "@/lib/seo";

const TITLE = "Baby Growth Percentile Calculator (WHO) | Lumi9";
const DESCRIPTION =
  "See where your baby sits on the WHO weight and height charts, corrected for prematurity where it applies. General guidance, not a diagnosis.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: canonical("/parenting-tools/growth"),
  openGraph: { type: "website", url: absoluteUrl("/parenting-tools/growth"), siteName: SITE_NAME, title: TITLE, description: DESCRIPTION },
};

export default function GrowthPage() {
  return (
    <ToolPageFrame
      title="Growth percentiles"
      subtitle="Where your baby sits on the WHO charts for weight and height — the same ones your paediatrician uses."
      crumb="Growth percentiles"
      path="/parenting-tools/growth"
    >
      <GrowthPercentile />
    </ToolPageFrame>
  );
}
