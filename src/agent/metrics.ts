// Turns raw turn logs into the health numbers the team watches: latency, clarification rate, blocks.

export interface TurnRecord {
  intent: string;
  latencyMs: number;
  clarificationAsked: boolean;
  safetyFlags: string[];
}

export interface ConversationMetrics {
  turns: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  clarificationRate: number;
  blockRate: number;
  intentCounts: Record<string, number>;
}

export function computeMetrics(records: TurnRecord[]): ConversationMetrics {
  const turns = records.length;
  if (turns === 0) {
    return {
      turns: 0,
      averageLatencyMs: 0,
      p95LatencyMs: 0,
      clarificationRate: 0,
      blockRate: 0,
      intentCounts: {},
    };
  }

  const latencies = records.map((record) => record.latencyMs).sort((a, b) => a - b);
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
  // Nearest-rank percentile: the value below which 95% of turns finished.
  const p95Index = Math.min(turns - 1, Math.ceil(0.95 * turns) - 1);

  const intentCounts: Record<string, number> = {};
  for (const record of records) {
    intentCounts[record.intent] = (intentCounts[record.intent] ?? 0) + 1;
  }

  return {
    turns,
    averageLatencyMs: Math.round(totalLatency / turns),
    p95LatencyMs: latencies[p95Index],
    clarificationRate: records.filter((record) => record.clarificationAsked).length / turns,
    blockRate: records.filter((record) => record.intent === 'blocked').length / turns,
    intentCounts,
  };
}
