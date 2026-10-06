import type { CheckoutAPI } from "@adyen/api-library";
import { describe, expect, it, vi } from "vitest";
import { AdyenSessionService } from "../src/adyen/paymentSessionService.js";
import type { AppConfig } from "../src/config.js";

const config: AppConfig = {
  port: 8080,
  publicBaseUrl: "https://example.test",
  apiKey: "test-api-key",
  clientKey: "test_client_key",
  merchantAccount: "TestMerchantECOM",
  environment: "TEST",
};

function stubCheckout(overrides: Record<string, unknown> = {}) {
  return {
    PaymentsApi: {
      sessions: vi.fn(async () => ({
        id: "CS123",
        sessionData: "opaque",
        reference: "order-generated",
        amount: { value: 1000, currency: "EUR" },
      })),
      getResultOfPaymentSession: vi.fn(async () => ({
        status: "completed",
        reference: "order-generated",
      })),
      ...overrides,
    },
  } as unknown as CheckoutAPI;
}

describe("AdyenSessionService", () => {
  it("sends the configured merchant account and a generated reference", async () => {
    const checkout = stubCheckout();
    const service = new AdyenSessionService(checkout, config);

    const session = await service.createSession({
      amountValue: 1000,
      currency: "EUR",
      countryCode: "NL",
      returnUrl: "https://example.test/result",
    });

    expect(session.id).toBe("CS123");
    expect(checkout.PaymentsApi.sessions).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantAccount: "TestMerchantECOM",
        amount: { value: 1000, currency: "EUR" },
        countryCode: "NL",
        returnUrl: "https://example.test/result",
        reference: expect.stringMatching(/^order-[0-9a-f-]{36}$/),
      }),
    );
  });

  it("generates a unique reference per session", async () => {
    const checkout = stubCheckout();
    const service = new AdyenSessionService(checkout, config);
    const input = {
      amountValue: 500,
      currency: "EUR",
      countryCode: "NL",
      returnUrl: "https://example.test/result",
    };

    await service.createSession(input);
    await service.createSession(input);

    const calls = vi.mocked(checkout.PaymentsApi.sessions).mock.calls;
    expect(calls[0]?.[0]?.reference).not.toBe(calls[1]?.[0]?.reference);
  });

  it("omits shopperReference when not provided", async () => {
    const checkout = stubCheckout();
    await new AdyenSessionService(checkout, config).createSession({
      amountValue: 500,
      currency: "EUR",
      countryCode: "NL",
      returnUrl: "https://example.test/result",
    });

    expect(
      vi.mocked(checkout.PaymentsApi.sessions).mock.calls[0]?.[0],
    ).not.toHaveProperty("shopperReference");
  });

  it("maps the session result", async () => {
    const checkout = stubCheckout();
    const result = await new AdyenSessionService(
      checkout,
      config,
    ).getSessionResult("CS123", "abc");

    expect(result).toEqual({
      status: "completed",
      reference: "order-generated",
    });
    expect(checkout.PaymentsApi.getResultOfPaymentSession).toHaveBeenCalledWith(
      "CS123",
      "abc",
    );
  });

  it("verifies the payment and requests an idempotent full reversal", async () => {
    const checkout = stubCheckout({
      getResultOfPaymentSession: vi.fn(async () => ({
        status: "completed",
        payments: [{ pspReference: "PSP123" }],
      })),
    });
    const reversal = vi.fn(async () => ({ status: "received" }));
    Object.assign(checkout, {
      ModificationsApi: { refundOrCancelPayment: reversal },
    });
    const service = new AdyenSessionService(checkout, config);
    expect(await service.refundSession("CS123", "verified-result")).toEqual({
      status: "received",
    });
    await service.refundSession("CS123", "verified-result");
    expect(checkout.PaymentsApi.getResultOfPaymentSession).toHaveBeenCalledWith(
      "CS123",
      "verified-result",
    );
    expect(reversal).toHaveBeenCalledWith(
      "PSP123",
      expect.objectContaining({ merchantAccount: "TestMerchantECOM" }),
      { idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/) },
    );
    expect(reversal.mock.calls[0]).toEqual(reversal.mock.calls[1]);
  });

  it("rejects unverified sessions and LIVE reversals", async () => {
    const checkout = stubCheckout();
    await expect(
      new AdyenSessionService(checkout, config).refundSession("CS123", "abc"),
    ).rejects.toThrow("verified completed payment");
    vi.mocked(checkout.PaymentsApi.getResultOfPaymentSession).mockClear();
    await expect(
      new AdyenSessionService(checkout, {
        ...config,
        environment: "LIVE",
      }).refundSession("CS123", "abc"),
    ).rejects.toThrow("only in TEST");
    expect(
      checkout.PaymentsApi.getResultOfPaymentSession,
    ).not.toHaveBeenCalled();
  });
});
