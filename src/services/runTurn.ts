import { handleTurn } from '../agent/dialogue';
import type { AgentReply, ConversationState, Product } from '../agent/types';
import { saveBasket } from './basketStore';
import { runTurnViaApi } from './agentApi';
import { recordTurn } from './telemetry';

interface RunTurnInput {
  sessionId: string;
  turnIndex: number;
  message: string;
  products: Product[];
  state: ConversationState;
}

// Runs one turn end to end. The app prefers the backend API when it is configured, but it
// still falls back to the local agent logic so the demo remains usable at startup or in local-only setups.
// Logging failures are reported to the console and never block the shopper.
export async function runTurn({ sessionId, turnIndex, message, products, state }: RunTurnInput): Promise<AgentReply> {
  const started = performance.now();

  let reply: AgentReply;

  try {
    const remoteReply = await runTurnViaApi({
      sessionId,
      message,
      basket: state.basket,
      context: {
        turnIndex,
        catalogSize: products.length,
      },
    });

    if (remoteReply) {
      reply = remoteReply;
    } else {
      reply = handleTurn({ message, products, state });
    }
  } catch (error: unknown) {
    console.warn('Shopi backend unavailable; falling back to local agent logic.', error);
    reply = handleTurn({ message, products, state });
  }

  await saveBasket(sessionId, state.basket, reply.nextState.basket);
  const latencyMs = Math.round(performance.now() - started);

  recordTurn({
    sessionId,
    turnIndex,
    userMessage: reply.safetyFlags.includes('personal_data') ? '[redacted: personal data]' : message,
    reply,
    latencyMs,
  }).catch((error: unknown) => {
    console.error('Could not record turn for evaluation', error);
  });

  return reply;
}
