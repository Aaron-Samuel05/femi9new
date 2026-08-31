"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { AccountAddress } from "@femi9/core/services/account";

/**
 * The address book - now with the three verbs it was missing.
 *
 * It listed addresses and offered nothing else. The only writer was checkout,
 * which mints a fresh row per order, so the list filled with near-identical
 * cards a shopper could look at and not much more: a wrong pincode could only
 * be corrected by retyping the whole address at the next checkout, and the bad
 * one stayed on the page forever.
 *
 * Errors are bound to the FIELD they belong to. The API returns
 * `details.fieldErrors` from its Zod schema for exactly that, and a form that
 * throws away six answers to show one generic sentence is the reason people
 * abandon them.
 */

/** The shape of the form, which is also the shape of the POST body. */
interface AddressDraft {
  label: string;
  name: string;
  line: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  isPrimary: boolean;
}

const BLANK: AddressDraft = {
  label: "Home",
  name: "",
  line: "",
  city: "",
  state: "",
  pincode: "",
  phone: "",
  isPrimary: false,
};

/** Prefill from the RAW parts the DTO carries, never by re-parsing the composed
 *  "Coimbatore, Tamil Nadu 641001" line - that string is for reading. */
function draftFrom(address: AccountAddress): AddressDraft {
  return {
    label: address.label,
    name: address.name,
    line: address.line,
    city: address.cityRaw,
    state: address.state,
    pincode: address.pincode,
    phone: address.phone,
    isPrimary: address.primary,
  };
}

export function AddressBook({ addresses }: { addresses: AccountAddress[] }) {
  const router = useRouter();
  // null = closed; "new" = the add form; an id = editing that address.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  function open(target: "new" | AccountAddress) {
    setEditing(target === "new" ? "new" : target.id);
    setDraft(target === "new" ? BLANK : draftFrom(target));
    setError(null);
    setFieldErrors({});
  }

  function close() {
    setEditing(null);
    setError(null);
    setFieldErrors({});
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !editing) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/account/addresses" : `/api/account/addresses/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: Record<string, string[]> };
        };
        if (body.details?.fieldErrors) setFieldErrors(body.details.fieldErrors);
        setError(body.error ?? "Could not save that address.");
        return;
      }
      close();
      // The list is rendered by a server component reading the database, so
      // re-reading it is the only way the new card appears - and the only way
      // a changed default demotes the old one on screen.
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (removing) return;
    setRemoving(id);
    setError(null);
    try {
      const res = await fetch(`/api/account/addresses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not remove that address.");
        return;
      }
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setRemoving(null);
    }
  }

  const set = <K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="panel p-card">
      <div className="mb-5.5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 font-display text-[clamp(21px,2.6vw,26px)] font-normal">Saved addresses</h2>
        {editing === null && (
          <button type="button" onClick={() => open("new")} className="btn btn-dark btn-sm py-3">
            <Icon name="plus" size={16} strokeWidth={2} />
            Add address
          </button>
        )}
      </div>

      {error && editing === null && (
        <p className="m-0 mb-4 text-sm text-[#b4232c]" role="alert" aria-live="polite">
          {error}
        </p>
      )}

      {editing !== null && (
        <form
          className="mb-6 rounded-card border-[1.5px] border-moss-soft bg-paper p-card"
          onSubmit={save}
        >
          <h3 className="m-0 mb-4.5 font-display text-[clamp(18px,2vw,21px)] font-normal">
            {editing === "new" ? "New address" : "Edit address"}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Label" error={fieldErrors.label?.[0]}>
              <input
                className="field"
                value={draft.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Home"
                required
                disabled={busy}
              />
            </Field>
            <Field label="Recipient name" error={fieldErrors.name?.[0]}>
              <input
                className="field"
                autoComplete="name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                required
                disabled={busy}
              />
            </Field>
            <Field label="Flat, street and area" error={fieldErrors.line?.[0]} full>
              <input
                className="field"
                autoComplete="street-address"
                value={draft.line}
                onChange={(e) => set("line", e.target.value)}
                required
                disabled={busy}
              />
            </Field>
            <Field label="City" error={fieldErrors.city?.[0]}>
              <input
                className="field"
                autoComplete="address-level2"
                value={draft.city}
                onChange={(e) => set("city", e.target.value)}
                required
                disabled={busy}
              />
            </Field>
            <Field label="State" error={fieldErrors.state?.[0]}>
              <input
                className="field"
                autoComplete="address-level1"
                value={draft.state}
                onChange={(e) => set("state", e.target.value)}
                disabled={busy}
              />
            </Field>
            <Field label="Pincode" error={fieldErrors.pincode?.[0]}>
              <input
                className="field"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                value={draft.pincode}
                onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
              />
            </Field>
            <Field label="Mobile for delivery" error={fieldErrors.phone?.[0]}>
              <input
                className="field"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(-10))}
                disabled={busy}
              />
            </Field>
          </div>

          <label className="mt-4.5 flex cursor-pointer items-center gap-2.5 text-sm text-midnight">
            <input
              type="checkbox"
              className="size-4.5 accent-moss-deep"
              checked={draft.isPrimary}
              onChange={(e) => set("isPrimary", e.target.checked)}
              disabled={busy}
            />
            Use as my default delivery address
          </label>

          <p className="m-0 mt-3 min-h-5 text-[13px] text-[#b4232c]" role="alert" aria-live="polite">
            {error ?? " "}
          </p>

          <div className="mt-2 flex flex-wrap gap-3">
            <button type="submit" className="btn btn-dark btn-sm py-3.25 font-bold" disabled={busy}>
              {busy ? "Saving…" : "Save address"}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="rounded-pill border-[1.5px] border-moss-tint px-6 py-3.25 text-sm font-semibold text-midnight transition-colors hover:border-moss-soft disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-[clamp(12px,1.6vw,18px)] md:grid-cols-2">
        {addresses.length === 0 && editing === null && (
          <p className="m-0 py-6 text-[clamp(14px,1.3vw,15px)] text-muted">
            No saved addresses yet - add one here, or the address you enter at checkout is kept for
            next time.
          </p>
        )}
        {addresses.map((address) => (
          <div
            key={address.id}
            className="rounded-chip border-[1.5px] border-moss-tint p-[clamp(16px,2vw,24px)]"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[15px] font-bold">{address.label}</span>
              {address.primary && (
                <span className="rounded-pill bg-moss-tint px-2.5 py-1 text-[12px] font-semibold text-moss-deep">
                  Default
                </span>
              )}
            </div>
            <p className="m-0 text-sm leading-[1.6] text-muted">
              {address.name}
              <br />
              {address.line}
              <br />
              {address.city}
              {address.phone && (
                <>
                  <br />
                  {address.phone}
                </>
              )}
            </p>

            {confirming === address.id ? (
              /* An inline confirm, not `window.confirm`: a native dialog blocks
                 the page and cannot be styled, and this is a destructive action
                 on somebody's data. */
              <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[13px]">
                <span className="text-muted">Remove this address?</span>
                <button
                  type="button"
                  onClick={() => void remove(address.id)}
                  disabled={removing !== null}
                  className="cursor-pointer font-semibold text-[#b4232c] underline underline-offset-2 disabled:opacity-60"
                >
                  {removing === address.id ? "Removing…" : "Yes, remove"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="cursor-pointer text-muted underline underline-offset-2"
                >
                  Keep
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-4 text-[13px]">
                <button
                  type="button"
                  onClick={() => open(address)}
                  className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-moss-deep underline underline-offset-2"
                >
                  <Icon name="pencil" size={14} strokeWidth={1.8} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(address.id)}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-muted underline underline-offset-2 hover:text-midnight"
                >
                  <Icon name="trash" size={14} strokeWidth={1.8} />
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  full = false,
  children,
}: {
  label: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[12px] font-bold tracking-[0.04em] text-midnight uppercase">{label}</span>
      {children}
      {error && (
        <span className="text-[12px] text-[#b4232c]" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
