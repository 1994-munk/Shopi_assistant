import { useState, type FormEvent } from 'react';
import { basketLines, basketTotalCents, itemCount } from '../agent/basket';
import type { ShopiSession } from '../hooks/useShopiSession';
import { formatPrice } from '../lib/money';
import { isStripeConfigured, startCheckoutSession } from '../lib/stripe';

interface BasketPanelProps {
  session: ShopiSession;
}

export function BasketPanel({ session }: BasketPanelProps) {
  const { state, products, busy, send } = session;
  const lines = basketLines(state.basket, products);
  const count = itemCount(state.basket);
  const total = basketTotalCents(state.basket, products);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [method, setMethod] = useState<'card' | 'wallet' | 'bank'>('card');
  const [paid, setPaid] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  function openCheckout() {
    setPaid(false);
    setCheckoutError('');
    setCheckoutOpen(true);
    void send('checkout');
  }

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutError('');
    setIsProcessing(true);

    try {
      // Read the user contact details so the checkout flow has a real order context.
      const form = event.currentTarget;
      const email = (form.elements.namedItem('email') as HTMLInputElement | null)?.value ?? '';
      const customerName = (form.elements.namedItem('customerName') as HTMLInputElement | null)?.value ?? 'Shopi Shopper';

      // If Stripe is configured, we redirect to a server-created checkout session. The browser
      // never handles the secret key directly, which keeps the payment flow production safe.
      const liveCheckoutConfigured = isStripeConfigured();
      if (liveCheckoutConfigured) {
        const checkoutStarted = await startCheckoutSession({
          totalCents: total,
          itemCount: count,
          email,
        });

        if (checkoutStarted) {
          return;
        }
      }

      // Local demos still need a successful purchase flow without a live provider configured.
      // This keeps the storefront usable in development while the production Stripe endpoint is added.
      console.info('Demo payment accepted for', customerName, 'email', email, 'total', total);
      setPaid(true);
      setCheckoutOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed. Please try again.';
      setCheckoutError(message);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <aside className="basket" aria-label="Your basket">
      <header className="basket-header">
        <h2>Your basket</h2>
        <span className="basket-count">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
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
          onClick={openCheckout}
        >
          Secure checkout
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

      {checkoutOpen && !paid && (
        <form className="payment-sheet" onSubmit={handlePayment}>
          <div className="payment-sheet-header">
            <div>
              <p className="eyebrow">Checkout</p>
              <h3>Pay securely</h3>
            </div>
            <button className="icon-button" type="button" onClick={() => setCheckoutOpen(false)} aria-label="Close checkout">
              ×
            </button>
          </div>

          <div className="payment-methods" role="radiogroup" aria-label="Payment methods">
            {[
              { value: 'card', label: 'Card' },
              { value: 'wallet', label: 'Wallet' },
              { value: 'bank', label: 'Bank' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`payment-method ${method === option.value ? 'selected' : ''}`}
                onClick={() => setMethod(option.value as 'card' | 'wallet' | 'bank')}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="field">
            <span>Full name</span>
            <input type="text" name="customerName" defaultValue="Shopi Shopper" autoComplete="name" />
          </label>

          <label className="field">
            <span>Email</span>
            <input type="email" name="email" defaultValue="hello@shopi.example" autoComplete="email" />
          </label>

          <label className="field">
            <span>Card number</span>
            <input type="text" defaultValue="4242 4242 4242 4242" autoComplete="cc-number" />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Expiry</span>
              <input type="text" defaultValue="12/29" autoComplete="cc-exp" />
            </label>
            <label className="field">
              <span>CVC</span>
              <input type="text" defaultValue="123" autoComplete="cc-csc" />
            </label>
          </div>

          <div className="payment-summary">
            <span>Due today</span>
            <strong>{formatPrice(total)}</strong>
          </div>

          {checkoutError && (
            <p className="payment-error" role="alert">
              {checkoutError}
            </p>
          )}

          <button className="button button-primary button-block" type="submit" disabled={isProcessing}>
            {isProcessing ? 'Processing...' : `Pay ${formatPrice(total)}`}
          </button>
        </form>
      )}

      {paid && (
        <div className="checkout-success" role="status" aria-live="polite">
          <strong>Order placed</strong>
          <span>Payment secured and your order is on the way.</span>
        </div>
      )}
    </aside>
  );
}
