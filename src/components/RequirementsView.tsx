import { useEffect, useState } from 'react';
import { computeMetrics, type ConversationMetrics } from '../agent/metrics';
import { fetchRecentTurns } from '../services/telemetry';

type CoverageStatus = 'Built' | 'Partial' | 'Planned';

interface RequirementRow {
  requirement: string;
  coverage: string;
  status: CoverageStatus;
}

interface RequirementGroup {
  title: string;
  rows: RequirementRow[];
}

// Each job requirement, how Shopi addresses it today, and an honest status.
const REQUIREMENT_GROUPS: RequirementGroup[] = [
  {
    title: 'Responsibilities',
    rows: [
      {
        requirement: 'Multi-turn conversational agent architecture',
        coverage: 'Shopi keeps the basket, the last results and any open question across turns, and resolves follow-ups such as "the oat one" or "add it".',
        status: 'Built',
      },
      {
        requirement: 'Balance latency, safety guardrails and inference cost',
        coverage: 'Guardrails run before any shopping logic. Language understanding runs in the browser, so there is no per-message model cost. Every turn is timed.',
        status: 'Built',
      },
      {
        requirement: 'Rapid prototyping and productionization',
        coverage: 'Typed modules with unit tests, a database migration with row-level security, and a live metrics panel below.',
        status: 'Built',
      },
      {
        requirement: 'Model fine-tuning and context engineering',
        coverage: 'The language understanding module is the single swap point for an open-weight model. No model has been trained or fine-tuned yet.',
        status: 'Planned',
      },
      {
        requirement: 'Retrieval-augmented generation (RAG)',
        coverage: 'Catalog retrieval ranks products by name, tags and filters. There is no vector index or generated answer yet.',
        status: 'Partial',
      },
      {
        requirement: 'Evaluation and safety feedback loops',
        coverage: 'A scenario suite covers mission completion, basket correctness, clarification and safety. Every turn is logged. Shopper acceptance and correction signals are not collected yet.',
        status: 'Partial',
      },
      {
        requirement: 'Cross-functional alignment on trade-offs',
        coverage: 'The README records the architecture, trade-offs and known limits so product and design can review them.',
        status: 'Partial',
      },
    ],
  },
  {
    title: 'Qualifications',
    rows: [
      {
        requirement: 'Taking multi-turn conversational AI from design to production',
        coverage: 'A complete chat flow: search, add, remove, basket, checkout, help, clarification and recovery from errors.',
        status: 'Built',
      },
      {
        requirement: 'Training, fine-tuning and optimizing open-weight LLMs',
        coverage: 'Not yet. This build uses deterministic understanding instead of a language model.',
        status: 'Planned',
      },
      {
        requirement: 'Production RAG, context management and dialogue state',
        coverage: 'Dialogue state is explicit and persisted. Retrieval is keyword and attribute based.',
        status: 'Partial',
      },
      {
        requirement: 'Evaluation loops, monitoring and automated guardrails',
        coverage: 'Scenario tests, a turn log, latency and clarification metrics, and rule-based prompt-injection, personal-data and off-topic guardrails.',
        status: 'Built',
      },
      {
        requirement: 'Technical direction, design reviews and mentoring',
        coverage: 'Decisions are documented in the README so other teams can review and reuse the patterns.',
        status: 'Partial',
      },
      {
        requirement: 'Strong Python and tooling such as PyTorch, LangGraph, vLLM, Pydantic AI, Qdrant or DeepEval',
        coverage: 'Not used in this build, which is TypeScript. The README names where these tools would plug in for model serving and evaluation.',
        status: 'Planned',
      },
    ],
  },
  {
    title: 'Nice to have',
    rows: [
      {
        requirement: 'Retrieval, ranking or recommendation models in production',
        coverage: 'A transparent ranking heuristic is in place. A learned ranker has not been built.',
        status: 'Partial',
      },
      {
        requirement: 'Deep learning for sequence modelling or representation learning',
        coverage: 'Not yet.',
        status: 'Planned',
      },
    ],
  },
];

const STATUS_CLASS: Record<CoverageStatus, string> = {
  Built: 'status-built',
  Partial: 'status-partial',
  Planned: 'status-planned',
};

type MetricsState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; metrics: ConversationMetrics };

export function RequirementsView() {
  const [metricsState, setMetricsState] = useState<MetricsState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchRecentTurns()
      .then((records) => {
        if (!cancelled) setMetricsState({ kind: 'ready', metrics: computeMetrics(records) });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMetricsState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Metrics are unavailable right now.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="requirements">
      <header className="page-header">
        <h1>Job requirements and how Shopi covers them</h1>
        <p>Each requirement from the Staff AI Engineer role, with the current state of the build.</p>
      </header>

      <section className="metrics-section" aria-labelledby="metrics-title">
        <h2 id="metrics-title">Live assistant health</h2>
        {metricsState.kind === 'loading' && <p className="muted">Loading metrics...</p>}
        {metricsState.kind === 'error' && <p className="error-text">{metricsState.message}</p>}
        {metricsState.kind === 'ready' && <MetricsGrid metrics={metricsState.metrics} />}
      </section>

      {REQUIREMENT_GROUPS.map((group) => (
        <section key={group.title} className="requirement-group">
          <h2>{group.title}</h2>
          <div className="requirement-list">
            {group.rows.map((row) => (
              <article key={row.requirement} className="requirement-row">
                <div className="requirement-main">
                  <h3>{row.requirement}</h3>
                  <p>{row.coverage}</p>
                </div>
                <span className={`status-badge ${STATUS_CLASS[row.status]}`}>{row.status}</span>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: ConversationMetrics }) {
  const items = [
    { label: 'Turns logged', value: metrics.turns.toString() },
    { label: 'Average latency', value: `${metrics.averageLatencyMs} ms` },
    { label: '95th percentile latency', value: `${metrics.p95LatencyMs} ms` },
    { label: 'Clarification rate', value: formatPercent(metrics.clarificationRate) },
    { label: 'Blocked by guardrails', value: formatPercent(metrics.blockRate) },
  ];

  return (
    <div className="metrics-grid">
      {items.map((item) => (
        <div key={item.label} className="metric-card">
          <span className="metric-label">{item.label}</span>
          <strong className="metric-value">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
