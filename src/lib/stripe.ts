import { loadStripe } from '@stripe/stripe-js';

// We keep the secret key off the browser and rely on a server-side checkout endpoint
// when the app is live. The browser only needs the public key to initialize Stripe.
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripeCheckoutEndpoint = import.meta.env.VITE_STRIPE_CHECKOUT_URL;

export function isStripeConfigured(): boolean {
  return Boolean(stripeCheckoutEndpoint || stripePublishableKey);
}

interface StartCheckoutSessionInput {
  totalCents: number;
  itemCount: number;
  email?: string;
}

export async function startCheckoutSession({
  totalCents,
  itemCount,
  email,
}: StartCheckoutSessionInput): Promise<boolean> {
  // Production flow: the app posts the order to a backend endpoint that creates the Stripe
  // Checkout session and returns the hosted URL. This prevents secrets from leaking into the UI.
  if (stripeCheckoutEndpoint) {
    const response = await fetch(stripeCheckoutEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        total_cents: totalCents,
        item_count: itemCount,
        email,
      }),
    });

    if (!response.ok) {
      throw new Error('The Stripe checkout endpoint rejected the order request.');
    }

    const result = (await response.json()) as { url?: string };

    if (result.url) {
      window.location.assign(result.url);
      return true;
    }

    throw new Error('The Stripe checkout endpoint did not return a redirect URL.');
  }

  // Local demo mode: we can still initialize Stripe in the browser if the public key exists,
  // but without a server session we cannot create a real charge. This keeps the flow honest.
  if (stripePublishableKey) {
    const stripe = await loadStripe(stripePublishableKey);

    if (!stripe) {
      throw new Error('Stripe loaded without a valid public key.');
    }

    throw new Error('Stripe is configured, but a backend session creator is still required for a real payment.');
  }

  return false;
}
