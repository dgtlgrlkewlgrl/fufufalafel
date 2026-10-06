import { hmacValidator } from "@adyen/api-library";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { PaymentSessionService } from "../src/adyen/paymentSessionService.js";

const HMAC_KEY =
  "11AB22CD33EF44AB55CD66EF77AB88CD99EF00AB11CD22EF33AB44CD55EF66AB";

const service: PaymentSessionService = {
  createSession: vi.fn(),
  getSessionResult: vi.fn(),
};

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 8080,
    publicBaseUrl: "https://example.test",
    apiKey: "test-api-key",
    clientKey: "test_client_key",
    merchantAccount: "TestMerchantECOM",
    environment: "TEST",
    hmacKey: HMAC_KEY,
    ...overrides,
  };
}

function notification(signature?: string) {
  const item = {
    pspReference: "PSP123456789",
    originalReference: "",
    merchantAccountCode: "TestMerchantECOM",
    merchantReference: "order-1",
    amount: { value: 1000, currency: "EUR" },
    eventCode: "AUTHORISATION",
    success: "true",
    eventDate: "2026-01-01T00:00:00+01:00",
    paymentMethod: "visa",
    additionalData: {} as Record<string, string>,
  };

  item.additionalData.hmacSignature =
    signature ?? new hmacValidator().calculateHmac(item as never, HMAC_KEY);

  return {
    live: "false",
    notificationItems: [{ NotificationRequestItem: item }],
  };
}

describe("webhook route", () => {
  it("accepts a correctly signed notification", async () => {
    const app = createApp(service, buildConfig());

    const response = await request(app)
      .post("/api/webhooks")
      .send(notification())
      .expect(200);

    expect(response.text).toBe("[accepted]");
  });

  it("rejects a tampered signature", async () => {
    const app = createApp(service, buildConfig());

    await request(app)
      .post("/api/webhooks")
      .send(notification("ZmFrZS1zaWduYXR1cmU="))
      .expect(401);
  });

  it("rejects an empty notification list", async () => {
    const app = createApp(service, buildConfig());
    await request(app)
      .post("/api/webhooks")
      .send({ notificationItems: [] })
      .expect(400);
  });

  it("requires basic auth when credentials are configured", async () => {
    const app = createApp(
      service,
      buildConfig({ webhookUsername: "adyen", webhookPassword: "secret" }),
    );

    await request(app).post("/api/webhooks").send(notification()).expect(401);

    await request(app)
      .post("/api/webhooks")
      .auth("adyen", "secret")
      .send(notification())
      .expect(200);
  });

  it("rejects wrong basic auth credentials", async () => {
    const app = createApp(
      service,
      buildConfig({ webhookUsername: "adyen", webhookPassword: "secret" }),
    );

    await request(app)
      .post("/api/webhooks")
      .auth("adyen", "wrong")
      .send(notification())
      .expect(401);
  });
});
