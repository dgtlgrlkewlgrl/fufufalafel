import { CheckoutAPI, Client, EnvironmentEnum } from "@adyen/api-library";
/**
 * Creates the Adyen Checkout API client.
 * The API key is only ever held server-side; the browser receives the
 * public client key instead.
 */
export function createCheckoutApi(config) {
    const client = new Client({
        apiKey: config.apiKey,
        environment: EnvironmentEnum[config.environment],
        ...(config.liveUrlPrefix
            ? { liveEndpointUrlPrefix: config.liveUrlPrefix }
            : {}),
    });
    return new CheckoutAPI(client);
}
//# sourceMappingURL=client.js.map