import { describe, it, expect } from "vitest";
import { resolvePlanIdFromSummary, type BillingPlanId } from "./types";

describe("resolvePlanIdFromSummary", () => {
  it("returns premium for premium plan_id", () => {
    expect(
      resolvePlanIdFromSummary({ plan_id: "premium" as BillingPlanId }),
    ).toBe("premium");
  });

  it("returns premium for Premium plan_name", () => {
    expect(resolvePlanIdFromSummary({ plan_name: "Premium" })).toBe(
      "premium",
    );
  });

  it("defaults to basic for unknown or free", () => {
    expect(resolvePlanIdFromSummary({ plan_id: "free" })).toBe("basic");
    expect(resolvePlanIdFromSummary({ plan_name: "free" })).toBe("basic");
    expect(resolvePlanIdFromSummary(null)).toBe("basic");
  });
});

