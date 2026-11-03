/*
# Shopi: product catalog, basket and conversation telemetry

Plain-English summary
Creates the three tables Shopi needs. The product catalog is seeded with 28 grocery products.
Shopi has no sign-in, so every visitor uses the app as the anonymous role and identifies their
own basket with a random session id stored in their browser.

1. New Tables
- `products`: catalog items (name, category, price in cents, description, dietary tags, stock flag).
- `basket_items`: one row per product in a visitor's basket (session id, product, quantity).
- `turn_events`: one row per chat turn for evaluation and monitoring (intent, latency, safety flags,
  whether Shopi asked a clarifying question).

2. Security
- RLS is enabled on all three tables.
- `products`: anonymous and signed-in roles can read only. No writes from the app.
- `basket_items`: anonymous and signed-in roles can read, add, change and remove rows.
  Limitation: without sign-in the database cannot tell visitors apart, so the policies are
  intentionally open for this demo. A production version should move baskets behind sign-in.
- `turn_events`: anonymous and signed-in roles can insert and read. Rows are never updated or deleted by the app.

3. Important notes
- Seed inserts are idempotent: running this migration twice does not duplicate products.
- Quantities must be between 1 and 99. Message text is capped at 500 characters.
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('produce', 'dairy', 'bakery', 'pantry', 'drinks', 'frozen', 'snacks')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  in_stock boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS basket_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, product_id)
);

CREATE INDEX IF NOT EXISTS basket_items_session_idx ON basket_items (session_id);

CREATE TABLE IF NOT EXISTS turn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  turn_index integer NOT NULL CHECK (turn_index >= 0),
  user_message text NOT NULL CHECK (char_length(user_message) <= 500),
  intent text NOT NULL,
  response_text text NOT NULL DEFAULT '',
  clarification_asked boolean NOT NULL DEFAULT false,
  safety_flags text[] NOT NULL DEFAULT '{}',
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS turn_events_created_idx ON turn_events (created_at DESC);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE basket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE turn_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON basket_items TO anon, authenticated;
GRANT SELECT, INSERT ON turn_events TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_basket_items" ON basket_items;
CREATE POLICY "anon_select_basket_items" ON basket_items FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_basket_items" ON basket_items;
CREATE POLICY "anon_insert_basket_items" ON basket_items FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_basket_items" ON basket_items;
CREATE POLICY "anon_update_basket_items" ON basket_items FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_basket_items" ON basket_items;
CREATE POLICY "anon_delete_basket_items" ON basket_items FOR DELETE
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_turn_events" ON turn_events;
CREATE POLICY "anon_select_turn_events" ON turn_events FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_turn_events" ON turn_events;
CREATE POLICY "anon_insert_turn_events" ON turn_events FOR INSERT
TO anon, authenticated WITH CHECK (true);

INSERT INTO products (name, category, price_cents, description, tags)
SELECT v.name, v.category, v.price_cents, v.description, v.tags
FROM (VALUES
  ('Hass Avocados (2 pack)', 'produce', 249, 'Ripe and ready to eat within a couple of days.', ARRAY['vegan','gluten-free']),
  ('Baby Spinach 300g', 'produce', 199, 'Organic baby leaf spinach, pre-washed.', ARRAY['vegan','gluten-free','organic']),
  ('Bananas 1kg', 'produce', 179, 'Sweet bananas, a good source of potassium.', ARRAY['vegan','gluten-free']),
  ('Cherry Tomatoes 250g', 'produce', 279, 'Vine-ripened cherry tomatoes.', ARRAY['vegan','gluten-free']),
  ('Sweet Potatoes 1kg', 'produce', 229, 'Roasting-friendly orange sweet potatoes.', ARRAY['vegan','gluten-free']),
  ('Lemons (4 pack)', 'produce', 219, 'Juicy lemons for dressings and drinks.', ARRAY['vegan','gluten-free']),
  ('Oat Milk Barista 1L', 'dairy', 289, 'Creamy oat milk that froths well for coffee.', ARRAY['vegan','dairy-free']),
  ('Whole Milk 2L', 'dairy', 329, 'Fresh whole milk from local farms.', ARRAY['vegetarian','gluten-free']),
  ('Greek Yogurt 500g', 'dairy', 349, 'Thick, high-protein natural yogurt with low sugar.', ARRAY['vegetarian','gluten-free','low-sugar']),
  ('Mature Cheddar 400g', 'dairy', 459, 'Aged cheddar with a sharp finish.', ARRAY['vegetarian','gluten-free']),
  ('Vegan Butter Block 250g', 'dairy', 379, 'Plant-based butter alternative for baking and spreading.', ARRAY['vegan','dairy-free','gluten-free']),
  ('Unsweetened Almond Milk 1L', 'dairy', 309, 'Light almond milk with no added sugar.', ARRAY['vegan','dairy-free','gluten-free','low-sugar']),
  ('Sourdough Loaf', 'bakery', 599, 'Slow-fermented sourdough baked daily.', ARRAY['vegan','vegetarian']),
  ('Gluten-Free Seeded Bread 500g', 'bakery', 549, 'Certified gluten-free loaf with seeds.', ARRAY['vegan','gluten-free']),
  ('Butter Croissants (4 pack)', 'bakery', 449, 'Flaky all-butter croissants, ready to warm.', ARRAY['vegetarian']),
  ('Oat and Raisin Cookies 250g', 'bakery', 399, 'Chewy cookies made with rolled oats.', ARRAY['vegan']),
  ('Brown Basmati Rice 1kg', 'pantry', 389, 'Long-grain brown rice with a nutty flavour.', ARRAY['vegan','gluten-free']),
  ('Rolled Oats 1kg', 'pantry', 279, 'Wholegrain oats for porridge and baking.', ARRAY['vegan']),
  ('Chickpeas 400g Tin', 'pantry', 109, 'Ready-to-use cooked chickpeas.', ARRAY['vegan','gluten-free']),
  ('Extra Virgin Olive Oil 500ml', 'pantry', 899, 'Cold-pressed olive oil for cooking and dressings.', ARRAY['vegan','gluten-free']),
  ('Crunchy Peanut Butter 340g', 'pantry', 359, 'Roasted peanuts with a little salt.', ARRAY['vegan','gluten-free']),
  ('Spaghetti 500g', 'pantry', 189, 'Durum wheat pasta that holds sauce well.', ARRAY['vegan']),
  ('Sparkling Water 1.5L', 'drinks', 129, 'Naturally carbonated mineral water with no sugar.', ARRAY['vegan','gluten-free','low-sugar']),
  ('Cold Brew Coffee 500ml', 'drinks', 349, 'Smooth ready-to-drink cold brew, lightly sweetened.', ARRAY['vegan','low-sugar']),
  ('Orange Juice 1L', 'drinks', 299, 'Pressed orange juice with no concentrate.', ARRAY['vegan','gluten-free']),
  ('Green Tea 20 Bags', 'drinks', 329, 'Delicate sencha-style green tea.', ARRAY['vegan','low-sugar']),
  ('Frozen Mixed Berries 600g', 'frozen', 469, 'Blueberries, raspberries and blackberries, flash frozen.', ARRAY['vegan','gluten-free']),
  ('Veggie Burgers (4 pack)', 'frozen', 599, 'Pea and bean patties that cook in ten minutes.', ARRAY['vegetarian']),
  ('Dark Chocolate 70% 180g', 'snacks', 329, 'Intense dark chocolate with low sugar.', ARRAY['vegan','gluten-free','low-sugar']),
  ('Mixed Nuts 300g', 'snacks', 499, 'Roasted almonds, cashews and walnuts.', ARRAY['vegan','gluten-free'])
) AS v(name, category, price_cents, description, tags)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = v.name);
