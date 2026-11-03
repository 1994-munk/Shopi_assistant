import { handleTurn } from '../agent/dialogue';
import type { AgentReply, ConversationState, Product } from '../agent/types';
import { saveBasket } from './basketStore';
import { recordTurn } from './telemetry';

interface RunTurnInput {
  sessionId: string;
  turnIndex: number;
  message: string;
  products: Product[];
  state: ConversationState;
}

// Runs one turn end to end: decide, persist the basket, then log the turn for evaluation.
// Logging failures are reported to the console and never block the shopper.
export async function runTurn({ sessionId, turnIndex, message, products, state }: RunTurnInput): Promise<AgentReply> {
  const started = performance.now();
  const reply = handleTurn({ message, products, state });
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
