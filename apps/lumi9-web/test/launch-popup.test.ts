import { describe, it, expect } from "vitest";
import {
  isLaunchPopupLive,
  LAUNCH_POPUP_DEFAULT,
  LAUNCH_POPUP_MAX_SECONDS,
  normalizeLaunchPopup,
} from "@femi9/core/services/settings";

/**
 * The popup is the one setting stored as a loose Json object, and it is the one
 * a visitor meets before anything else on the site. Both facts point the same
 * way: a row that is malformed, hand-edited, or written by an older version of
 * the form must degrade to NO popup, never to a broken one.
 *
 * The failure this guards is specific and silent. `seconds` is what closes the
 * modal; a row where it is missing, a string, negative or NaN yields a timer
 * that never fires, so the offer covers the storefront until the shopper finds
 * the X — or leaves. Nothing errors, nothing is logged, and it looks fine in
 * the console, where the value the admin typed is still sitting in the box.
 */
describe("normalizeLaunchPopup", () => {
  it("falls back whole for a row that is not an object", () => {
    for (const junk of [null, undefined, "yes", 7, [], true]) {
      expect(normalizeLaunchPopup(junk)).toEqual(LAUNCH_POPUP_DEFAULT);
    }
  });

  it("defaults `seconds` rather than leaving a popup with no timer", () => {
    for (const bad of [undefined, null, "soon", Number.NaN, Infinity, -5, {}]) {
      expect(normalizeLaunchPopup({ enabled: true, seconds: bad }).seconds).toBe(
        LAUNCH_POPUP_DEFAULT.seconds,
      );
    }
  });

  it("keeps 0, which means 'stays until she closes it'", () => {
    expect(normalizeLaunchPopup({ seconds: 0 }).seconds).toBe(0);
  });

  it("reads a numeric string, and truncates to whole seconds", () => {
    expect(normalizeLaunchPopup({ seconds: "12" }).seconds).toBe(12);
    expect(normalizeLaunchPopup({ seconds: 8.9 }).seconds).toBe(8);
  });

  it("caps the duration", () => {
    expect(normalizeLaunchPopup({ seconds: 99999 }).seconds).toBe(LAUNCH_POPUP_MAX_SECONDS);
  });

  it("treats a blank or non-string image as no image", () => {
    expect(normalizeLaunchPopup({ imageUrl: "" }).imageUrl).toBeNull();
    expect(normalizeLaunchPopup({ imageUrl: "   " }).imageUrl).toBeNull();
    expect(normalizeLaunchPopup({ imageUrl: 42 }).imageUrl).toBeNull();
  });

  it("only enables on a literal true", () => {
    // A Json cell can hold "true" or 1 from a hand-written UPDATE. Neither is
    // an admin deciding to run a campaign.
    expect(normalizeLaunchPopup({ enabled: "true" }).enabled).toBe(false);
    expect(normalizeLaunchPopup({ enabled: 1 }).enabled).toBe(false);
    expect(normalizeLaunchPopup({ enabled: true }).enabled).toBe(true);
  });
});

describe("isLaunchPopupLive", () => {
  it("refuses a popup switched on before its artwork was uploaded", () => {
    expect(
      isLaunchPopupLive(normalizeLaunchPopup({ enabled: true, imageUrl: null, seconds: 8 })),
    ).toBe(false);
  });

  it("refuses artwork that is uploaded but not switched on", () => {
    expect(
      isLaunchPopupLive(
        normalizeLaunchPopup({ enabled: false, imageUrl: "/uploads/lumi9/x.gif", seconds: 8 }),
      ),
    ).toBe(false);
  });

  it("shows one that is both", () => {
    expect(
      isLaunchPopupLive(
        normalizeLaunchPopup({ enabled: true, imageUrl: "/uploads/lumi9/x.gif", seconds: 8 }),
      ),
    ).toBe(true);
  });
});
