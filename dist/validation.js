const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const SHOPPER_REFERENCE_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;
/** Upper bound for the sandbox harness: 10 000.00 in minor units. */
const MAX_AMOUNT_MINOR_UNITS = 1_000_000;
export class ValidationError extends Error {
    field;
    constructor(message, field) {
        super(message);
        this.field = field;
        this.name = "ValidationError";
    }
}
/**
 * Validates and normalises the untrusted request body for POST /api/sessions.
 * Everything else (merchant account, return URL) is derived server-side so the
 * client cannot influence where funds are booked or where shoppers are sent.
 */
export function parseSessionRequest(body) {
    if (typeof body !== "object" || body === null) {
        throw new ValidationError("Request body must be a JSON object.", "body");
    }
    const { amountValue, currency, countryCode, shopperReference } = body;
    if (typeof amountValue !== "number" ||
        !Number.isInteger(amountValue) ||
        amountValue <= 0) {
        throw new ValidationError("amountValue must be a positive integer in minor units.", "amountValue");
    }
    if (amountValue > MAX_AMOUNT_MINOR_UNITS) {
        throw new ValidationError(`amountValue must not exceed ${MAX_AMOUNT_MINOR_UNITS}.`, "amountValue");
    }
    if (typeof currency !== "string" || !CURRENCY_PATTERN.test(currency)) {
        throw new ValidationError("currency must be a 3-letter uppercase ISO 4217 code.", "currency");
    }
    if (typeof countryCode !== "string" || !COUNTRY_PATTERN.test(countryCode)) {
        throw new ValidationError("countryCode must be a 2-letter uppercase ISO 3166-1 code.", "countryCode");
    }
    if (shopperReference !== undefined) {
        if (typeof shopperReference !== "string" ||
            !SHOPPER_REFERENCE_PATTERN.test(shopperReference)) {
            throw new ValidationError("shopperReference must be 3-64 characters of [A-Za-z0-9._-].", "shopperReference");
        }
    }
    return {
        amountValue,
        currency,
        countryCode,
        ...(shopperReference ? { shopperReference } : {}),
    };
}
//# sourceMappingURL=validation.js.map