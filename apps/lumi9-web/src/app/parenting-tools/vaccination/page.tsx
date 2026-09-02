import type { Metadata } from "next";
import { ToolPageFrame } from "@/components/tools/ToolPageFrame";
import { ImmunisationSchedule } from "@/components/tools/ImmunisationSchedule";
import { absoluteUrl, canonical, og } from "@/lib/seo";

const TITLE = "Baby Vaccination Schedule (India, UIP) | Lumi9";
const DESCRIPTION =
  "Every dose on India's government immunisation schedule, dated from your baby's date of birth. Free at any public health centre.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: canonical("/parenting-tools/vaccination"),
  openGraph: og({ type: "website", url: absoluteUrl("/parenting-tools/vaccination"), title: TITLE, description: DESCRIPTION }),
};

export default function VaccinationPage() {
  return (
    <ToolPageFrame
      title="Vaccination schedule"
      subtitle="Every dose on the government (UIP) schedule, dated from your baby's birthday. Vaccination is never adjusted for being born early."
      crumb="Vaccination schedule"
      path="/parenting-tools/vaccination"
    >
      <ImmunisationSchedule />
    </ToolPageFrame>
  );
}
