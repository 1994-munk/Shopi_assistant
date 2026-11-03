import type { BasketLine, Product } from './types';

export const MAX_QUANTITY = 99;

export function clampQuantity(quantity: number): number {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.floor(quantity)));
}

export function addToBasket(basket: BasketLine[], productId: string, quantity: number): BasketLine[] {
  const existing = basket.find((line) => line.productId === productId);
  if (!existing) {
    return [...basket, { productId, quantity: clampQuantity(quantity) }];
  }
  return basket.map((line) =>
    line.productId === productId ? { ...line, quantity: clampQuantity(line.quantity + quantity) } : line,
  );
}

export function removeFromBasket(basket: BasketLine[], productId: string): BasketLine[] {
  return basket.filter((line) => line.productId !== productId);
}

// Joins basket lines to their products. Lines whose product is missing from the catalog are skipped.
export function basketLines(
  basket: BasketLine[],
  products: Product[],
): Array<{ product: Product; quantity: number }> {
  return basket.flatMap((line) => {
    const product = products.find((candidate) => candidate.id === line.productId);
    return product ? [{ product, quantity: line.quantity }] : [];
  });
}

export function basketTotalCents(basket: BasketLine[], products: Product[]): number {
  return basketLines(basket, products).reduce(
    (sum, entry) => sum + entry.product.price_cents * entry.quantity,
    0,
  );
}

export function itemCount(basket: BasketLine[]): number {
  return basket.reduce((sum, line) => sum + line.quantity, 0);
}
