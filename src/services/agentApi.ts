import type { AgentReply, ConversationState, ReplyIntent, SafetyFlag } from '../agent/types';

interface BackendBasketItem {
  product_id: string;
  quantity: number;
}

interface BackendProductMatch {
  id: string;
  name: string;
  category: string;
  price_cents: number;
  description: string;
  tags: string[];
  in_stock: boolean;
}

interface BackendChatResponse {
  session_id: string;
  intent: string;
  response_text: string;
  basket: BackendBasketItem[];
  matches: BackendProductMatch[];
  safety_flags: string[];
}

interface AgentApiRequest {
  sessionId: string;
  message: string;
  basket: ConversationState['basket'];
  context?: Record<string, unknown>;
}

const API_BASE_URL = (import.meta.env.VITE_SHOPI_API_URL ?? '').replace(/\/$/, '');

// This wrapper keeps the real LLM-powered backend optional. During local development the
// frontend still works with the in-browser agent logic, but once a backend URL is configured
// the same turn flow is sent through the platform API for a more realistic orchestration path.
export async function runTurnViaApi({
  sessionId,
  message,
  basket,
  context,
}: AgentApiRequest): Promise<AgentReply | null> {
  if (!API_BASE_URL) return null;

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      user_message: message,
      basket: basket.map((line) => ({
        product_id: line.productId,
        quantity: line.quantity,
      })),
      context: context ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopi API request failed with ${response.status}`);
  }

  const payload = (await response.json()) as BackendChatResponse;

  const nextState: ConversationState = {
    basket: payload.basket.map((line) => ({
      productId: line.product_id,
      quantity: line.quantity,
    })),
    lastResultIds: payload.matches.map((match) => match.id),
    pendingChoice: null,
  };

  return {
    text: payload.response_text,
    intent: payload.intent as ReplyIntent,
    productIds: payload.matches.map((match) => match.id),
    asksClarification: false,
    safetyFlags: payload.safety_flags as SafetyFlag[],
    nextState,
  };
}
