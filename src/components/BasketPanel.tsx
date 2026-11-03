import { basketLines, basketTotalCents, itemCount } from '../agent/basket';
import type { ShopiSession } from '../hooks/useShopiSession';
import { formatPrice } from '../lib/money';

interface BasketPanelProps {
  session: ShopiSession;
}

export function BasketPanel({ session }: BasketPanelProps) {
  const { state, products, busy, send } = session;
  const lines = basketLines(state.basket, products);
  const count = itemCount(state.basket);
  const total = basketTotalCents(state.basket, products);

  return (
    <aside className="basket" aria-label="Your basket">
      <header className="basket-header">
        <h2>Your basket</h2>
        <span className="basket-count">{count} {count === 1 ? 'item' : 'items'}</span>
      </header>

      {lines.length === 0 ? (
        <p className="basket-empty">Nothing yet. Ask Shopi to find something and add it here.</p>
      ) : (
        <ul className="basket-lines">
          {lines.map(({ product, quantity }) => (
            <li key={product.id} className="basket-line">
              <div>
                <p className="basket-line-name">{product.name}</p>
                <p className="basket-line-meta">
                  {quantity} x {formatPrice(product.price_cents)}
                </p>
              </div>
              <div className="basket-line-actions">
                <span className="basket-line-price">{formatPrice(product.price_cents * quantity)}</span>
                <button
                  type="button"
                  className="button button-ghost button-small"
                  disabled={busy}
                  onClick={() => void send(`remove ${product.name}`)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="basket-footer">
        <div className="basket-total">
          <span>Total</span>
          <strong>{formatPrice(total)}</strong>
        </div>
        <button
          type="button"
          className="button button-primary button-block"
          disabled={busy || lines.length === 0}
          onClick={() => void send('checkout')}
        >
          Checkout
        </button>
        <button
          type="button"
          className="button button-ghost button-block"
          disabled={busy || lines.length === 0}
          onClick={() => void send('clear my basket')}
        >
          Clear basket
        </button>
      </div>
    </aside>
  );
}
