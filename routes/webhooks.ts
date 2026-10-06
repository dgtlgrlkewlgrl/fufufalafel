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
    merchantAccountCode?: string;
    amount?: { value?: unknown; currency?: unknown };
    additionalData?: { hmacSignature?: unknown };
  };
}

/** Distinguishes unsigned deliveries from invalid signatures and payloads. */
function validateNotificationSignature(
  notification: NotificationRequestItem["NotificationRequestItem"],
  validator: hmacValidator,
  key: string,
): { status: 400 | 401; error: string } | undefined {
  const signature = notification.additionalData?.hmacSignature;
  if (typeof signature !== "string" || !signature.trim()) {
    logger.warn("webhook.hmac.missing", {
      pspReference: notification.pspReference,
    });
    return {
      status: 401,
      error:
        "Missing HMAC signature. Configure HMAC signing on the Adyen webhook.",
    };
  }

  try {
    if (!validator.validateHMAC(notification as never, key)) {
      logger.warn("webhook.hmac.invalid", {
        pspReference: notification.pspReference,
      });
      return { status: 401, error: "Invalid HMAC signature." };
    }
  } catch {
    logger.warn("webhook.payload.invalid", {
      pspReference: notification.pspReference,
    });
    return { status: 400, error: "Malformed notification item." };
  }
  return undefined;
}

/** Checks that a kitchen request can identify the order and payment amount. */
function hasKitchenTicketDetails(
  notification: NotificationRequestItem["NotificationRequestItem"],
): boolean {
  return (
    typeof notification.pspReference === "string" &&
    Boolean(notification.pspReference.trim()) &&
    typeof notification.merchantReference === "string" &&
    Boolean(notification.merchantReference.trim()) &&
    typeof notification.amount?.value === "number" &&
    Number.isSafeInteger(notification.amount.value) &&
    notification.amount.value > 0 &&
    typeof notification.amount.currency === "string" &&
    /^[A-Z]{3}$/.test(notification.amount.currency)
  );
}

/** Logs the verified payment event and the demo kitchen action it triggers. */
function processNotification(
  notification: NotificationRequestItem["NotificationRequestItem"],
  environment: AppConfig["environment"],
): void {
  logger.info("webhook.notification.accepted", {
    eventCode: notification.eventCode,
    success: notification.success,
    merchantReference: notification.merchantReference,
    pspReference: notification.pspReference,
  });

  if (
    notification.eventCode === "AUTHORISATION" &&
    notification.success === "true"
  ) {
    logger.info("kitchen.ticket.requested", {
      ticketId: `kitchen:${notification.pspReference}`,
      orderReference: notification.merchantReference,
      pspReference: notification.pspReference,
      amount: {
        value: notification.amount?.value,
        currency: notification.amount?.currency,
      },
      environment,
      source: "adyen.webhook",
    });
  }
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
    if (!config.hmacKey) {
      logger.warn("webhook.hmac.not_configured");
      res
        .status(503)
        .json({ error: "Webhook verification is not configured." });
      return;
    }

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

      const signatureError = validateNotificationSignature(
        notification,
        validator,
        config.hmacKey,
      );
      if (signatureError) {
        res.status(signatureError.status).json({ error: signatureError.error });
        return;
      }

      if (notification.merchantAccountCode !== config.merchantAccount) {
        res.status(403).json({ error: "Unexpected merchant account." });
        return;
      }

      if (
        notification.eventCode === "AUTHORISATION" &&
        notification.success === "true" &&
        !hasKitchenTicketDetails(notification)
      ) {
        res
          .status(400)
          .json({ error: "Missing kitchen ticket payment details." });
        return;
      }
    }

    for (const { NotificationRequestItem: notification } of items) {
      processNotification(notification, config.environment);
    }

    res.type("text/plain").send("[accepted]");
  });

  return router;
}
