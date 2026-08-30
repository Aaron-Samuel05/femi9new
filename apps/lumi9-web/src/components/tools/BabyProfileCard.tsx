"use client";

import { useState } from "react";
import {
  clearBabyProfile,
  saveBabyProfile,
  useBabyProfile,
  type BabySex,
} from "@/lib/baby-profile";

/**
 * One profile, read by every tool.
 *
 * Nothing here gates anything: a parent who skips it still gets working tools,
 * they just type more. That is why there is no "continue" step and no validation
 * beyond what the maths genuinely needs.
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

  const today = new Date().toISOString().slice(0, 10);
  const canSave = dob !== "" && dob <= today && (sex === "male" || sex === "female");

  function save() {
    if (!canSave) return;
    saveBabyProfile({
      name: name.trim() || undefined,
      dob,
      sex: sex as BabySex,
      weightKg: weight ? Number(weight) : undefined,
      heightCm: height ? Number(height) : undefined,
      gestationalWeeks: preterm ? Number(preterm) : undefined,
    });
    setEditing(false);
  }

  function beginEdit() {
    setName(profile?.name ?? "");
    setDob(profile?.dob ?? "");
    setSex(profile?.sex ?? "");
    setWeight(profile?.weightKg?.toString() ?? "");
    setHeight(profile?.heightCm?.toString() ?? "");
    setPreterm(profile?.gestationalWeeks?.toString() ?? "");
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
      </div>
    );
  }

  return (
    <div className="panel p-card">
      <h2 className="m-0 mb-1 font-display text-[clamp(20px,2.4vw,28px)] font-normal leading-tight">
        Tell us about your baby
      </h2>
      <p className="m-0 mb-5 text-sm text-muted">
        Fill this in once and every tool below uses it. Stored on this device only — nothing is sent
        to us. You can skip it and use the tools directly.
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
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn btn-dark" disabled={!canSave} onClick={save}>
          Save
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
