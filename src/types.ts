export type Environment = "offline" | "live";
export type Strategy = "direct" | "programmatic";
export type ExecutionKind = "offline-harness" | "openai-agents-js";
export type MetricSource = "instrumented" | "provider" | "unavailable";
export const catalogSizes = [5, 20, 50, 100] as const;
export type CatalogSize = (typeof catalogSizes)[number];

export const scenarios = [
  "single-lookup",
  "independent-calls",
  "dependent-calls",
  "large-catalog",
  "large-response",
  "pagination",
  "partial-failure",
  "concurrent-discovery",
  "cache-invalidation",
  "permission-denied",
] as const;
export type Scenario = (typeof scenarios)[number];

export interface BenchmarkConfig {
  runId?: string;
  environment: Environment;
  strategy: Strategy;
  scenario: Scenario;
  catalogSize: CatalogSize;
  trials: number;
  model?: string;
  outputDir: string;
}

export interface TrialResult {
  schemaVersion: 1;
  runId: string;
  trial: number;
  timestamp: string;
  environment: Environment;
  strategy: Strategy;
  executionKind: ExecutionKind;
  benchmarkComparable: boolean;
  scenario: Scenario;
  catalogSize: CatalogSize;
  model: string | null;
  latencyMs: number;
  toolCalls: number;
  modelCalls: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  billableTokens: number | null;
  completion: boolean;
  correct: boolean;
  errors: number;
  retries: number | null;
  peakMemoryBytes: number | null;
  metricSources: Record<string, MetricSource>;
  details: Record<string, unknown>;
}
