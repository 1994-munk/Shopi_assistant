import { supabase } from '../lib/supabase';
import type { TurnRecord } from '../agent/metrics';
import type { AgentReply } from '../agent/types';

interface TurnEventInput {
  sessionId: string;
  turnIndex: number;
  userMessage: string;
  reply: AgentReply;
  latencyMs: number;
}

interface TurnEventRow {
  intent: string;
  latency_ms: number;
  clarification_asked: boolean;
  safety_flags: string[];
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

export async function fetchRecentTurns(limit = 500): Promise<TurnRecord[]> {
  const { data, error } = await supabase
    .from('turn_events')
    .select('intent, latency_ms, clarification_asked, safety_flags')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('Could not load turn metrics.');
  return ((data ?? []) as TurnEventRow[]).map((row) => ({
    intent: row.intent,
    latencyMs: row.latency_ms,
    clarificationAsked: row.clarification_asked,
    safetyFlags: row.safety_flags,
  }));
}
