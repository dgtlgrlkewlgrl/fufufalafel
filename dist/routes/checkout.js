import { Router } from "express";
import { logger } from "../logger.js";
import { ValidationError, parseSessionRequest } from "../validation.js";
/**
 * Checkout endpoints backing the Drop-in front end.
 *
 * GET  /api/config   - public client configuration (no secrets)
 * POST /api/sessions - creates an Adyen Checkout session
 * GET  /api/sessions/:id/result - resolves the outcome after redirect
 */
export function createCheckoutRouter(service, config) {
    const router = Router();
    router.get("/config", (_req, res) => {
        res.json({
            clientKey: config.clientKey,
            environment: config.environment,
        });
    });
    router.post("/sessions", async (req, res, next) => {
        try {
            const input = parseSessionRequest(req.body);
            const session = await service.createSession({
                ...input,
                returnUrl: `${config.publicBaseUrl}/result`,
            });
            logger.info("checkout.session.created", {
                sessionId: session.id,
                reference: session.reference,
                amount: session.amount.value,
                currency: session.amount.currency,
            });
            res.status(201).json(session);
        }
        catch (error) {
            if (error instanceof ValidationError) {
                res.status(400).json({ error: error.message, field: error.field });
                return;
            }
            next(error);
        }
    });
    router.get("/sessions/:id/result", async (req, res, next) => {
        const sessionId = req.params.id;
        const sessionResult = req.query.sessionResult;
        if (typeof sessionResult !== "string" || sessionResult.length === 0) {
            res.status(400).json({
                error: "sessionResult query parameter is required.",
                field: "sessionResult",
            });
            return;
        }
        try {
            const result = await service.getSessionResult(sessionId, sessionResult);
            logger.info("checkout.session.result", {
                sessionId,
                status: result.status,
            });
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/sessions/:id/refund", async (req, res, next) => {
        res.set("Cache-Control", "no-store");
        if (config.environment !== "TEST" || !service.refundSession) {
            res
                .status(403)
                .json({ error: "Demo refunds are available only in TEST." });
            return;
        }
        const sessionResult = req.body?.sessionResult;
        if (typeof sessionResult !== "string" ||
            !sessionResult.trim() ||
            sessionResult.length > 20000) {
            res.status(400).json({ error: "A valid session result is required." });
            return;
        }
        try {
            const result = await service.refundSession(req.params.id, sessionResult);
            logger.info("checkout.refund.requested", {
                sessionId: req.params.id,
                status: result.status,
            });
            res.status(202).json(result);
        }
        catch (error) {
            if (error instanceof ValidationError) {
                res.status(400).json({ error: error.message });
                return;
            }
            next(error);
        }
    });
    return router;
}
//# sourceMappingURL=checkout.js.map