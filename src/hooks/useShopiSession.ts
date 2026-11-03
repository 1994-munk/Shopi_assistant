import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_STATE } from '../agent/dialogue';
import type { ConversationState, Product } from '../agent/types';
import { getSessionId } from '../lib/session';
import { fetchProducts } from '../services/catalog';
import { loadBasket } from '../services/basketStore';
import { runTurn } from '../services/runTurn';

export interface ChatMessage {
  id: string;
  author: 'user' | 'shopi' | 'error';
  text: string;
  productIds: string[];
}

export interface ShopiSession {
  products: Product[];
  state: ConversationState;
  messages: ChatMessage[];
  loading: boolean;
  loadError: string | null;
  busy: boolean;
  send: (text: string) => Promise<void>;
}

const GREETING: ChatMessage = {
  id: 'greeting',
  author: 'shopi',
  text: "Hi, I'm Shopi, your shopping assistant. Tell me what you need, for example 'show vegan snacks under $5', and I'll help you build your basket.",
  productIds: [],
};

// Owns the whole conversation: the catalog, the basket, the chat transcript and the send pipeline.
export function useShopiSession(): ShopiSession {
  const [sessionId] = useState(getSessionId);
  const [products, setProducts] = useState<Product[]>([]);
  const [state, setState] = useState<ConversationState>(INITIAL_STATE);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const turnCounter = useRef(0);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchProducts(), loadBasket(sessionId)])
      .then(([catalog, basket]) => {
        if (cancelled) return;
        setProducts(catalog);
        setState((current) => ({ ...current, basket }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Something went wrong while loading Shopi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      const turnIndex = turnCounter.current;
      turnCounter.current += 1;
      setMessages((current) => [...current, { id: crypto.randomUUID(), author: 'user', text, productIds: [] }]);
      setBusy(true);

      try {
        const reply = await runTurn({ sessionId, turnIndex, message: text, products, state });
        setState(reply.nextState);
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), author: 'shopi', text: reply.text, productIds: reply.productIds },
        ]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Sorry, I couldn't complete that. Please try again.";
        setMessages((current) => [...current, { id: crypto.randomUUID(), author: 'error', text: message, productIds: [] }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, products, sessionId, state],
  );

  return { products, state, messages, loading, loadError, busy, send };
}
