import { ORDER_STORAGE_KEY, saveOrderResult } from "./order.js";

const chat = document.querySelector("#agentic-chat");
const menuPanel = document.querySelector("#agentic-menu");
const menuTitle = document.querySelector("#agentic-menu-title");
const extraFalafelOption = document.querySelector("#agentic-extra-falafel");
const extraFalafelRecommendation = extraFalafelOption.querySelector(
  ".topping-recommendation",
);
const promptSuggestions = document.querySelector(".agentic-suggestions");
const followupForm = document.querySelector("#agentic-followup-form");
const followupInput = document.querySelector("#agentic-followup-input");
const checkoutPanel = document.querySelector("#agentic-checkout");
const orderDescription = document.querySelector("#agentic-order-description");
const totalLabel = document.querySelector("#agentic-total");
const payButton = document.querySelector("#agentic-pay-button");
const confirmation = document.querySelector("#agentic-confirmation");
const confirmationTitle = document.querySelector("#agentic-confirmation-title");
const confirmationCopy = document.querySelector("#agentic-confirmation-copy");
const cardStatus = document.querySelector("#agentic-card-status");
const dropinContainer = document.querySelector("#agentic-dropin");
const SESSION_STORAGE_KEY = "adyen-test-session";

const meals = {
  bowl: {
    name: "Falafel Bowl",
    price: 1350,
    fit: "A hearty, balanced bowl with warm grains, greens, cucumber, and tomato.",
  },
  salad: {
    name: "Falafel Salad",
    price: 1250,
    fit: "The lightest, freshest pick: chopped greens, cucumber, tomato, and lemon.",
  },
  wrap: {
    name: "Falafel Wrap",
    price: 1250,
    fit: "A cozy, portable wrap with crunchy greens, pickles, and warm flatbread.",
  },
};

let selectedMeal = null;
let dropin = null;

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function addChatMessage(text, className) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${className}`;
  bubble.textContent = text;
  chat.append(bubble);
}

function currentTotal() {
  const toppings = [
    ...checkoutPanel.querySelectorAll('input[type="checkbox"]:checked'),
  ];
  return (
    selectedMeal.price +
    toppings.reduce(
      (total, topping) => total + Number(topping.dataset.price),
      0,
    )
  );
}

function updateCheckout() {
  if (!selectedMeal) return;
  const toppingNames = [
    ...checkoutPanel.querySelectorAll('input[type="checkbox"]:checked'),
  ].map((topping) => topping.dataset.name);
  orderDescription.textContent = toppingNames.length
    ? `${selectedMeal.name} with ${toppingNames.join(", ")}`
    : `${selectedMeal.name}, falafel included`;
  totalLabel.textContent = money(currentTotal());
}

function setExtraFalafelRecommendation(recommended) {
  extraFalafelOption.classList.toggle("is-recommended", recommended);
  extraFalafelRecommendation.hidden = !recommended;
}

function resetCardCheckout() {
  if (dropin) {
    dropin.unmount();
    dropin = null;
  }
  dropinContainer.replaceChildren();
  dropinContainer.hidden = true;
  payButton.hidden = false;
  cardStatus.textContent = "";
  cardStatus.dataset.tone = "";
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to start secure checkout.");
  }
  return body;
}

async function startCardCheckout() {
  payButton.disabled = true;
  cardStatus.textContent = "Creating secure checkout…";
  cardStatus.dataset.tone = "";

  try {
    const config = await readJson(await fetch("/api/config"));
    const toppings = [
      ...checkoutPanel.querySelectorAll('input[type="checkbox"]:checked'),
    ];
    const session = await readJson(
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountValue: currentTotal(),
          currency: "EUR",
          countryCode: "NL",
        }),
      }),
    );
    const orderSession = {
      ...session,
      countryCode: "NL",
      mealName: selectedMeal.name,
      toppings: toppings.map((topping) => topping.dataset.name),
    };

    sessionStorage.removeItem(ORDER_STORAGE_KEY);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(orderSession));
    const checkout = await window.AdyenWeb.AdyenCheckout({
      clientKey: config.clientKey,
      environment: config.environment.toLowerCase(),
      locale: "en-US",
      countryCode: orderSession.countryCode,
      amount: orderSession.amount,
      session: { id: orderSession.id, sessionData: orderSession.sessionData },
      onPaymentCompleted: (result) => {
        saveOrderResult(result, orderSession);
        window.location.assign("/result");
      },
      onPaymentFailed: (result) => {
        cardStatus.textContent = `Payment failed: ${result?.resultCode ?? "unknown"}`;
        cardStatus.dataset.tone = "error";
      },
      onError: (error) => {
        cardStatus.textContent = error.message ?? "Unexpected checkout error.";
        cardStatus.dataset.tone = "error";
      },
    });

    const { Dropin, Card } = window.AdyenWeb;
    dropinContainer.hidden = false;
    dropin = new Dropin(checkout, {
      paymentMethodComponents: [Card],
      showStoredPaymentMethods: false,
    }).mount(dropinContainer);
    cardStatus.textContent = "";
    payButton.hidden = true;
    dropinContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    cardStatus.textContent =
      error.message ?? "Unable to start secure checkout.";
    cardStatus.dataset.tone = "error";
    payButton.disabled = false;
  }
}

function getPromptMenu(prompt) {
  const text = prompt.toLowerCase();
  if (/gluten|wheat|celiac|coeliac/.test(text)) {
    return {
      ids: ["salad"],
      title: "Closest listed option (not allergy-verified)",
    };
  }
  if (/tomato/.test(text)) {
    return {
      ids: ["wrap"],
      title: "Closest listed option (ingredients unconfirmed)",
    };
  }
  if (/protein/.test(text)) {
    return { ids: Object.keys(meals), title: "Falafel in every meal" };
  }
  if (/allerg|intoleran/.test(text)) {
    return {
      ids: Object.keys(meals),
      title: "Menu options to check with the restaurant",
    };
  }
  if (/comfort|comforting|cozy|warm|hearty|filling/.test(text)) {
    return { ids: ["bowl", "wrap"], title: "Warm, filling options" };
  }
  if (/healthy|mediterranean|light|fresh|salad|green/.test(text)) {
    return {
      ids: ["salad", "bowl"],
      title: "Fresh Mediterranean-inspired options",
    };
  }
  return { ids: Object.keys(meals), title: "Falafel meals to explore" };
}

function getPromptReply(prompt) {
  if (/gluten|wheat|celiac|coeliac/.test(prompt)) {
    return "The Salad is listed without bread or grains, but the falafel recipe and kitchen cross-contact practices are not provided. I can’t confirm that any meal is gluten-free. Please check with the restaurant before ordering, especially for celiac disease or an allergy.";
  }
  if (/tomato|allerg/.test(prompt)) {
    return "Thanks for telling me. Tomato is listed in the Bowl and Salad. The Wrap description does not list tomato, but we cannot confirm every ingredient or prevent cross-contact, so I can’t call it safe for an allergy. Please confirm with the restaurant before ordering.";
  }
  if (/protein/.test(prompt)) {
    return "All three meals include falafel. Add extra falafel for €2.50 if you want more; nutrition facts and protein amounts aren’t available, so I can’t compare the meals by protein.";
  }
  if (/ingredient|what's in|what is in|falafel made/.test(prompt)) {
    return "The Bowl has falafel, warm grains, greens, cucumber, and tomato. The Salad has falafel, chopped greens, cucumber, tomato, and lemon. The Wrap has falafel, crunchy greens, pickles, and warm flatbread. The falafel recipe and full sauce ingredients are not listed.";
  }
  if (/offer|deal|bogo|buy one|get one|free/.test(prompt)) {
    return "There are no active offers configured right now, so I can’t apply a buy-one-get-one deal. You can still choose any falafel meal and add toppings.";
  }
  if (/comfort|comforting|cozy|warm|hearty|filling/.test(prompt)) {
    return "For something warm and filling, the Falafel Bowl comes with warm grains; the Wrap has warm flatbread and pickles. Choose either one below.";
  }
  if (/healthy|mediterranean|light|fresh|salad|green/.test(prompt)) {
    return "For a fresh Mediterranean-inspired meal, the Falafel Salad has chopped greens, cucumber, tomato, and lemon. The Bowl is heartier, with warm grains and vegetables. Every option includes falafel.";
  }
  return "I can answer questions about the listed ingredients and options, but detailed nutrition and preparation information isn’t available. Please check with the restaurant for anything not listed.";
}

function startOrder(prompt) {
  if (!prompt) return;

  promptSuggestions.hidden = true;
  followupForm.hidden = false;
  chat.replaceChildren();
  addChatMessage(prompt, "user");
  const normalizedPrompt = prompt.toLowerCase();
  setExtraFalafelRecommendation(/protein/.test(normalizedPrompt));
  const menuMatch = getPromptMenu(normalizedPrompt);
  addChatMessage(getPromptReply(normalizedPrompt), "assistant");
  menuTitle.textContent = menuMatch.title;
  menuPanel.querySelectorAll(".agentic-meal-card").forEach((card) => {
    const mealButton = card.querySelector(".agentic-select");
    if (!mealButton) {
      card.hidden = true;
      return;
    }
    const mealId = mealButton.dataset.meal;
    card.hidden = !menuMatch.ids.includes(mealId);
  });
  menuPanel.hidden = false;
  checkoutPanel.hidden = true;
  resetCardCheckout();
  confirmation.hidden = true;
  selectedMeal = null;
  payButton.disabled = true;
  document.querySelectorAll(".agentic-select").forEach((button) => {
    button.setAttribute("aria-pressed", "false");
    button.textContent = `Choose ${button.dataset.meal}`;
  });
}

document.querySelectorAll("[data-agentic-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    startOrder(button.dataset.agenticPrompt);
  });
});

followupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = followupInput.value.trim();
  if (!question) return;

  addChatMessage(question, "user");
  const normalizedQuestion = question.toLowerCase();
  if (/protein/.test(normalizedQuestion)) {
    setExtraFalafelRecommendation(true);
  }
  addChatMessage(getPromptReply(normalizedQuestion), "assistant");
  followupInput.value = "";
});

document.querySelectorAll(".agentic-select").forEach((button) => {
  button.addEventListener("click", () => {
    const mealId = button.dataset.meal;
    selectedMeal = meals[mealId];
    followupForm.hidden = true;
    document.querySelectorAll(".agentic-select").forEach((option) => {
      const active = option === button;
      option.setAttribute("aria-pressed", String(active));
      option.textContent = active
        ? "Selected"
        : `Choose ${option.dataset.meal}`;
    });
    checkoutPanel.hidden = false;
    resetCardCheckout();
    confirmation.hidden = true;
    payButton.disabled = true;
    document
      .querySelectorAll('input[name="agentic-payment"]')
      .forEach((input) => {
        input.checked = false;
      });
    checkoutPanel
      .querySelectorAll('input[type="checkbox"]')
      .forEach((input) => {
        input.checked = false;
      });
    updateCheckout();
    checkoutPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
});

checkoutPanel.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) updateCheckout();
  if (event.target.matches('input[name="agentic-payment"]')) {
    confirmation.hidden = true;
    resetCardCheckout();
    payButton.disabled = false;
    payButton.textContent =
      event.target.value === "card"
        ? "Continue to card checkout"
        : "Pay with agent · USDC";
  }
});

payButton.addEventListener("click", () => {
  if (!selectedMeal) return;
  const paymentType = document.querySelector(
    'input[name="agentic-payment"]:checked',
  )?.value;
  if (!paymentType) return;

  if (paymentType === "card") {
    void startCardCheckout();
    return;
  }

  confirmationTitle.textContent = `${selectedMeal.name} is ready.`;
  confirmationCopy.textContent = `${money(currentTotal())} · Pay with agent using USDC. This is a simulated confirmation; no wallet was connected and no payment was sent.`;
  confirmation.hidden = false;
  confirmation.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
