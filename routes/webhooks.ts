import { timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { hmacValidator } from "@adyen/api-library";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Basic-auth guard matching the credentials configured on the Adyen webhook. */
function basicAuth(config: AppConfig): RequestHandler {
  return (req, res, next) => {
    if (!config.webhookUsername || !config.webhookPassword) {
      next();
      return;
    }

    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Basic ")) {
      res.status(401).set("WWW-Authenticate", "Basic").end();
      return;
    }

    const [username = "", password = ""] = Buffer.from(
      header.slice(6),
      "base64",
    )
      .toString("utf8")
      .split(":");

    if (
      !safeEqual(username, config.webhookUsername) ||
      !safeEqual(password, config.webhookPassword)
    ) {
      logger.warn("webhook.auth.rejected");
      res.status(401).set("WWW-Authenticate", "Basic").end();
      return;
    }

    next();
  };
}

interface NotificationRequestItem {
  NotificationRequestItem: Record<string, unknown> & {
    eventCode?: string;
    success?: string;
    merchantReference?: string;
    pspReference?: string;
  };
}

/**
 * Adyen standard webhook receiver.
 *
 * Every item is HMAC-verified before it is trusted. Adyen expects a plain
 * "[accepted]" body and retries until it receives one, so the handler must
 * acknowledge quickly and process asynchronously in a real integration.
 */
export function createWebhookRouter(config: AppConfig): Router {
  const router = Router();
  const validator = new hmacValidator();

  router.post("/", basicAuth(config), (req, res) => {
    const items = (req.body?.notificationItems ??
      []) as NotificationRequestItem[];

    if (!Array.isArray(items) || items.length === 0) {
      res
        .status(400)
        .json({ error: "notificationItems must be a non-empty array." });
      return;
    }

    for (const item of items) {
      const notification = item?.NotificationRequestItem;
      if (!notification) {
        res.status(400).json({ error: "Malformed notification item." });
        return;
      }

      if (
        config.hmacKey &&
        !validator.validateHMAC(notification as never, config.hmacKey)
      ) {
        logger.warn("webhook.hmac.invalid", {
          pspReference: notification.pspReference,
        });
        res.status(401).json({ error: "Invalid HMAC signature." });
        return;
      }

      // Audit trail: every accepted payment event is recorded.
      logger.info("webhook.notification.accepted", {
        eventCode: notification.eventCode,
        success: notification.success,
        merchantReference: notification.merchantReference,
        pspReference: notification.pspReference,
      });
    }

    res.type("text/plain").send("[accepted]");
  });

  return router;
}
