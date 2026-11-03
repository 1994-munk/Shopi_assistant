import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    })
  : null;

function readBaseUrl(req) {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, '');
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'https://shopi-assistant.vercel.app';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not configured on this deployment.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    const totalCents = Number(body.total_cents ?? 0);
    const itemCount = Number(body.item_count ?? 0);
    const email = typeof body.email === 'string' ? body.email : undefined;

    if (!Number.isFinite(totalCents) || totalCents <= 0) {
      return res.status(400).json({ error: 'A valid order total is required.' });
    }

    const baseUrl = readBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: itemCount > 0 ? `Shopi order (${itemCount} items)` : 'Shopi order',
              description: 'Checkout for the Shopi grocery assistant order.',
            },
          },
        },
      ],
      success_url: `${baseUrl}/?checkout=success`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      metadata: {
        item_count: String(itemCount),
        source: 'shopi-vercel',
      },
      payment_method_types: ['card'],
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout creation failed:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not create Stripe checkout session.',
    });
  }
}
