import type { Metadata } from "next";
import { ToolPageFrame } from "@/components/tools/ToolPageFrame";
import { FirstFoods } from "@/components/tools/FirstFoods";
import { absoluteUrl, canonical, og } from "@/lib/seo";

const TITLE = "Baby First Foods Chart - Ragi, Kambu & Millets by Age | Lumi9";
const DESCRIPTION =
  "When to start solids and what to give: ragi kanji, kambu, thinai, pasi paruppu and khichdi, stage by stage from 6 months - plus the foods to avoid and until when.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "baby food chart 6 months india",
    "ragi kanji for babies",
    "kambu for babies",
    "when to start solids baby india",
    "millet baby food by age",
    "foods to avoid babies under 1",
  ],
  alternates: canonical("/parenting-tools/first-foods"),
  openGraph: og({ type: "website", url: absoluteUrl("/parenting-tools/first-foods"), title: TITLE, description: DESCRIPTION }),
};

export default function FirstFoodsPage() {
  return (
    <ToolPageFrame
      title="First foods"
      subtitle="Ragi, kambu, thinai and pasi paruppu - what to start when, in what form, and what to keep off the plate until they're older."
      crumb="First foods"
      path="/parenting-tools/first-foods"
    >
      <FirstFoods />
    </ToolPageFrame>
  );
}
