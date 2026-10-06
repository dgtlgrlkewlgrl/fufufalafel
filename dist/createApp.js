import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import * as helmet from "helmet";
import { createCheckoutRouter } from "./routes/checkout.js";
import { createWebhookRouter } from "./routes/webhooks.js";
import { logger } from "./logger.js";
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
/** Origins the Adyen Web Drop-in needs for its script, styles, images and 3-D Secure iframes. */
const ADYEN_ORIGINS = [
    "https://checkoutshopper-test.adyen.com",
    "https://checkoutshopper-test.cdn.adyen.com",
    "https://checkoutshopper-live.adyen.com",
    "https://checkoutshopper-live.cdn.adyen.com",
];
const ADYEN_ANALYTICS_ORIGINS = [
    "https://checkoutanalytics-test.adyen.com",
    "https://checkoutanalytics-live.adyen.com",
];
function getErrorDetails(error) {
    if (!error || typeof error !== "object") {
        return { name: "UnknownError" };
    }
    const details = error;
    const message = typeof details.message === "string"
        ? details.message
            .replace(/\b(api[-_ ]?key|client[-_ ]?key|authorization|password|token)\b\s*[:=]?\s*[^\s,;]+/gi, "$1=[REDACTED]")
            .replace(/\bkey\s+[^\s,;]+/gi, "key [REDACTED]")
            .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[REDACTED]")
            .slice(0, 500)
        : undefined;
    return {
        ...(typeof details.name === "string" ? { name: details.name } : {}),
        ...(message ? { message } : {}),
        ...(typeof details.statusCode === "number"
            ? { statusCode: details.statusCode }
            : {}),
        ...(typeof details.errorCode === "string"
            ? { errorCode: details.errorCode }
            : {}),
    };
}
/**
 * Builds the Express application. Kept separate from server start-up so
 * integration tests can mount it without binding a port.
 */
export function createApp(service, config) {
    const app = express();
    app.disable("x-powered-by");
    app.use(helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", ...ADYEN_ORIGINS],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                ...ADYEN_ORIGINS,
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https://images.unsplash.com",
                ...ADYEN_ORIGINS,
            ],
            fontSrc: [
                "'self'",
                "data:",
                "https://fonts.gstatic.com",
                ...ADYEN_ORIGINS,
            ],
            connectSrc: ["'self'", ...ADYEN_ORIGINS, ...ADYEN_ANALYTICS_ORIGINS],
            frameSrc: ["'self'", ...ADYEN_ORIGINS],
        },
    }), helmet.crossOriginOpenerPolicy(), helmet.crossOriginResourcePolicy(), helmet.originAgentCluster(), helmet.referrerPolicy(), helmet.strictTransportSecurity(), helmet.xContentTypeOptions(), helmet.xDnsPrefetchControl(), helmet.xDownloadOptions(), helmet.xFrameOptions(), helmet.xPermittedCrossDomainPolicies(), helmet.xPoweredBy(), helmet.xXssProtection());
    // Body size is capped to blunt trivial payload-flood attempts.
    app.use(express.json({ limit: "100kb" }));
    app.get("/healthz", (_req, res) => {
        res.json({ status: "ok", environment: config.environment });
    });
    app.use("/api", createCheckoutRouter(service, config));
    app.use("/api/webhooks", createWebhookRouter(config));
    app.use(express.static(PUBLIC_DIR, { index: "index.html" }));
    app.get("/result", (_req, res) => {
        res.sendFile(join(PUBLIC_DIR, "result.html"));
    });
    app.use((_req, res) => {
        res.status(404).json({ error: "Not found." });
    });
    // Central error handler: logs details, returns a generic message so that
    // Adyen/internal error text never reaches the browser.
    app.use((error, _req, res, _next) => {
        logger.error("request.failed", getErrorDetails(error));
        res.status(502).json({ error: "Payment provider request failed." });
    });
    return app;
}
//# sourceMappingURL=createApp.js.map