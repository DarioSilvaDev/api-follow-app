/**
 * Tests for the Active Context store (F-020 / RF-3, D-020 A1).
 *
 * - Default PERSONAL (null).
 * - selectWorkshop activates WORKSHOP.
 * - clearWorkshop returns to PERSONAL.
 * - Subscriber notifications (useSyncExternalStore contract).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clearWorkshop,
  getActiveContext,
  selectWorkshop,
  subscribeActiveContext,
} from "@/lib/active-context";

describe("Active Context store (F-020 / RF-3)", () => {
  beforeEach(() => {
    clearWorkshop();
  });

  it("defaults to null (PERSONAL, no headers — D-035)", () => {
    expect(getActiveContext()).toBeNull();
  });

  it("selectWorkshop sets a WORKSHOP context with the workshop id", () => {
    selectWorkshop("w1");
    expect(getActiveContext()).toEqual({ type: "WORKSHOP", workshopId: "w1" });
  });

  it("clearWorkshop returns to PERSONAL (null)", () => {
    selectWorkshop("w1");
    clearWorkshop();
    expect(getActiveContext()).toBeNull();
  });

  it("is a no-op when already in the same workshop", () => {
    selectWorkshop("w1");
    const listener = vi.fn();
    subscribeActiveContext(listener);
    selectWorkshop("w1"); // same id → no emit
    expect(listener).not.toHaveBeenCalled();
  });

  it("emits on each distinct change (select then clear)", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveContext(listener);

    selectWorkshop("w1");
    expect(listener).toHaveBeenCalledTimes(1);

    selectWorkshop("w2"); // different id → emit
    expect(listener).toHaveBeenCalledTimes(2);

    clearWorkshop();
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it("cleans up on unsubscribe (no further notifications)", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveContext(listener);
    unsubscribe();

    selectWorkshop("w1");
    expect(listener).not.toHaveBeenCalled();
  });
});
