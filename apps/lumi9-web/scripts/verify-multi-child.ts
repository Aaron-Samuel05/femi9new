/* Scratch verification for the multiple-children change. Not part of the suite. */
import { dbFor } from "@femi9/db";
import {
  deleteBaby,
  getBaby,
  listBabies,
  listMeasurementsByBaby,
  listVaccinationsByBaby,
  saveBabyProfile,
  setVaccination,
} from "@femi9/core/services/parenting";

const db = dbFor("lumi9");
const T = Date.now();
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const a = await db.user.create({ data: { email: `a-${T}@verify.test`, name: "Parent A" } });
  const b = await db.user.create({ data: { email: `b-${T}@verify.test`, name: "Parent B" } });

  const mk = (userId: string, name: string, dob: string, kg: number) =>
    saveBabyProfile("lumi9", userId, { name, dob, sex: "female", weightKg: kg }, "2026-09-07");

  const r1 = await mk(a.id, "Meera", "2026-03-10", 7.2);
  const r2 = await mk(a.id, "Arjun", "2025-01-20", 11.5);
  const r3 = await mk(a.id, "Kavya", "2026-08-01", 4.3);
  const rb = await mk(b.id, "Other", "2026-05-05", 6.0);
  if (r1.status !== "ok" || r2.status !== "ok" || r3.status !== "ok" || rb.status !== "ok") {
    throw new Error("setup failed: " + JSON.stringify([r1.status, r2.status, r3.status, rb.status]));
  }

  const aBabies = await listBabies("lumi9", a.id);
  check("three children on one account", aBabies.length === 3, aBabies.map((x) => x.name).join(", "));
  check("ordered oldest first", aBabies[0].name === "Arjun");
  check("the other account is unaffected", (await listBabies("lumi9", b.id)).length === 1);

  // ── the authorisation property ──
  check("B cannot READ A's child", (await getBaby("lumi9", b.id, r1.profile.id)) === null);

  const steal = await saveBabyProfile(
    "lumi9",
    b.id,
    { id: r1.profile.id, name: "Hijacked", dob: "2026-03-10", sex: "male" },
    "2026-09-07",
  );
  check("B cannot UPDATE A's child", steal.status === "not-found", steal.status);
  check(
    "...and A's child is untouched",
    (await getBaby("lumi9", a.id, r1.profile.id))?.name === "Meera",
  );

  await deleteBaby("lumi9", b.id, r1.profile.id);
  check("B cannot DELETE A's child", (await listBabies("lumi9", a.id)).length === 3);

  // ── per-child records ──
  const dose = await db.vaccineDose.findFirst({ select: { code: true } });
  if (dose) {
    await setVaccination("lumi9", a.id, r1.profile.id, { code: dose.code, status: "given", givenOn: "2026-09-01" });
    const ticks = await listVaccinationsByBaby("lumi9", a.id);
    check("a tick lands on ONE child", ticks.get(r1.profile.id)?.length === 1);
    check("...and not on a sibling", (ticks.get(r2.profile.id) ?? []).length === 0);

    const cross = await setVaccination("lumi9", b.id, r1.profile.id, { code: dose.code, status: "skipped" });
    check("B cannot tick A's child", cross.status === "no-profile", cross.status);
  } else {
    console.log("SKIP  vaccination checks — no doses seeded in this schema");
  }

  const measured = await listMeasurementsByBaby("lumi9", a.id);
  check("each child has their own measurement", measured.get(r1.profile.id)?.length === 1);
  check("...with that child's weight", measured.get(r2.profile.id)?.[0]?.weightKg === 11.5);

  // ── editing keeps the row, it does not add one ──
  const edited = await saveBabyProfile(
    "lumi9", a.id,
    { id: r1.profile.id, name: "Meera", dob: "2026-03-10", sex: "female", weightKg: 7.6 },
    "2026-09-08",
  );
  check("an edit updates in place", edited.status === "ok" && (await listBabies("lumi9", a.id)).length === 3);
  check("...and logs a second measurement", (await listMeasurementsByBaby("lumi9", a.id)).get(r1.profile.id)?.length === 2);

  // ── cascade ──
  await deleteBaby("lumi9", a.id, r1.profile.id);
  check("removing a child leaves the siblings", (await listBabies("lumi9", a.id)).length === 2);
  check("...and cascades their measurements", !(await listMeasurementsByBaby("lumi9", a.id)).has(r1.profile.id));

  await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
