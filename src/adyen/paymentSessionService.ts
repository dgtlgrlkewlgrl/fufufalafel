import { createHash, randomUUID } from "node:crypto";
import type { CheckoutAPI } from "@adyen/api-library";
import type { AppConfig } from "../config.js";
import { ValidationError } from "../validation.js";

export interface CreateSessionInput {
  /** Minor units, e.g. 1000 == EUR 10.00 */
  amountValue: number;
  currency: string;
  countryCode: string;
  /** Absolute URL the shopper is redirected back to after payment. */
  returnUrl: string;
  shopperReference?: string;
}

export interface SessionSummary {
  id: string;
  sessionData: string;
  reference: string;
  amount: { value: number; currency: string };
  expiresAt?: string;
}

export interface PaymentSessionService {
  createSession(input: CreateSessionInput): Promise<SessionSummary>;
  getSessionResult(
    sessionId: string,
    sessionResult: string,
  ): Promise<{ status: string; reference?: string }>;
  refundSession?(
    sessionId: string,
    sessionResult: string,
  ): Promise<{ status: string }>;
}

/**
 * Thin wrapper around the Adyen Checkout "Sessions" flow.
 * Sessions is the recommended integration: one server call creates the
 * session and the Drop-in component handles every subsequent step.
 */
export class AdyenSessionService implements PaymentSessionService {
  constructor(
    private readonly checkout: CheckoutAPI,
    private readonly config: AppConfig,
  ) {}

  async createSession(input: CreateSessionInput): Promise<SessionSummary> {
    const reference = `order-${randomUUID()}`;

    const response = await this.checkout.PaymentsApi.sessions({
      merchantAccount: this.config.merchantAccount,
      amount: { value: input.amountValue, currency: input.currency },
      countryCode: input.countryCode,
      reference,
      returnUrl: input.returnUrl,
      ...(input.shopperReference
        ? { shopperReference: input.shopperReference }
        : {}),
    });

    return {
      id: response.id,
      sessionData: response.sessionData ?? "",
      reference: response.reference,
      amount: {
        value: Number(response.amount.value),
        currency: response.amount.currency,
      },
      expiresAt: response.expiresAt?.toString(),
    };
  }

  async getSessionResult(sessionId: string, sessionResult: string) {
    const response = await this.checkout.PaymentsApi.getResultOfPaymentSession(
      sessionId,
      sessionResult,
    );
    return {
      status: String(response.status),
      reference: response.reference,
    };
  }

  /** Verifies session ownership before requesting an idempotent TEST reversal. */
  async refundSession(sessionId: string, sessionResult: string) {
    if (this.config.environment !== "TEST") {
      throw new ValidationError(
        "Demo refunds are available only in TEST.",
        "refund",
      );
    }
    const result = await this.checkout.PaymentsApi.getResultOfPaymentSession(
      sessionId,
      sessionResult,
    );
    const payment = result.payments?.[0];
    if (
      result.status !== "completed" ||
      result.payments?.length !== 1 ||
      !payment?.pspReference
    ) {
      throw new ValidationError(
        "A verified completed payment is required.",
        "sessionResult",
      );
    }
    const idempotencyKey = createHash("sha256")
      .update(
        `demo-refund:${this.config.merchantAccount}:${payment.pspReference}`,
      )
      .digest("hex");
    const response = await this.checkout.ModificationsApi.refundOrCancelPayment(
      payment.pspReference,
      {
        merchantAccount: this.config.merchantAccount,
        reference: `refund-${idempotencyKey.slice(0, 32)}`,
      },
      { idempotencyKey },
    );
    return { status: String(response.status) };
  }
}
