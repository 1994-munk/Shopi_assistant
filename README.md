# Shopi: Agentic Shopping Assistant

Shopi is a grocery shopping assistant built as a working prototype of the Staff AI Engineer role for Agentic Shopping. It helps a shopper search a catalog, build a basket through conversation, fix mistakes, and check out. The codebase also demonstrates the engineering patterns the role asks for: explicit dialogue state, layered guardrails, latency and turn logging, a scenario-based evaluation suite, and a documented path from the current rule-based model to open-weight models.

## Features

- **Conversational shopping:** search by name, category, dietary need (vegan, gluten-free, dairy-free, organic, low-sugar, vegetarian) and price ("under $3").
- **Basket management:** add (with quantities), remove, clear, view totals. The basket is saved to the database per browser session.
- **Clarifying questions:** when a request is ambiguous ("add milk"), Shopi lists the options and resolves the follow-up ("the oat one").
- **Recovery:** when filters remove every result, Shopi offers the closest matches. Unknown products are reported plainly.
- **Guardrails:** prompt-injection attempts, requests for card numbers or passwords, off-topic questions and oversized messages are handled before any shopping logic runs.
- **Observability:** every turn is logged with intent, latency, clarification flag and safety flags. The Requirements tab shows live metrics.
- **Requirements tab:** maps each job responsibility and qualification to what Shopi does today, with an honest status (Built, Partial, Planned).

Checkout is a demonstration. Shopi reports the total and states that no payment is taken.

## Architecture

```
Browser (React + Vite)
  ChatView / BasketPanel / RequirementsView
        |
  useShopiSession (conversation state, send pipeline)
        |
  services/runTurn  --->  agent/dialogue.handleTurn   (pure: no I/O)
        |                    |- agent/safety         guardrails
        |                    |- agent/understanding  intent + slot extraction
        |                    |- agent/search         retrieval and ranking
        |                    |- agent/basket         basket arithmetic
        |
        |-- services/basketStore  -> Supabase: basket_items
        |-- services/telemetry    -> Supabase: turn_events
        |-- services/catalog      -> Supabase: products
```

The agent core (`src/agent/`) is pure TypeScript with no network or browser dependencies. That keeps it fast, testable, and replayable for evaluation. All I/O sits in `src/services/`.

### Per-turn pipeline

1. **Guardrails** (`safety.ts`): length, prompt injection, personal data, off-topic. A blocked turn never reaches the shopping logic and never changes the basket.
2. **Understanding** (`understanding.ts`): turns the message into intent, keywords, category, dietary tags, price cap and quantity.
3. **Pending choice:** if Shopi asked the shopper to pick an option last turn, a follow-up is matched against those options first.
4. **Dialogue policy** (`dialogue.ts`): chooses the response and the next state (basket, last results, pending choice).
5. **Persistence:** only changed basket lines are written.
6. **Telemetry:** the turn is logged. A logging failure is reported to the console and never blocks the shopper.

## Model and inference strategy

| Concern | Current choice | Why | Next step |
|---|---|---|---|
| Intent and slot extraction | Deterministic rules in `understanding.ts` | Zero inference cost, sub-millisecond latency, fully auditable | Keep as the fallback and the baseline for offline evaluation |
| Ranking | Weighted keyword and attribute scoring in `search.ts` | Transparent and easy to debug | Learned ranker trained on acceptance and correction logs |
| Generation | Templated responses | No hallucinated prices or stock | Use an open-weight model only to rephrase responses, constrained by the basket and catalog facts |
| Serving (future) | Not applicable yet | | vLLM behind an edge function, with the rule-based path as fallback on timeout or error |
| Fine-tuning (future) | Not applicable yet | | Distil the rule-based labels and corrected turns into a small open-weight model |

The swap point is `understand()`. Any model that returns the same `Understanding` shape can replace it without touching the dialogue policy or the tests.

## Retrieval and context

- **Retrieval:** the full in-stock catalog is loaded once per visit and searched in memory. Filters are applied strictly, then keyword matches are ranked (name matches score higher than description or tag matches).
- **Context:** the dialogue state carries the basket, the last list shown (for "add it") and any open question. The basket is persisted so a reload keeps it.
- **Limit:** there is no vector index. This is appropriate for the current catalog size. Qdrant or a similar store would be the next step once the catalog and the descriptions grow.

## Evaluation

Run `npm test` to execute the scenario suite in `src/agent/dialogue.test.ts`. It covers:

- **Mission completion:** search, add, remove, clear and checkout flows across multi-turn sessions.
- **Basket correctness:** quantities, totals, removing the right line, and not adding unknown products.
- **Clarification quality:** ambiguous requests produce options, and follow-ups resolve correctly.
- **Safety:** prompt injection, card numbers, off-topic requests and oversized messages are blocked, and the basket is left unchanged.
- **Metrics:** latency percentiles and rates are computed correctly.

Online metrics are computed from `turn_events` and shown on the Requirements tab: turns, average and p95 latency, clarification rate and block rate.

Not yet built: shopper acceptance and correction signals (for example, whether a suggested item was kept or removed), and an offline replay harness that runs logged conversations through new model versions. These are the next items in the evaluation roadmap.

## Safety

- Rule-based guardrails run before any shopping logic.
- The assistant never states prices or stock from memory. All figures come from the catalog.
- Personal data is refused. Messages that contain card-like numbers or password requests are stored as "[redacted: personal data]" in the turn log, never as typed. Users are warned not to share card or password details.
- Database access follows row-level security. See the security notes below.

## Data model

| Table | Purpose | Access |
|---|---|---|
| `products` | Catalog: name, category, price in cents, description, dietary tags, stock flag | Read only |
| `basket_items` | One row per product in a session's basket | Read, insert, update, delete |
| `turn_events` | One row per chat turn for evaluation and monitoring | Read and insert |

### Security notes

Shopi has no sign-in, so visitors are identified only by a random session id stored in their browser. The database policies are therefore open to the anonymous role. This is acceptable for a demonstration but means one visitor could in principle read or change another visitor's basket if they knew the session id. A production version should add sign-in and scope basket rows to the signed-in user.

## Project structure

```
src/
  agent/          Pure agent core: types, safety, understanding, search, basket, dialogue, metrics
  components/     ChatView, BasketPanel, ProductCard, RequirementsView
  hooks/          useShopiSession: conversation state and send pipeline
  services/       Supabase access: catalog, basket, telemetry, runTurn
  lib/            Supabase client, session id, money formatting
  App.tsx         Layout and navigation
  index.css       Design tokens and styles
```

## Running locally

```
npm install
npm run dev      # start the app
npm test         # run the agent evaluation suite
npm run build    # type-check and build for production
```

The Supabase URL and anonymous key are read from the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Known limitations

- Language understanding handles common phrasings, not open conversation. Unusual wording falls back to a clarifying question.
- Responses are templated, so tone is consistent but less natural than a generative model.
- Prices are in US dollars and the catalog is a fixed sample of 30 products.
- Baskets are not protected by sign-in (see Security notes).
- Checkout does not take payment.

## Roadmap

1. Collect acceptance and correction signals (kept or removed items, edited quantities) and report them alongside the existing metrics.
2. Offline replay harness for logged conversations, so model changes are compared on the same inputs.
3. Open-weight intent model served with vLLM, with the rule-based path as the fallback and the baseline.
4. Vector retrieval (Qdrant) for descriptive queries such as "something for a quick dinner".
5. Sign-in and per-user baskets.
