import { readFileSync } from "node:fs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { PaymentSessionService } from "../src/adyen/paymentSessionService.js";
import { ValidationError } from "../src/validation.js";

const config: AppConfig = {
  port: 8080,
  publicBaseUrl: "https://example.test",
  apiKey: "test-api-key",
  clientKey: "test_client_key",
  merchantAccount: "TestMerchantECOM",
  environment: "TEST",
};

function buildApp(overrides: Partial<PaymentSessionService> = {}) {
  const service: PaymentSessionService = {
    createSession: vi.fn(async () => ({
      id: "CS123",
      sessionData: "opaque-session-data",
      reference: "order-1",
      amount: { value: 1000, currency: "EUR" },
    })),
    getSessionResult: vi.fn(async () => ({
      status: "completed",
      reference: "order-1",
    })),
    ...overrides,
  };

  return { app: createApp(service, config), service };
}

describe("checkout routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes only public configuration", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/api/config").expect(200);

    expect(response.body).toEqual({
      clientKey: "test_client_key",
      environment: "TEST",
    });
    expect(JSON.stringify(response.body)).not.toContain("test-api-key");
  });

  it("creates a session and derives the return URL server-side", async () => {
    const { app, service } = buildApp();

    const response = await request(app)
      .post("/api/sessions")
      .send({
        amountValue: 1000,
        currency: "EUR",
        countryCode: "NL",
        returnUrl: "https://evil.test",
      })
      .expect(201);

    expect(response.body.id).toBe("CS123");
    expect(service.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ returnUrl: "https://example.test/result" }),
    );
  });

  it("rejects an invalid amount with 400", async () => {
    const { app, service } = buildApp();

    const response = await request(app)
      .post("/api/sessions")
      .send({ amountValue: -1, currency: "EUR", countryCode: "NL" })
      .expect(400);

    expect(response.body.field).toBe("amountValue");
    expect(service.createSession).not.toHaveBeenCalled();
  });

  it("hides provider errors behind a generic 502", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = buildApp({
      createSession: vi.fn(async () => {
        throw Object.assign(
          new Error("401 Unauthorized from Adyen with key test-api-key"),
          { statusCode: 401, errorCode: "010" },
        );
      }),
    });

    const response = await request(app)
      .post("/api/sessions")
      .send({ amountValue: 1000, currency: "EUR", countryCode: "NL" })
      .expect(502);

    expect(response.body).toEqual({
      error: "Payment provider request failed.",
    });

    const loggedError = JSON.parse(errorLog.mock.calls[0][0] as string);
    expect(loggedError.statusCode).toBe(401);
    expect(loggedError.errorCode).toBe("010");
    expect(loggedError.message).not.toContain("test-api-key");
  });

  it("requires sessionResult when resolving a session", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get("/api/sessions/CS123/result")
      .expect(400);
    expect(response.body.field).toBe("sessionResult");
  });

  it("returns the session result", async () => {
    const { app, service } = buildApp();

    const response = await request(app)
      .get("/api/sessions/CS123/result")
      .query({ sessionResult: "abc123" })
      .expect(200);

    expect(response.body).toEqual({
      status: "completed",
      reference: "order-1",
    });
    expect(service.getSessionResult).toHaveBeenCalledWith("CS123", "abc123");
  });

  it("reports health", async () => {
    const { app } = buildApp();
    await request(app)
      .get("/healthz")
      .expect(200, { status: "ok", environment: "TEST" });
  });

  it("requests a TEST reversal using only the session-result proof", async () => {
    const refundSession = vi.fn(async () => ({ status: "received" }));
    const { app } = buildApp({ refundSession });
    const response = await request(app)
      .post("/api/sessions/CS123/refund")
      .send({
        sessionResult: "verified-result",
        pspReference: "attacker-reference",
        amount: 999999,
      })
      .expect(202);
    expect(response.body).toEqual({ status: "received" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(refundSession).toHaveBeenCalledWith("CS123", "verified-result");
  });

  it.each([
    {},
    { sessionResult: " " },
    { sessionResult: 123 },
    { sessionResult: "x".repeat(20001) },
  ])("rejects invalid refund proof %#", async (body) => {
    const refundSession = vi.fn(async () => ({ status: "received" }));
    const { app } = buildApp({ refundSession });
    await request(app)
      .post("/api/sessions/CS123/refund")
      .send(body)
      .expect(400);
    expect(refundSession).not.toHaveBeenCalled();
  });

  it("rejects LIVE refund actions before contacting Adyen", async () => {
    const { service } = buildApp({
      refundSession: vi.fn(async () => ({ status: "received" })),
    });
    const app = createApp(service, { ...config, environment: "LIVE" });
    await request(app)
      .post("/api/sessions/CS123/refund")
      .send({ sessionResult: "abc" })
      .expect(403);
    expect(service.refundSession).not.toHaveBeenCalled();
  });

  it("rejects unverified refunds and hides provider errors", async () => {
    const refundSession = vi.fn(async () => {
      throw new ValidationError(
        "A verified completed payment is required.",
        "sessionResult",
      );
    });
    const { app } = buildApp({ refundSession });
    await request(app)
      .post("/api/sessions/CS123/refund")
      .send({ sessionResult: "abc" })
      .expect(400);
    vi.spyOn(console, "error").mockImplementation(() => {});
    refundSession.mockRejectedValueOnce(new Error("secret provider error"));
    const response = await request(app)
      .post("/api/sessions/CS123/refund")
      .send({ sessionResult: "abc" })
      .expect(502);
    expect(response.body.error).toBe("Payment provider request failed.");
  });

  it("preserves checkout routing and security headers on Vercel", async () => {
    const deployment = JSON.parse(
      readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
    );
    const { app } = buildApp();
    const response = await request(app).get("/").expect(200);

    expect(deployment.framework).toBe("express");
    expect(deployment.rewrites).toContainEqual({
      source: "/result",
      destination: "/result.html",
    });
    await request(app).get("/result.html").expect(200);

    const headers = deployment.headers.find(
      (rule: { source: string }) => rule.source === "/(.*)",
    ).headers;
    for (const header of headers) {
      const actual = response.headers[header.key.toLowerCase()];
      if (header.key === "Content-Security-Policy") {
        const expectedDirectives = header.value
          .split(";")
          .map((directive: string) => directive.trim());
        expect(actual.split(";")).toEqual(
          expect.arrayContaining(expectedDirectives),
        );
      } else {
        expect(actual).toBe(header.value);
      }
    }
  });

  it("returns 404 for unknown routes", async () => {
    const { app } = buildApp();
    await request(app).get("/api/does-not-exist").expect(404);
  });
});
