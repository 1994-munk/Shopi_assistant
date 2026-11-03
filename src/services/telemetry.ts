import { supabase } from '../lib/supabase';
import type { AgentReply } from '../agent/types';

interface TurnEventInput {
  sessionId: string;
  turnIndex: number;
  userMessage: string;
  reply: AgentReply;
  latencyMs: number;
}

export async function recordTurn(event: TurnEventInput): Promise<void> {
  const { error } = await supabase.from('turn_events').insert({
    session_id: event.sessionId,
    turn_index: event.turnIndex,
    user_message: event.userMessage,
    intent: event.reply.intent,
    response_text: event.reply.text,
    clarification_asked: event.reply.asksClarification,
    safety_flags: event.reply.safetyFlags,
    latency_ms: event.latencyMs,
  });
  if (error) throw new Error(error.message);
}
