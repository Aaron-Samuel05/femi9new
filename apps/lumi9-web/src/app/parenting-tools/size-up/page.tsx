import type { Metadata } from "next";
import { ToolPageFrame } from "@/components/tools/ToolPageFrame";
import { SizeUpPredictor } from "@/components/tools/SizeUpPredictor";
import { absoluteUrl, canonical, og } from "@/lib/seo";

const TITLE = "When Will My Baby Size Up? Diaper Size Predictor | Lumi9";
const DESCRIPTION =
  "An estimate of when your baby moves to the next diaper size, from their current weight - so the next pack is the right one.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: canonical("/parenting-tools/size-up"),
  openGraph: og({ type: "website", url: absoluteUrl("/parenting-tools/size-up"), title: TITLE, description: DESCRIPTION }),
};

export default function SizeUpPage() {
  return (
    <ToolPageFrame
      title="When will they size up?"
      subtitle="Babies grow into the next size faster than you'd think. Here's a rough guide to when, from your baby's weight."
      crumb="Size-up predictor"
      path="/parenting-tools/size-up"
    >
      <SizeUpPredictor />
    </ToolPageFrame>
  );
}
