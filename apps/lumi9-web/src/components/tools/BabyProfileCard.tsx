"use client";

import { useState } from "react";
import {
  BLOOD_GROUPS,
  clearBabyProfile,
  saveBabyProfile,
  useBabyProfile,
  useProfileOrigin,
  useProfileSync,
  type BabySex,
  type BloodGroup,
} from "@/lib/baby-profile";
import { useParenting } from "@/lib/parenting-context";

/**
 * One profile, read by every tool.
 *
 * Nothing here gates anything: a parent who skips it still gets working tools,
 * they just type more. That is why there is no "continue" step and no validation
 * beyond what the maths genuinely needs.
 *
 * **Where it is stored depends on who is asking, and the card says which.**
 * Signed out, it is localStorage and nothing else — the original promise, still
 * literally true. Signed in, it is a row on the account, mirrored to the device
 * so the tools keep answering instantly and keep working offline. A page that
 * says "stays on this device" while POSTing a child's date of birth is lying, so
 * the sentence under the heading is bound to `origin` rather than written once.
 *
 * The email is never stored either way. It belongs to the care-plan REQUEST, not
 * to the baby: the server keeps a `ParentingLead` because that is a record of
 * consent with an owner, and the browser keeps nothing.
 */
export function BabyProfileCard() {
  const profile = useBabyProfile();
  const origin = useProfileOrigin();
  const sync = useProfileSync();
  const { signedIn } = useParenting();
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState(profile?.name ?? "");
  const [dob, setDob] = useState(profile?.dob ?? "");
  const [sex, setSex] = useState<BabySex | "">(profile?.sex ?? "");
  const [weight, setWeight] = useState(profile?.weightKg?.toString() ?? "");
  const [height, setHeight] = useState(profile?.heightCm?.toString() ?? "");
  const [preterm, setPreterm] = useState(profile?.gestationalWeeks?.toString() ?? "");
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | "">(profile?.bloodGroup ?? "");
  // Deliberately NOT seeded from the profile: it is not stored any more, so
  // there is nothing to seed it from. A parent who wants a second plan types the
  // address again, which is the honest amount of friction for "send me an email".
  const [email, setEmail] = useState("");

  const [mail, setMail] = useState<
    { state: "idle" } | { state: "sending" } | { state: "sent"; to: string } | { state: "error"; msg: string }
  >({ state: "idle" });

  const today = new Date().toISOString().slice(0, 10);
  const emailValid = email.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSave = dob !== "" && dob <= today && (sex === "male" || sex === "female") && emailValid;

  async function save() {
    if (!canSave) return;
    const trimmedEmail = email.trim().toLowerCase();

    // Awaited, so the account write is in flight (and its failure already
    // surfaced) before the card flips back to its summary view.
    await saveBabyProfile({
      name: name.trim() || undefined,
      dob,
      sex: sex as BabySex,
      weightKg: weight ? Number(weight) : undefined,
      heightCm: height ? Number(height) : undefined,
      gestationalWeeks: preterm ? Number(preterm) : undefined,
      bloodGroup: bloodGroup || undefined,
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
        body: JSON.stringify({
          email: trimmedEmail,
          name,
          dob,
          sex,
          bloodGroup,
          // Which tool page asked, so the lead list can tell an entry point that
          // works from one that nobody ever reaches.
          source: window.location.pathname,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) setMail({ state: "sent", to: trimmedEmail });
      else setMail({ state: "error", msg: data.error ?? "We couldn't send the email just now." });
    } catch {
      setMail({ state: "error", msg: "We couldn't send the email just now." });
    }
    // Cleared whichever way it went: the field is a one-shot request, not a
    // stored preference, and leaving an address sitting in an input on a page
    // about somebody's child is the kind of thing a shared laptop punishes.
    setEmail("");
  }

  function beginEdit() {
    setName(profile?.name ?? "");
    setDob(profile?.dob ?? "");
    setSex(profile?.sex ?? "");
    setWeight(profile?.weightKg?.toString() ?? "");
    setHeight(profile?.heightCm?.toString() ?? "");
    setPreterm(profile?.gestationalWeeks?.toString() ?? "");
    setBloodGroup(profile?.bloodGroup ?? "");
    setEmail("");
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
            <div className="mt-1.5 text-[13px] text-muted">
              {origin === "account"
                ? "Saved to your account, so it follows you to any device."
                : "Saved on this device only."}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={beginEdit}>
              Edit
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void clearBabyProfile()}>
              Clear
            </button>
          </div>
        </div>

        {/* The account write, separately from the email. A profile that saved on
            the device but failed to reach the account is a working page with a
            silent gap in it, which is exactly the class of failure this whole
            surface used to be made of. */}
        {sync.state === "error" ? (
          <p className="mt-3 text-sm text-[#b45309]">{sync.message}</p>
        ) : null}

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
      <p className="m-0 mb-5 max-w-[95ch] text-sm text-muted">
        Fill this in once and every tool uses it.{" "}
        {signedIn ? (
          <>
            It saves to your Lumi9 account, so it&apos;s there on your phone as well as here. Add an
            email below only if you also want the plan sent to you.
          </>
        ) : (
          <>
            Baby&apos;s details stay on this device -{" "}
            <a href="/login?next=%2Fparenting-tools" className="underline">
              sign in
            </a>{" "}
            if you&apos;d rather keep them on your account. You can skip it all and use the tools
            directly.
          </>
        )}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            Email me the plan (optional)
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
              ? "One email with a care plan and the upcoming vaccination dates. We keep the address so we can send it, and nothing else."
              : "That doesn't look like an email address."}
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-dark"
          disabled={!canSave || sync.state === "saving"}
          onClick={() => void save()}
        >
          {sync.state === "saving" ? "Saving…" : email.trim() ? "Save & email my plan" : "Save"}
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
