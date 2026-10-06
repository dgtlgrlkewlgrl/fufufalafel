import { createHash, randomUUID } from "node:crypto";
import { ValidationError } from "../validation.js";
/**
 * Thin wrapper around the Adyen Checkout "Sessions" flow.
 * Sessions is the recommended integration: one server call creates the
 * session and the Drop-in component handles every subsequent step.
 */
export class AdyenSessionService {
    checkout;
    config;
    constructor(checkout, config) {
        this.checkout = checkout;
        this.config = config;
    }
    async createSession(input) {
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
    async getSessionResult(sessionId, sessionResult) {
        const response = await this.checkout.PaymentsApi.getResultOfPaymentSession(sessionId, sessionResult);
        return {
            status: String(response.status),
            reference: response.reference,
        };
    }
    /** Verifies session ownership before requesting an idempotent TEST reversal. */
    async refundSession(sessionId, sessionResult) {
        if (this.config.environment !== "TEST") {
            throw new ValidationError("Demo refunds are available only in TEST.", "refund");
        }
        const result = await this.checkout.PaymentsApi.getResultOfPaymentSession(sessionId, sessionResult);
        const payment = result.payments?.[0];
        if (result.status !== "completed" ||
            result.payments?.length !== 1 ||
            !payment?.pspReference) {
            throw new ValidationError("A verified completed payment is required.", "sessionResult");
        }
        const idempotencyKey = createHash("sha256")
            .update(`demo-refund:${this.config.merchantAccount}:${payment.pspReference}`)
            .digest("hex");
        const response = await this.checkout.ModificationsApi.refundOrCancelPayment(payment.pspReference, {
            merchantAccount: this.config.merchantAccount,
            reference: `refund-${idempotencyKey.slice(0, 32)}`,
        }, { idempotencyKey });
        return { status: String(response.status) };
    }
}
//# sourceMappingURL=paymentSessionService.js.map