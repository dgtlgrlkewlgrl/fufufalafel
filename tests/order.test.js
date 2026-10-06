import { afterEach, expect, it, vi } from "vitest";
import { ORDER_STORAGE_KEY, saveOrderResult } from "../public/order.js";

afterEach(() => vi.unstubAllGlobals());

it("stores the completed order and refund proof without card or session data", () => {
  const setItem = vi.fn();
  vi.stubGlobal("sessionStorage", { setItem });
  const order = saveOrderResult(
    { resultCode: "Authorised", sessionResult: "opaque-proof" },
    {
      id: "CS123",
      sessionData: "private-session-data",
      reference: "order-123",
      amount: { value: 1425, currency: "EUR" },
      mealName: "Falafel Bowl",
      toppings: ["Tahini"],
    },
  );
  expect(order).toEqual({
    sessionId: "CS123",
    sessionResult: "opaque-proof",
    resultCode: "Authorised",
    reference: "order-123",
    amount: { value: 1425, currency: "EUR" },
    mealName: "Falafel Bowl",
    toppings: ["Tahini"],
  });
  expect(setItem).toHaveBeenCalledWith(ORDER_STORAGE_KEY, JSON.stringify(order));
  expect(JSON.stringify(order)).not.toContain("private-session-data");
});

it("preserves pending status and does not invent a refund proof", () => {
  vi.stubGlobal("sessionStorage", { setItem: vi.fn() });
  const order = saveOrderResult({ resultCode: "Pending" }, { id: "CS123" });
  expect(order.resultCode).toBe("Pending");
  expect(order.sessionResult).toBeNull();
  expect(order.toppings).toEqual([]);
});

it("does not silently ignore receipt storage failures", () => {
  vi.stubGlobal("sessionStorage", {
    setItem: vi.fn(() => { throw new Error("Storage unavailable"); }),
  });
  expect(() => saveOrderResult({ resultCode: "Authorised" }, { id: "CS123" }))
    .toThrow("Storage unavailable");
});