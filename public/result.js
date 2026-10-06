import { ORDER_STORAGE_KEY, saveOrderResult } from "./order.js";

const statusEl = document.querySelector("#status");
const heading = document.querySelector("#order-heading");
const refundButton = document.querySelector("#refund-button");
const refundStatus = document.querySelector("#refund-status");
const refundDialog = document.querySelector("#refund-dialog");
let order = null;

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function formatAmount(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: amount.currency,
  }).format(amount.value / 100);
}

function showSummary(order) {
  if (order.amount) {
    document.querySelector("#order-summary-panel").hidden = false;
    const reference =
      typeof order.reference === "string"
        ? order.reference.replace(/^order-/i, "")
        : "";
    const orderNumber = reference
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 12)
      .toUpperCase();
    const groupedOrderNumber =
      orderNumber.length > 6
        ? `${orderNumber.slice(0, 6)}-${orderNumber.slice(6)}`
        : orderNumber;
    document.querySelector("#receipt-order-number").hidden = !orderNumber;
    document.querySelector("#receipt-reference").textContent = orderNumber
      ? `FF-${groupedOrderNumber}`
      : "";
    document.querySelector("#receipt-meal").textContent =
      order.mealName || "Your falafel order";
    document.querySelector("#receipt-toppings").textContent = order.toppings
      ?.length
      ? order.toppings.join(", ")
      : "Falafel included";
    document.querySelector("#receipt-total").textContent = formatAmount(
      order.amount,
    );
  }
}

function showOrder(receipt) {
  order = receipt;
  const authorised = order.resultCode === "Authorised";
  heading.textContent = authorised ? "Order placed" : "Payment pending";
  setStatus(
    authorised
      ? "Thanks for your order."
      : "Your payment is still being confirmed.",
    authorised ? "success" : "",
  );
  showSummary(order);
  document.querySelector("#order-help").hidden = !authorised;
  if (window.location.search) window.history.replaceState(null, "", "/result");
  refundButton.disabled =
    !order.sessionResult || Boolean(order.refundRequested);
  document.querySelector("#payment-result").textContent =
    order.resultCode || "Unknown";
  document.querySelector("#payment-session-id").textContent =
    order.sessionId || "Unavailable";
  document.querySelector("#payment-refund-status").textContent =
    order.refundStatus === "received"
      ? "Received by Adyen; processing"
      : order.refundStatus || "Not requested";
  refundStatus.textContent = "";
  if (order.refundRequested) {
    refundStatus.textContent =
      "Your refund or cancellation is being processed.";
  } else if (!order.sessionResult && authorised) {
    refundStatus.textContent =
      "A verified payment result is needed before requesting a refund.";
  }
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body.error || "Unable to process this request. Please try again.",
    );
  return body;
}

async function resolveSessionResult(session, sessionId, sessionResult) {
  const result = await readJson(
    await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/result?sessionResult=${encodeURIComponent(sessionResult)}`,
    ),
  );
  if (result.status !== "completed" && result.status !== "paymentPending") {
    heading.textContent = "Order not placed";
    setStatus("Your payment was not completed. Please try again.", "error");
    return;
  }
  showOrder(
    saveOrderResult(
      {
        resultCode: result.status === "completed" ? "Authorised" : "Pending",
        sessionResult,
      },
      {
        ...(session?.id === sessionId ? session : {}),
        id: sessionId,
        reference: result.reference,
      },
    ),
  );
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("sessionId");
  const sessionResult = params.get("sessionResult");
  const redirectResult = params.get("redirectResult");
  try {
    const session = JSON.parse(
      sessionStorage.getItem("adyen-test-session") || "null",
    );
    if (sessionId && sessionResult) {
      await resolveSessionResult(session, sessionId, sessionResult);
    } else if (redirectResult) {
      if (!session || (sessionId && session.id !== sessionId))
        throw new Error(
          "Start checkout again in the browser where you placed the order.",
        );
      const config = await readJson(await fetch("/api/config"));
      const checkout = await window.AdyenWeb.AdyenCheckout({
        clientKey: config.clientKey,
        environment: config.environment.toLowerCase(),
        countryCode: session.countryCode,
        amount: session.amount,
        session: { id: session.id, sessionData: session.sessionData },
        onPaymentCompleted: (result) =>
          showOrder(saveOrderResult(result, session)),
        onPaymentFailed: () => {
          heading.textContent = "Order not placed";
          setStatus(
            "Your payment was not completed. Please try again.",
            "error",
          );
        },
        onError: () =>
          setStatus("Unable to confirm payment. Please try again.", "error"),
      });
      await checkout.submitDetails({ details: { redirectResult } });
    } else {
      const receipt = JSON.parse(
        sessionStorage.getItem(ORDER_STORAGE_KEY) || "null",
      );
      if (!receipt) {
        heading.textContent = "No order found";
        setStatus("Choose a meal from the menu to place an order.");
        return;
      }
      showOrder(receipt);
    }
  } catch (error) {
    heading.textContent = "Unable to confirm your order";
    setStatus(error.message, "error");
  }
}

refundButton.addEventListener("click", () => {
  document.querySelector("#refund-amount").textContent = order.amount
    ? `Full amount: ${formatAmount(order.amount)}.`
    : "Request a full refund.";
  refundDialog.showModal();
});
document
  .querySelector("#refund-cancel")
  .addEventListener("click", () => refundDialog.close());
document
  .querySelector("#refund-confirm")
  .addEventListener("click", async () => {
    if (!order?.sessionResult || order.refundRequested || refundButton.disabled)
      return;
    refundDialog.close();
    refundButton.disabled = true;
    refundStatus.textContent = "Requesting your refund…";
    try {
      const config = await readJson(await fetch("/api/config"));
      if (config.environment !== "TEST")
        throw new Error("Demo refunds are available only in TEST.");
      const result = await readJson(
        await fetch(
          `/api/sessions/${encodeURIComponent(order.sessionId)}/refund`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionResult: order.sessionResult }),
          },
        ),
      );
      if (result.status !== "received")
        throw new Error(
          "The refund request was not accepted. Please try again.",
        );
      order.refundRequested = true;
      order.refundStatus = result.status;
      sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
      showOrder(order);
    } catch (error) {
      refundStatus.textContent = error.message;
      refundButton.disabled = false;
    }
  });
await main();
