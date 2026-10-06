export const ORDER_STORAGE_KEY = "fufu-order";

/** Stores the shopper receipt, not an authoritative fulfilment record. */
export function saveOrderResult(result, session) {
  const order = {
    sessionId: session.id,
    sessionResult: result.sessionResult ?? null,
    resultCode: result.resultCode,
    reference: session.reference,
    amount: session.amount,
    mealName: session.mealName,
    toppings: session.toppings ?? [],
  };
  sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
  return order;
}
