"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * The customer's one-time address correction.
 *
 * Rendered only when support has opened the window for this order and she has
 * not used it — the page decides that on the server, so a customer with no
 * grant is never shown a control that would be refused. The server checks it
 * again on save; this is the affordance, not the rule.
 *
 * ── Why the warning is stated up front, not after she saves ──────────────────
 * "One time" is the whole design, and a person who does not know that will
 * reasonably save a half-finished address and come back to it. There is no
 * coming back. So the button says what it costs before she opens the form, and
 * the form says it again above Save.
 */

interface Fields {
  name: string;
  line: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
}

type FieldErrors = Partial<Record<keyof Fields, string>>;

export function EditAddress({
  orderNo,
  current,
}: {
  orderNo: string;
  /** Prefill from the order's present address; all blank when it has none,
   *  which is the subscription-renewal case this was built for. */
  current: Fields;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Fields>(current);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function set<K extends keyof Fields>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrors({});
    setFormError(null);

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/address`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; details?: { fieldErrors?: Record<string, string[]> } }
        | null;

      if (!res.ok) {
        const fields = body?.details?.fieldErrors;
        if (fields && Object.keys(fields).length > 0) {
          const mapped: FieldErrors = {};
          for (const k of ["name", "line", "city", "state", "pincode", "phone"] as const) {
            const msg = fields[k]?.[0];
            if (msg) mapped[k] = msg;
          }
          setErrors(mapped);
          setFormError("Check the highlighted fields and try again.");
        } else {
          // A 409 carries the real sentence — already used, or dispatched.
          setFormError(body?.error ?? "We could not save that. Please try again.");
        }
        setSaving(false);
        return;
      }

      // Saved, and the window is now closed. `router.refresh()` re-renders the
      // page from the server so the address block shows the NEW address and
      // this form disappears — rather than leaving a stale address above an
      // edit box that would now be refused.
      setDone(true);
      router.refresh();
    } catch {
      setFormError("Network error - please try again.");
      setSaving(false);
    }
  }

  if (done) {
    return (
      <p className="mt-5 mb-0 flex items-start gap-2 rounded-chip bg-moss-tint px-3.5 py-3 text-[13px] leading-[1.55] text-moss-deep">
        <Icon name="check" size={15} strokeWidth={2} />
        Address updated. We&rsquo;ll deliver to the new address — contact support if anything else
        needs changing.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-dark text-[13px] font-bold"
        >
          Change delivery address
        </button>
        <p className="mt-2.5 mb-0 text-[12px] leading-[1.5] text-muted">
          Support has opened a <strong>one-time</strong> change for this order. Once you save, the
          address is final — you&rsquo;ll need to contact support again to change it further.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-5" noValidate>
      <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
        <Field label="Full name" error={errors.name} className="min-[420px]:col-span-2">
          <input
            className="field w-full"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            autoComplete="name"
            required
          />
        </Field>
        <Field label="Address" error={errors.line} className="min-[420px]:col-span-2">
          <input
            className="field w-full"
            value={values.line}
            onChange={(e) => set("line", e.target.value)}
            autoComplete="address-line1"
            placeholder="Flat, street, area"
            required
          />
        </Field>
        <Field label="City" error={errors.city}>
          <input
            className="field w-full"
            value={values.city}
            onChange={(e) => set("city", e.target.value)}
            autoComplete="address-level2"
            required
          />
        </Field>
        <Field label="State" error={errors.state}>
          <input
            className="field w-full"
            value={values.state}
            onChange={(e) => set("state", e.target.value)}
            autoComplete="address-level1"
            required
          />
        </Field>
        <Field label="PIN code" error={errors.pincode}>
          <input
            className="field w-full"
            inputMode="numeric"
            maxLength={6}
            value={values.pincode}
            onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoComplete="postal-code"
            required
          />
        </Field>
        <Field label="Mobile for delivery" error={errors.phone}>
          <input
            className="field w-full"
            inputMode="tel"
            maxLength={10}
            value={values.phone}
            /* Keeps the LAST ten digits, so a pasted "+91 98842 30571" lands as
               "9884230571" rather than truncating to the country code. */
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(-10))}
            autoComplete="tel"
          />
        </Field>
      </div>

      {formError && (
        <p className="mt-3 mb-0 text-[13px] text-[#b4232c]" role="alert">
          {formError}
        </p>
      )}

      <p className="mt-3.5 mb-0 text-[12px] leading-[1.5] text-muted">
        Saving is final for this order — you get <strong>one</strong> change.
      </p>

      <div className="mt-3 flex flex-wrap gap-2.5">
        <button type="submit" className="btn btn-dark text-[13px] font-bold" disabled={saving}>
          {saving ? "Saving…" : "Save new address"}
        </button>
        <button
          type="button"
          className="btn text-[13px] font-bold"
          onClick={() => {
            setOpen(false);
            setValues(current);
            setErrors({});
            setFormError(null);
          }}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <label className="text-[12px] font-bold text-moss-deep">{label}</label>
      {children}
      {error && (
        <span className="text-[12px] text-[#b4232c]" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
