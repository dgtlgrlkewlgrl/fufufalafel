const form = document.querySelector("#agent-form");
const promptInput = document.querySelector("#agent-prompt");
const conversation = document.querySelector("#agent-conversation");
const result = document.querySelector("#agent-result");
const recommendation = document.querySelector("#agent-recommendation");
const answerTitle = document.querySelector("#agent-answer-title");
const answerText = document.querySelector("#agent-answer");
const dishName = document.querySelector("#agent-dish-name");
const ingredients = document.querySelector("#agent-ingredients");
const allergenNote = document.querySelector("#agent-allergen-note");
const price = document.querySelector("#agent-price");
const checkoutLink = document.querySelector("#agent-checkout");

const menu = {
  bowl: {
    name: "Falafel Bowl",
    price: "€13.50",
    ingredients: "Falafel, warm grains, greens, cucumber, and tomato.",
  },
  salad: {
    name: "Falafel Salad",
    price: "€12.50",
    ingredients: "Falafel, chopped greens, cucumber, tomato, and lemon.",
  },
  wrap: {
    name: "Falafel Wrap",
    price: "€12.50",
    ingredients: "Falafel, crunchy greens, pickles, and warm flatbread.",
  },
};

function showRecommendation(productId, title, explanation, caution = "") {
  const item = menu[productId];
  answerTitle.textContent = title;
  answerText.textContent = explanation;
  dishName.textContent = item.name;
  ingredients.textContent = item.ingredients;
  allergenNote.textContent = caution;
  allergenNote.hidden = !caution;
  price.textContent = item.price;
  checkoutLink.href = `/?product=${productId}&agent=1#menu`;
  recommendation.hidden = false;
}

function answerPrompt(prompt) {
  const text = prompt.toLowerCase();
  recommendation.hidden = true;

  if (/gluten|wheat|celiac|coeliac/.test(text)) {
    showRecommendation(
      "salad",
      "Falafel Salad is listed without bread or grains.",
      "The salad base includes falafel, chopped greens, cucumber, tomato, and lemon.",
      "We cannot confirm ingredients in the falafel or preparation practices, including cross-contact. If you have celiac disease or an allergy, check with the restaurant before ordering.",
    );
    return "The salad is listed without bread or grains, but we can’t confirm the falafel ingredients or cross-contact. Please check with the restaurant before ordering gluten-free.";
  }

  if (
    /allerg|intoleran|sesame|tahini|peanut|nut|dairy|milk|egg|soy/.test(text)
  ) {
    if (/sesame|tahini/.test(text)) {
      answerTitle.textContent = "Tahini is an optional topping.";
      answerText.textContent =
        "It contains sesame. The menu does not confirm all ingredients or cross-contact in the falafel and sauces.";
      return "If you have a sesame allergy, please check with the restaurant before ordering; leaving tahini off may not prevent cross-contact.";
    }

    answerTitle.textContent = "I can help check the listed ingredients.";
    answerText.textContent =
      "The menu does not provide a complete allergen list or preparation details.";
    return "I can’t confirm this menu is safe for an allergy or intolerance. Please contact the restaurant to check ingredients and cross-contact before ordering.";
  }

  if (/topping|extra|add-on/.test(text)) {
    showRecommendation(
      "bowl",
      "Make your falafel meal yours.",
      "Choose tahini, green herb sauce, pickled red onion, feta, or extra falafel after selecting a bowl, salad, or wrap.",
    );
    return "All three meals come with falafel. You can add tahini, green herb sauce, pickled red onion, feta, or extra falafel.";
  }

  if (/salad|fresh|green|light|cucumber|tomato/.test(text)) {
    showRecommendation(
      "salad",
      "For something fresh and green, try the salad.",
      "Falafel with chopped greens, cucumber, tomato, and lemon.",
    );
    return "The Falafel Salad sounds closest to that: chopped greens, cucumber, tomato, and lemon.";
  }

  if (/wrap|pita|flatbread/.test(text)) {
    showRecommendation(
      "wrap",
      "A warm falafel wrap sounds comforting.",
      "Falafel, crunchy greens, pickles, and warm flatbread.",
    );
    return "The Falafel Wrap brings falafel, crunchy greens, pickles, and warm flatbread together.";
  }

  if (/bowl|warm|grain|hearty/.test(text)) {
    showRecommendation(
      "bowl",
      "For a warm, filling meal, try the bowl.",
      "Falafel, warm grains, greens, cucumber, and tomato.",
    );
    return "The Falafel Bowl is our warm, hearty option, with warm grains, greens, cucumber, and tomato.";
  }

  showRecommendation(
    "bowl",
    "Not sure? Start with a Falafel Bowl.",
    "Warm grains, greens, cucumber, and tomato, with falafel included. Add toppings to make it yours.",
  );
  return "Every option comes with falafel. Choose a bowl, salad, or wrap, then add your favorite toppings.";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  const userMessage = document.createElement("div");
  userMessage.className = "chat-bubble user";
  userMessage.textContent = prompt;

  const response = document.createElement("div");
  response.className = "chat-bubble assistant";
  response.textContent = answerPrompt(prompt);

  conversation.replaceChildren(userMessage, response);
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.prompt;
    form.requestSubmit();
  });
});
