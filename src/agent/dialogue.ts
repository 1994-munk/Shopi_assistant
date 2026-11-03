import { MAX_MESSAGE_LENGTH, checkSafety } from './safety';
import {
  addToBasket,
  basketLines,
  basketTotalCents,
  clampQuantity,
  itemCount,
  removeFromBasket,
} from './basket';
import { bestMatches, searchProducts } from './search';
import { understand, type Understanding } from './understanding';
import { formatPrice } from '../lib/money';
import type {
  AgentReply,
  ConversationState,
  PendingChoice,
  Product,
  ReplyIntent,
  SafetyFlag,
  UserIntent,
} from './types';

const MAX_RESULTS_SHOWN = 6;
const MAX_CHOICES_OFFERED = 4;
const MAX_FALLBACK_SUGGESTIONS = 3;

export const INITIAL_STATE: ConversationState = {
  basket: [],
  lastResultIds: [],
  pendingChoice: null,
};

export interface TurnInput {
  message: string;
  products: Product[];
  state: ConversationState;
}

interface TurnContext {
  products: Product[];
  state: ConversationState;
  flags: SafetyFlag[];
}

interface Outcome {
  text: string;
  productIds?: string[];
  asksClarification?: boolean;
  basket?: ConversationState['basket'];
  lastResultIds?: string[];
  pendingChoice?: PendingChoice;
}

// Turns one shopper message into a reply plus the updated conversation state.
// Pure function: no network calls, so it can be unit-tested and replayed in evaluations.
export function handleTurn({ message, products, state }: TurnInput): AgentReply {
  const text = message.trim();
  const flags = checkSafety(text);

  const blocked = blockedReply(text, flags, state);
  if (blocked) return blocked;

  const understanding = understand(text);
  const ctx: TurnContext = { products, state, flags };

  if (state.pendingChoice) {
    const resolved = resolvePendingChoice(ctx, state.pendingChoice, understanding);
    if (resolved) return resolved;
  }

  switch (understanding.intent) {
    case 'search':
      return handleSearch(ctx, understanding);
    case 'add_to_basket':
      return handleAdd(ctx, understanding);
    case 'remove_from_basket':
      return handleRemove(ctx, understanding);
    case 'show_basket':
      return handleShowBasket(ctx);
    case 'clear_basket':
      return handleClear(ctx);
    case 'checkout':
      return handleCheckout(ctx);
    case 'help':
      return finish(ctx, 'help', { text: HELP_TEXT });
    case 'unclear':
      return finish(ctx, 'unclear', {
        text: 'Sorry, I did not catch that. You can search for products, add or remove items, view your basket, or check out.',
        asksClarification: true,
      });
  }
}

function blockedReply(text: string, flags: SafetyFlag[], state: ConversationState): AgentReply | null {
  const ctx: TurnContext = { products: [], state, flags };

  if (flags.includes('too_long')) {
    return finish(ctx, 'blocked', {
      text: `That message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }
  if (flags.includes('personal_data')) {
    return finish(ctx, 'blocked', {
      text: "For your safety, please don't share card numbers or passwords here. Shopi never needs them to help you shop.",
    });
  }
  if (flags.includes('prompt_injection')) {
    return finish(ctx, 'blocked', {
      text: "I can only help with shopping, so I can't change my instructions. Try asking me to find a product or show your basket.",
    });
  }
  if (flags.includes('off_topic')) {
    return finish(ctx, 'off_topic', {
      text: `I can only help with grocery shopping, so "${text}" is outside what I can do. Try asking for something to cook with, or check your basket.`,
    });
  }
  return null;
}

const HELP_TEXT = [
  'Here is what I can do:',
  "Search: 'show vegan snacks under $5'",
  "Add: 'add two avocados'",
  "Remove: 'remove the sparkling water'",
  "Basket: 'what's in my basket?'",
  "Checkout: 'checkout'",
].join('\n');

function handleSearch(ctx: TurnContext, u: Understanding): AgentReply {
  const hasCriteria =
    u.keywords.length > 0 || u.category !== null || u.dietary.length > 0 || u.maxPriceCents !== null;
  if (!hasCriteria) {
    return finish(ctx, 'search', {
      text: 'What are you looking for? You can name a category such as produce, dairy or bakery, or a need such as vegan or gluten-free.',
      asksClarification: true,
    });
  }

  const results = searchProducts(ctx.products, {
    keywords: u.keywords,
    category: u.category,
    dietary: u.dietary,
    maxPriceCents: u.maxPriceCents,
  });
  if (results.length === 0) return noResultsReply(ctx, u);

  const shown = results.slice(0, MAX_RESULTS_SHOWN);
  const shownIds = shown.map((product) => product.id);
  const broad = results.length > MAX_RESULTS_SHOWN;

  const text = broad
    ? `I found ${results.length} options. Here are the first ${shown.length}. Would you like to narrow it down by dietary need, price or category?`
    : `I found ${results.length} ${results.length === 1 ? 'option' : 'options'}. Tap Add on any of them to put it in your basket.`;

  return finish(ctx, 'search', {
    text,
    productIds: shownIds,
    lastResultIds: shownIds,
    asksClarification: broad,
  });
}

// Fallback when strict filters remove everything: offer the closest keyword matches without filters.
function noResultsReply(ctx: TurnContext, u: Understanding): AgentReply {
  if (u.keywords.length > 0) {
    const closest = searchProducts(ctx.products, {
      keywords: u.keywords,
      category: null,
      dietary: [],
      maxPriceCents: null,
    }).slice(0, MAX_FALLBACK_SUGGESTIONS);

    if (closest.length > 0) {
      const ids = closest.map((product) => product.id);
      return finish(ctx, 'search', {
        text: `Nothing matches all of those filters. The closest options are ${formatList(closest.map((p) => p.name))}. Would you like to see them?`,
        productIds: ids,
        lastResultIds: ids,
        asksClarification: true,
      });
    }
  }

  return finish(ctx, 'search', {
    text: 'I could not find anything like that in our catalog. Try a different word, such as milk, bread or chickpeas.',
    asksClarification: true,
  });
}

function handleAdd(ctx: TurnContext, u: Understanding): AgentReply {
  const inStock = ctx.products.filter((product) => product.in_stock);
  const description = u.keywords.join(' ');

  if (u.keywords.length === 0) {
    const [lastId] = ctx.state.lastResultIds;
    const lastProduct = u.refersToLastResult ? ctx.products.find((product) => product.id === lastId) : undefined;
    if (!lastProduct) {
      return finish(ctx, 'add_to_basket', {
        text: "What would you like to add? For example, 'add two avocados'.",
        asksClarification: true,
      });
    }
    return addProduct(ctx, lastProduct, u.quantity);
  }

  const matches = bestMatches(inStock, u.keywords);
  if (matches.length === 0) {
    return finish(ctx, 'add_to_basket', {
      text: `I could not find "${description}" in our catalog. Try a different name, or ask me to search for it.`,
    });
  }

  if (matches.length > 1) {
    const choices = matches.slice(0, MAX_CHOICES_OFFERED);
    return finish(ctx, 'add_to_basket', {
      text: `Which one would you like: ${formatList(choices.map((p) => p.name))}?`,
      productIds: choices.map((p) => p.id),
      asksClarification: true,
      pendingChoice: { quantity: u.quantity, candidateIds: choices.map((p) => p.id) },
    });
  }

  return addProduct(ctx, matches[0], u.quantity);
}

// Follow-up after Shopi listed several options: a name or "that one" picks from that list only.
function resolvePendingChoice(ctx: TurnContext, pending: PendingChoice, u: Understanding): AgentReply | null {
  const candidates = ctx.products.filter((product) => pending.candidateIds.includes(product.id));

  let chosen: Product | undefined;
  if (u.keywords.length > 0) {
    const matches = bestMatches(candidates, u.keywords);
    if (matches.length === 1) chosen = matches[0];
  } else if (u.refersToLastResult) {
    chosen = candidates[0];
  }

  if (!chosen) return null;
  return addProduct(ctx, chosen, pending.quantity);
}

function addProduct(ctx: TurnContext, product: Product, quantity: number): AgentReply {
  const amount = clampQuantity(quantity);
  const basket = addToBasket(ctx.state.basket, product.id, amount);
  return finish(ctx, 'add_to_basket', {
    text: `Added ${amount} x ${product.name} to your basket. ${basketSummary(basket, ctx.products)}`,
    basket,
  });
}

function handleRemove(ctx: TurnContext, u: Understanding): AgentReply {
  const { basket } = ctx.state;
  if (basket.length === 0) {
    return finish(ctx, 'remove_from_basket', { text: 'Your basket is already empty.' });
  }

  const inBasket = basketLines(basket, ctx.products).map((entry) => entry.product);
  if (u.keywords.length === 0) {
    return finish(ctx, 'remove_from_basket', {
      text: `Which item should I remove? Your basket has ${formatList(inBasket.map((p) => p.name), 'and')}.`,
      asksClarification: true,
    });
  }

  const matches = bestMatches(inBasket, u.keywords);
  if (matches.length === 0) {
    return finish(ctx, 'remove_from_basket', { text: "That item isn't in your basket." });
  }
  if (matches.length > 1) {
    return finish(ctx, 'remove_from_basket', {
      text: `Which one should I remove: ${formatList(matches.map((p) => p.name))}?`,
      asksClarification: true,
    });
  }

  const [product] = matches;
  const updated = removeFromBasket(basket, product.id);
  return finish(ctx, 'remove_from_basket', {
    text: `Removed ${product.name} from your basket. ${basketSummary(updated, ctx.products)}`,
    basket: updated,
  });
}

function handleShowBasket(ctx: TurnContext): AgentReply {
  if (ctx.state.basket.length === 0) {
    return finish(ctx, 'show_basket', {
      text: "Your basket is empty. Ask me to find something, such as 'show gluten-free bread'.",
    });
  }

  const lines = basketLines(ctx.state.basket, ctx.products).map(
    ({ product, quantity }) => `${quantity} x ${product.name} (${formatPrice(product.price_cents * quantity)})`,
  );
  const total = basketTotalCents(ctx.state.basket, ctx.products);
  return finish(ctx, 'show_basket', {
    text: `Your basket:\n${lines.join('\n')}\nTotal: ${formatPrice(total)}`,
  });
}

function handleClear(ctx: TurnContext): AgentReply {
  if (ctx.state.basket.length === 0) {
    return finish(ctx, 'clear_basket', { text: 'Your basket is already empty.' });
  }
  return finish(ctx, 'clear_basket', { text: 'Done, your basket is now empty.', basket: [] });
}

// Shopi does not take payment in this demo. The reply says so instead of pretending to.
function handleCheckout(ctx: TurnContext): AgentReply {
  if (ctx.state.basket.length === 0) {
    return finish(ctx, 'checkout', {
      text: 'Your basket is empty, so there is nothing to check out yet. Would you like some suggestions?',
      asksClarification: true,
    });
  }
  const total = basketTotalCents(ctx.state.basket, ctx.products);
  return finish(ctx, 'checkout', {
    text: `Your basket has ${itemCount(ctx.state.basket)} items with a total of ${formatPrice(total)}. This is a demo, so no payment is taken. In the full app you would confirm delivery and payment here.`,
  });
}

function basketSummary(basket: ConversationState['basket'], products: Product[]): string {
  const count = itemCount(basket);
  if (count === 0) return 'Your basket is now empty.';
  const total = basketTotalCents(basket, products);
  return `You have ${count} ${count === 1 ? 'item' : 'items'} worth ${formatPrice(total)}.`;
}

function formatList(items: string[], conjunction: 'or' | 'and' = 'or'): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

function finish(ctx: TurnContext, intent: ReplyIntent | UserIntent, outcome: Outcome): AgentReply {
  return {
    text: outcome.text,
    intent,
    productIds: outcome.productIds ?? [],
    asksClarification: outcome.asksClarification ?? false,
    safetyFlags: ctx.flags,
    nextState: {
      basket: outcome.basket ?? ctx.state.basket,
      lastResultIds: outcome.lastResultIds ?? ctx.state.lastResultIds,
      pendingChoice: outcome.pendingChoice ?? null,
    },
  };
}
