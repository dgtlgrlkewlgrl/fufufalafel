/**
 * Front end for the Adyen Sessions + Drop-in flow.
 *
 * 1. POST /api/sessions   -> the server creates the session with its secret API key
 * 2. AdyenCheckout(...)   -> the browser only ever sees the public client key
 * 3. Drop-in handles card entry, 3-D Secure and redirects
 */
import { ORDER_STORAGE_KEY, saveOrderResult } from "./order.js";

const statusEl = document.querySelector("#status");
const formEl = document.querySelector("#session-form");
const containerEl = document.querySelector("#dropin-container");
const submitEl = formEl.querySelector("button");
const checkoutPanel = document.querySelector("#checkout-panel");
const stablecoinPreview = document.querySelector("#stablecoin-preview");
const stablecoinAmount = document.querySelector("#stablecoin-amount");
const orderTotal = document.querySelector("#order-total");
const orderSummary = document.querySelector("#order-summary");
const agentNote = document.querySelector("#agent-note");
const SESSION_STORAGE_KEY = "adyen-test-session";

let dropin = null;

function selectedProduct() {
  return formEl.querySelector('input[name="product"]:checked');
}

function formatAmount(amountValue) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
  }).format(amountValue / 100);
}

function updateOrderTotal() {
  const toppings = [
    ...formEl.querySelectorAll('input[name="topping"]:checked'),
  ];
  const toppingTotal = toppings.reduce(
    (sum, topping) => sum + Number.parseInt(topping.dataset.price, 10),
    0,
  );
  const total =
    Number.parseInt(selectedProduct().dataset.amount, 10) + toppingTotal;
  orderTotal.textContent = formatAmount(total);
  const toppingNames = toppings.map((topping) => topping.dataset.name);
  orderSummary.textContent = toppingNames.length
    ? `Falafel is included. Added: ${toppingNames.join(", ")}.`
    : "Falafel is included. Add any toppings you like.";
  return total;
}

const query = new URLSearchParams(window.location.search);
const requestedProduct = query.get("product");
const agentCheckout = query.get("agentCheckout") === "1";
let agentCheckoutOrder = null;
if (agentCheckout) {
  try {
    agentCheckoutOrder = JSON.parse(
      sessionStorage.getItem("agentic-card-order") ?? "null",
    );
  } catch {
    agentCheckoutOrder = null;
  }
}
if (requestedProduct) {
  const productOption = [
    ...formEl.querySelectorAll('input[name="product"]'),
  ].find((option) => option.value === requestedProduct);
  if (productOption) productOption.checked = true;
}
if (agentCheckoutOrder && typeof agentCheckoutOrder.mealId === "string") {
  const productOption = [
    ...formEl.querySelectorAll('input[name="product"]'),
  ].find((option) => option.value === agentCheckoutOrder.mealId);
  if (productOption) productOption.checked = true;

  const selectedToppings = new Set(
    Array.isArray(agentCheckoutOrder.toppings)
      ? agentCheckoutOrder.toppings
      : [],
  );
  formEl.querySelectorAll('input[name="topping"]').forEach((topping) => {
    topping.checked = selectedToppings.has(topping.value);
  });
} else if (agentCheckout || query.get("agent") === "1") {
  agentNote.hidden = false;
}
updateOrderTotal();

formEl.addEventListener("change", (event) => {
  if (event.target.matches('input[name="product"], input[name="topping"]')) {
    updateOrderTotal();
  }
});

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request to ${url} failed with status ${response.status}`,
    );
  }
  return body;
}

async function mountDropin({ clientKey, environment, session }) {
  if (dropin) {
    dropin.unmount();
    containerEl.replaceChildren();
  }
  stablecoinPreview.hidden = true;
  containerEl.hidden = false;

  const { AdyenCheckout, Dropin, Card } = window.AdyenWeb;

  const checkout = await AdyenCheckout({
    clientKey,
    environment: environment.toLowerCase(),
    locale: "en-US",
    translations: {
      "en-US": { payButton: "Order", "payButton.amount": "Order %{amount}" },
    },
    countryCode: session.countryCode,
    amount: session.amount,
    session: { id: session.id, sessionData: session.sessionData },
    onPaymentCompleted: (result) => {
      saveOrderResult(result, session);
      window.location.assign("/result");
    },
    onPaymentFailed: (result) => {
      setStatus(`Payment failed: ${result?.resultCode ?? "unknown"}`, "error");
    },
    onError: (error) => {
      setStatus(error.message ?? "Unexpected Drop-in error.", "error");
    },
  });

  dropin = new Dropin(checkout, {
    paymentMethodComponents: [Card],
    showStoredPaymentMethods: false,
  }).mount(containerEl);
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitEl.disabled = true;
  checkoutPanel.hidden = false;
  checkoutPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const product = selectedProduct();
    const amountValue = updateOrderTotal();
    const paymentType = formEl.querySelector(
      'input[name="payment-type"]:checked',
    ).value;

    if (paymentType === "stablecoin") {
      containerEl.hidden = true;
      stablecoinPreview.hidden = false;
      stablecoinAmount.textContent = `${product.dataset.name}: ${formatAmount(amountValue)}.`;
      setStatus(
        "Stablecoin wallet connection is not configured. No payment has been made.",
      );
      return;
    }

    setStatus("Creating secure checkout…");
    const config = await fetch("/api/config").then((r) => r.json());
    const countryCode = "NL";

    const session = await postJson("/api/sessions", {
      amountValue,
      currency: "EUR",
      countryCode,
    });

    setStatus("");
    sessionStorage.removeItem(ORDER_STORAGE_KEY);
    const orderSession = {
      ...session,
      countryCode,
      mealName: product.dataset.name,
      toppings: [
        ...formEl.querySelectorAll('input[name="topping"]:checked'),
      ].map((topping) => topping.dataset.name),
    };
    // The return page needs the session to finish redirect-based payments.
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(orderSession));
    await mountDropin({ ...config, session: orderSession });
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    submitEl.disabled = false;
  }
});

if (agentCheckout && agentCheckoutOrder) {
  sessionStorage.removeItem("agentic-card-order");
  checkoutPanel.hidden = false;
  setStatus("Creating your secure card checkout…");
  formEl.requestSubmit();
}
