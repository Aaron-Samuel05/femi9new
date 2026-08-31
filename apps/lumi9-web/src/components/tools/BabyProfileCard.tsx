"use client";

import { useState } from "react";
import {
  BLOOD_GROUPS,
  clearBabyProfile,
  saveBabyProfile,
  useBabyProfile,
  type BabySex,
  type BloodGroup,
} from "@/lib/baby-profile";

/**
 * One profile, read by every tool.
 *
 * Nothing here gates anything: a parent who skips it still gets working tools,
 * they just type more. That is why there is no "continue" step and no validation
 * beyond what the maths genuinely needs.
 *
 * The ONE thing that leaves the device is an email address, and only if the
 * parent adds one: saving then sends a single care + vaccination plan. Everything
 * else stays in localStorage.
 */
export function BabyProfileCard() {
  const profile = useBabyProfile();
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState(profile?.name ?? "");
  const [dob, setDob] = useState(profile?.dob ?? "");
  const [sex, setSex] = useState<BabySex | "">(profile?.sex ?? "");
  const [weight, setWeight] = useState(profile?.weightKg?.toString() ?? "");
  const [height, setHeight] = useState(profile?.heightCm?.toString() ?? "");
  const [preterm, setPreterm] = useState(profile?.gestationalWeeks?.toString() ?? "");
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | "">(profile?.bloodGroup ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");

  const [mail, setMail] = useState<
    { state: "idle" } | { state: "sending" } | { state: "sent"; to: string } | { state: "error"; msg: string }
  >({ state: "idle" });

  const today = new Date().toISOString().slice(0, 10);
  const emailValid = email.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSave = dob !== "" && dob <= today && (sex === "male" || sex === "female") && emailValid;

  async function save() {
    if (!canSave) return;
    const trimmedEmail = email.trim().toLowerCase();
    saveBabyProfile({
      name: name.trim() || undefined,
      dob,
      sex: sex as BabySex,
      weightKg: weight ? Number(weight) : undefined,
      heightCm: height ? Number(height) : undefined,
      gestationalWeeks: preterm ? Number(preterm) : undefined,
      bloodGroup: bloodGroup || undefined,
      email: trimmedEmail || undefined,
    });
    setEditing(false);

    if (!trimmedEmail) {
      setMail({ state: "idle" });
      return;
    }
    setMail({ state: "sending" });
    try {
      const res = await fetch("/api/parenting/care-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, name, dob, sex, bloodGroup }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) setMail({ state: "sent", to: trimmedEmail });
      else setMail({ state: "error", msg: data.error ?? "We couldn't send the email just now." });
    } catch {
      setMail({ state: "error", msg: "We couldn't send the email just now." });
    }
  }

  function beginEdit() {
    setName(profile?.name ?? "");
    setDob(profile?.dob ?? "");
    setSex(profile?.sex ?? "");
    setWeight(profile?.weightKg?.toString() ?? "");
    setHeight(profile?.heightCm?.toString() ?? "");
    setPreterm(profile?.gestationalWeeks?.toString() ?? "");
    setBloodGroup(profile?.bloodGroup ?? "");
    setEmail(profile?.email ?? "");
    setEditing(true);
  }

  if (profile && !editing) {
    return (
      <div className="panel p-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-display text-[clamp(20px,2.4vw,28px)] leading-tight">
              {profile.name || "Your baby"}
            </div>
            <div className="mt-1 text-sm text-muted">
              Born {profile.dob}
              {profile.weightKg ? ` · ${profile.weightKg} kg` : ""}
              {profile.bloodGroup ? ` · ${profile.bloodGroup}` : ""}
              {profile.gestationalWeeks && profile.gestationalWeeks < 37
                ? ` · born at ${profile.gestationalWeeks} weeks`
                : ""}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={beginEdit}>
              Edit
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => clearBabyProfile()}>
              Clear
            </button>
          </div>
        </div>
        {mail.state === "sending" ? (
          <p className="mt-3 text-sm text-muted">Sending your plan…</p>
        ) : mail.state === "sent" ? (
          <p className="mt-3 rounded-chip bg-moss-tint/40 px-4 py-2.5 text-sm text-moss-deep">
            Your care &amp; vaccination plan is on its way to <b>{mail.to}</b>.
          </p>
        ) : mail.state === "error" ? (
          <p className="mt-3 text-sm text-[#b45309]">{mail.msg}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="panel p-card">
      <h2 className="m-0 mb-1 font-display text-[clamp(20px,2.4vw,28px)] font-normal leading-tight">
        Tell us about your baby
      </h2>
      <p className="m-0 mb-5 text-sm text-muted">
        Fill this in once and every tool uses it. Baby&apos;s details stay on this device - the only
        thing we use is your email, and only to send you a one-time care &amp; vaccination plan. You
        can skip it and use the tools directly.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Name (optional)</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Date of birth</span>
          <input
            type="date"
            className="field"
            max={today}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Sex</span>
          <select
            className="field"
            value={sex}
            onChange={(e) => setSex(e.target.value as BabySex | "")}
          >
            <option value="">Select</option>
            <option value="female">Girl</option>
            <option value="male">Boy</option>
          </select>
          <span className="mt-1 block text-[13px] text-muted">
            Growth charts differ for girls and boys, so percentiles need this.
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Weight (kg)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            className="field"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Height (cm)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            className="field"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">
            Blood group (optional)
          </span>
          <select
            className="field"
            value={bloodGroup}
            onChange={(e) => setBloodGroup(e.target.value as BloodGroup | "")}
          >
            <option value="">Select</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">
            Born early? Weeks at birth (optional)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min="22"
            max="42"
            className="field"
            value={preterm}
            onChange={(e) => setPreterm(e.target.value)}
          />
          <span className="mt-1 block text-[13px] text-muted">
            Used to correct growth percentiles. Vaccination dates are never corrected.
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">
            Your email (optional)
          </span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            className="field"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!emailValid}
          />
          <span className="mt-1 block text-[13px] text-muted">
            {emailValid
              ? "We'll email you a care plan + upcoming vaccination dates. Nothing else."
              : "That doesn't look like an email address."}
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-dark" disabled={!canSave} onClick={save}>
          {email.trim() ? "Save & email my plan" : "Save"}
        </button>
        {profile ? (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
