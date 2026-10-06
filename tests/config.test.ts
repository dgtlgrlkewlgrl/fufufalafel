import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const baseEnv = {
  ADYEN_API_KEY: "test-api-key",
  ADYEN_CLIENT_KEY: "test_client_key",
  ADYEN_MERCHANT_ACCOUNT: "TestMerchantECOM",
} as NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("defaults to the TEST environment and localhost base URL", () => {
    const config = loadConfig({ ...baseEnv });

    expect(config.environment).toBe("TEST");
    expect(config.port).toBe(8080);
    expect(config.publicBaseUrl).toBe("http://localhost:8080");
  });

  it.each(["ADYEN_API_KEY", "ADYEN_CLIENT_KEY", "ADYEN_MERCHANT_ACCOUNT"])(
    "throws when %s is missing",
    (key) => {
      const env = { ...baseEnv, [key]: "" };
      expect(() => loadConfig(env)).toThrow(new RegExp(key));
    },
  );

  it("rejects an unknown environment", () => {
    expect(() =>
      loadConfig({ ...baseEnv, ADYEN_ENVIRONMENT: "STAGING" }),
    ).toThrow(/TEST.*LIVE/);
  });

  it("requires a live URL prefix in LIVE mode", () => {
    expect(() => loadConfig({ ...baseEnv, ADYEN_ENVIRONMENT: "LIVE" })).toThrow(
      /ADYEN_LIVE_URL_PREFIX/,
    );
  });

  it("accepts LIVE mode with a prefix", () => {
    const config = loadConfig({
      ...baseEnv,
      ADYEN_ENVIRONMENT: "LIVE",
      ADYEN_LIVE_URL_PREFIX: "1797a841fbb37ca7-AdyenDemo",
    });

    expect(config.environment).toBe("LIVE");
    expect(config.liveUrlPrefix).toBe("1797a841fbb37ca7-AdyenDemo");
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ ...baseEnv, PORT: "0" })).toThrow(/PORT/);
  });

  it("strips trailing slashes from PUBLIC_BASE_URL", () => {
    const config = loadConfig({
      ...baseEnv,
      PUBLIC_BASE_URL: "https://example.test/",
    });
    expect(config.publicBaseUrl).toBe("https://example.test");
  });

  it("rejects a relative PUBLIC_BASE_URL", () => {
    expect(() =>
      loadConfig({ ...baseEnv, PUBLIC_BASE_URL: "/checkout" }),
    ).toThrow(/PUBLIC_BASE_URL/);
  });
});
