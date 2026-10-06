import type { Express } from "express";
import { createApp } from "./createApp.js";
import { createCheckoutApi } from "./adyen/client.js";
import { AdyenSessionService } from "./adyen/paymentSessionService.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

function main(): Express {
  try {
    const config = loadConfig();
    const service = new AdyenSessionService(createCheckoutApi(config), config);
    const app = createApp(service, config);

    if (!process.env.VERCEL) {
      app.listen(config.port, () => {
        logger.info("server.started", {
          port: config.port,
          environment: config.environment,
          baseUrl: config.publicBaseUrl,
        });
      });
    }
    return app;
  } catch (error) {
    logger.error("server.start.failed", { message: (error as Error).message });
    throw error;
  }
}

export default main();
