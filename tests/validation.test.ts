import { describe, expect, it } from "vitest";
import { ValidationError, parseSessionRequest } from "../src/validation.js";

const valid = { amountValue: 1000, currency: "EUR", countryCode: "NL" };

describe("parseSessionRequest", () => {
  it("accepts a valid payload", () => {
    expect(parseSessionRequest(valid)).toEqual(valid);
  });

  it("keeps a valid shopperReference", () => {
    const parsed = parseSessionRequest({
      ...valid,
      shopperReference: "shopper-001",
    });
    expect(parsed.shopperReference).toBe("shopper-001");
  });

  it("drops an absent shopperReference", () => {
    expect(parseSessionRequest(valid)).not.toHaveProperty("shopperReference");
  });

  it.each([null, "string", 42])("rejects non-object body %p", (body) => {
    expect(() => parseSessionRequest(body)).toThrow(ValidationError);
  });

  it.each([0, -100, 10.5, "1000", 1_000_001])(
    "rejects amountValue %p",
    (amountValue) => {
      expect(() => parseSessionRequest({ ...valid, amountValue })).toThrow(
        /amountValue/,
      );
    },
  );

  it.each(["eur", "EURO", "E1R", ""])("rejects currency %p", (currency) => {
    expect(() => parseSessionRequest({ ...valid, currency })).toThrow(
      /currency/,
    );
  });

  it.each(["nl", "NLD", ""])("rejects countryCode %p", (countryCode) => {
    expect(() => parseSessionRequest({ ...valid, countryCode })).toThrow(
      /countryCode/,
    );
  });

  it("rejects an injection-style shopperReference", () => {
    expect(() =>
      parseSessionRequest({ ...valid, shopperReference: "<script>x</script>" }),
    ).toThrow(/shopperReference/);
  });

  it("exposes the offending field name", () => {
    try {
      parseSessionRequest({ ...valid, currency: "eur" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ValidationError).field).toBe("currency");
    }
  });
});
