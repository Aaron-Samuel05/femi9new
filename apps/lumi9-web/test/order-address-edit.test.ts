import { describe, it, expect } from "vitest";
import {
  ADDRESS_EDITABLE_STATUSES,
  addressEditState,
} from "@femi9/core/services/order-address";

/**
 * Who may change the delivery address on a placed order, and when.
 *
 * This is the whole gate. The service consumes the grant with an `updateMany`
 * that re-checks the same conditions, so a wrong answer here does not by itself
 * let a customer redirect a parcel — but it decides what she is SHOWN, and a
 * control offered and then refused is its own defect.
 *
 * The three closed reasons are deliberately distinguished rather than collapsed
 * into one boolean, because support reads them out on a call: "you haven't been
 * given a change" and "you've already used it" and "it's already shipped" are
 * three different conversations.
 */

const base = { status: "paid", addressEditGrantedAt: null, addressEditUsedAt: null };
const GRANTED = new Date("2026-09-03T06:00:00Z");
const USED = new Date("2026-09-03T07:00:00Z");

describe("addressEditState", () => {
  it("is closed by default — a placed order is not editable", () => {
    const s = addressEditState(base);
    expect(s.open).toBe(false);
    expect(s.reason).toBe("not-granted");
  });

  it("opens once support grants it", () => {
    const s = addressEditState({ ...base, addressEditGrantedAt: GRANTED });
    expect(s.open).toBe(true);
    expect(s.reason).toBeNull();
  });

  it("closes for good once used — this is the 'only one time' rule", () => {
    const s = addressEditState({
      ...base,
      addressEditGrantedAt: GRANTED,
      addressEditUsedAt: USED,
    });
    expect(s.open).toBe(false);
    expect(s.reason).toBe("already-used");
  });

  it("reports already-used ahead of not-granted when a grant was revoked after use", () => {
    // Support closed the window after she had used it. She must not be told she
    // was never given a change — she was, and she spent it.
    const s = addressEditState({ ...base, addressEditGrantedAt: null, addressEditUsedAt: USED });
    expect(s.reason).toBe("already-used");
  });

  it("refuses once the parcel has gone, even with a live grant", () => {
    for (const status of ["shipped", "delivered"]) {
      const s = addressEditState({ ...base, status, addressEditGrantedAt: GRANTED });
      expect(s.open, status).toBe(false);
      expect(s.reason, status).toBe("too-late");
    }
  });

  it("refuses on a cancelled or refunded order", () => {
    // There is no parcel to redirect, and an edit box would imply one is still
    // coming.
    for (const status of ["cancelled", "refunded"]) {
      const s = addressEditState({ ...base, status, addressEditGrantedAt: GRANTED });
      expect(s.open, status).toBe(false);
      expect(s.reason, status).toBe("too-late");
    }
  });

  it("allows every status the service names as editable", () => {
    for (const status of ADDRESS_EDITABLE_STATUSES) {
      const s = addressEditState({ ...base, status, addressEditGrantedAt: GRANTED });
      expect(s.open, status).toBe(true);
    }
  });

  it("carries the timestamps through, so support can say when", () => {
    const s = addressEditState({
      ...base,
      addressEditGrantedAt: GRANTED,
      addressEditUsedAt: USED,
    });
    expect(s.grantedAt).toEqual(GRANTED);
    expect(s.usedAt).toEqual(USED);
  });
});

describe("ADDRESS_EDITABLE_STATUSES", () => {
  it("excludes every status where the parcel has left or the order is void", () => {
    // Pinned as a list rather than asserted loosely: adding `shipped` here
    // would let a customer change an address that is already on a label, and
    // the failure is invisible — the save succeeds and the parcel still goes to
    // the old address.
    expect([...ADDRESS_EDITABLE_STATUSES]).toEqual(["pending", "paid", "processing"]);
  });
});
