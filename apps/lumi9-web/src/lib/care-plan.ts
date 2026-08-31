import { ageInMonths, formatMonthYear, type IsoDate } from "@/lib/baby-age";
import { scheduleFor } from "@/lib/immunisation-schedule";
import type { BabySex } from "@/lib/baby-profile";

/**
 * Builds the one-time "care & vaccination plan" email a parent gets after filling
 * in the baby profile. Pure and framework-agnostic - no window, no server-only -
 * so the API route can call it and a test can assert on it.
 *
 * The care tips are general, age-appropriate guidance, never medical advice; the
 * vaccine dates come from the same UIP schedule the on-site tool uses. Both carry
 * a "your paediatrician comes first" line, because a plan a family acts on
 * without one is worse than no plan.
 */

export type CarePlanInput = {
  name?: string;
  dob: IsoDate;
  sex?: BabySex;
  bloodGroup?: string;
  today?: IsoDate;
};

type TipBlock = { upToMonths: number; heading: string; tips: string[] };

const CARE_TIPS: TipBlock[] = [
  {
    upToMonths: 1,
    heading: "The newborn weeks",
    tips: [
      "Change often - a newborn goes through 8-12 diapers a day. A dry bottom is the single best guard against rash.",
      "At each change, wipe front to back, then let the skin air-dry for a minute before the fresh diaper.",
      "Fold the diaper below the umbilical stump until it heals, so it stays dry and open to air.",
      "Feed on demand (roughly every 2-3 hours) and always place baby on their back to sleep.",
    ],
  },
  {
    upToMonths: 3,
    heading: "1 to 3 months",
    tips: [
      "You'll settle into 6-8 diapers a day. A barrier cream at night helps through longer stretches of sleep.",
      "Tummy time while awake and supervised - a few minutes, several times a day - builds neck and shoulder strength.",
      "Check the diaper's leg cuffs sit outside, not tucked in - tucked cuffs are the usual cause of leaks.",
      "Expect a growth spurt around 6 weeks; more feeds and fussiness for a few days is normal.",
    ],
  },
  {
    upToMonths: 6,
    heading: "3 to 6 months",
    tips: [
      "Around now most babies move up a diaper size - go up if the current one leaves red marks or leaks overnight.",
      "Rolling starts, so never leave baby unattended on a raised surface, even for a moment.",
      "Keep to a wind-down routine before sleep; predictability helps more than any single trick.",
      "Solids usually wait until about 6 months - look for sitting with support and interest in food, and ask your paediatrician.",
    ],
  },
  {
    upToMonths: 12,
    heading: "6 to 12 months",
    tips: [
      "As solids begin, stools change - that's expected. A pants-style diaper is easier once baby is crawling and wriggly.",
      "Offer water in a cup with meals; keep introducing one new food at a time and watch for reactions.",
      "Babyproof low: cover sockets, move cords and small objects, and pad sharp corners as baby pulls to stand.",
      "Night nappies need more absorbency than day ones - a size up just for the night often stops leaks.",
    ],
  },
  {
    upToMonths: Infinity,
    heading: "The toddler year and beyond",
    tips: [
      "A larger, pants-style diaper suits a walker; change on their feet to keep the pace of the day.",
      "Watch for early signs of readiness for potty learning - there's no rush, and every child differs.",
      "Keep meals varied and unhurried; toddlers regulate their own appetite better than we expect.",
      "Skin still needs the same care - quick changes and a barrier cream when the weather is hot and humid.",
    ],
  },
];

function tipsForAge(ageMonths: number): TipBlock {
  const age = Number.isFinite(ageMonths) && ageMonths > 0 ? ageMonths : 0;
  return CARE_TIPS.find((b) => age < b.upToMonths) ?? CARE_TIPS[CARE_TIPS.length - 1];
}

export type CarePlan = {
  subject: string;
  html: string;
  text: string;
  ageMonths: number;
  babyName: string;
  careHeading: string;
  careTips: string[];
  dueNow: { vaccine: string; dose: string; dueOn: IsoDate }[];
  upNext: { vaccine: string; dose: string; dueOn: IsoDate }[];
};

const DISCLAIMER =
  "This is general guidance to keep alongside your paediatrician's advice, not a substitute for it. Vaccination dates run from your baby's actual birthday and are never adjusted for being born early.";

export function buildCarePlan(input: CarePlanInput): CarePlan {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const ageMonths = ageInMonths(input.dob, today);
  const babyName = input.name?.trim() || "your baby";

  const block = tipsForAge(ageMonths);

  const schedule = scheduleFor({ dob: input.dob, today, track: "UIP" });
  const dueNow = schedule
    .filter((d) => d.status === "due")
    .map((d) => ({ vaccine: d.vaccine, dose: d.dose, dueOn: d.dueOn }));
  const upNext = schedule
    .filter((d) => d.status === "upcoming")
    .slice(0, 6)
    .map((d) => ({ vaccine: d.vaccine, dose: d.dose, dueOn: d.dueOn }));

  const subject =
    dueNow.length > 0
      ? `${cap(babyName)}: ${dueNow.length} vaccination${dueNow.length > 1 ? "s" : ""} due now + your care plan`
      : `${cap(babyName)}'s care & vaccination plan`;

  const text = buildText({ babyName, block, dueNow, upNext });
  const html = buildHtml({ babyName, block, dueNow, upNext });

  return {
    subject,
    html,
    text,
    ageMonths,
    babyName,
    careHeading: block.heading,
    careTips: block.tips,
    dueNow,
    upNext,
  };
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function doseLine(d: { vaccine: string; dose: string; dueOn: IsoDate }) {
  return `${d.vaccine} · ${d.dose} - ${formatMonthYear(d.dueOn)}`;
}

function buildText(a: {
  babyName: string;
  block: TipBlock;
  dueNow: CarePlan["dueNow"];
  upNext: CarePlan["upNext"];
}): string {
  const lines: string[] = [];
  lines.push(`A care & vaccination plan for ${a.babyName}`, "");
  lines.push(a.block.heading.toUpperCase());
  for (const t of a.block.tips) lines.push(`- ${t}`);
  lines.push("");
  if (a.dueNow.length) {
    lines.push("DUE NOW");
    for (const d of a.dueNow) lines.push(`- ${doseLine(d)}`);
    lines.push("");
  }
  if (a.upNext.length) {
    lines.push("COMING UP");
    for (const d of a.upNext) lines.push(`- ${doseLine(d)}`);
    lines.push("");
  }
  lines.push(DISCLAIMER);
  lines.push("", "- Lumi9");
  return lines.join("\n");
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml(a: {
  babyName: string;
  block: TipBlock;
  dueNow: CarePlan["dueNow"];
  upNext: CarePlan["upNext"];
}): string {
  const tips = a.block.tips
    .map(
      (t) =>
        `<li style="margin:0 0 10px;padding-left:4px;line-height:1.55;color:#3a3a34;">${esc(t)}</li>`,
    )
    .join("");

  const list = (rows: CarePlan["dueNow"]) =>
    rows
      .map(
        (d) =>
          `<tr><td style="padding:9px 0;border-bottom:1px solid #e9e6dd;color:#2a2a25;font-weight:600;">${esc(d.vaccine)} <span style="font-weight:400;color:#7a7a70;">· ${esc(d.dose)}</span></td><td style="padding:9px 0;border-bottom:1px solid #e9e6dd;color:#7a7a70;text-align:right;white-space:nowrap;">${esc(formatMonthYear(d.dueOn))}</td></tr>`,
      )
      .join("");

  const section = (title: string, rows: CarePlan["dueNow"], accent: string) =>
    rows.length
      ? `<h3 style="margin:26px 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${accent};">${esc(title)}</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px;">${list(rows)}</table>`
      : "";

  return `<!doctype html><html><body style="margin:0;background:#f6f4ec;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e9e6dd;">
<tr><td style="background:#2f4a1e;padding:24px 28px;">
<div style="font-size:22px;font-weight:700;color:#fdfbf3;letter-spacing:-.01em;">Lumi9</div>
<div style="margin-top:4px;font-size:13px;color:#c6d3b8;">CloudSoft baby care</div>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 6px;font-size:24px;line-height:1.2;color:#20201c;font-weight:700;">A care &amp; vaccination plan for ${esc(a.babyName)}</h1>
<p style="margin:0 0 4px;font-size:15px;line-height:1.55;color:#5a5a52;">Here's what tends to matter at this age, and the vaccinations coming up - dated from your baby's birthday.</p>
<h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#2f4a1e;">${esc(a.block.heading)}</h3>
<ul style="margin:0;padding:0 0 0 18px;font-size:15px;">${tips}</ul>
${section("Due now", a.dueNow, "#b45309")}
${section("Coming up", a.upNext, "#2f4a1e")}
<p style="margin:26px 0 0;padding:14px 16px;background:#f6f4ec;border-radius:12px;font-size:13px;line-height:1.5;color:#6a6a60;">${esc(DISCLAIMER)}</p>
</td></tr>
<tr><td style="padding:20px 28px 28px;color:#9a9a90;font-size:12px;">You're getting this because you asked for a plan on the Lumi9 parenting tools. We didn't store your baby's details - they live on your device.</td></tr>
</table></td></tr></table></body></html>`;
}
