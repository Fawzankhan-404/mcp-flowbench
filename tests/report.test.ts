import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { summarize, writeResults } from "../src/report.js";
import type { TrialResult } from "../src/types.js";

const makeResult = (trial: number): TrialResult => ({
  schemaVersion: 1,
  runId: "test",
  trial,
  timestamp: new Date(0).toISOString(),
  environment: "offline",
  strategy: "direct",
  executionKind: "offline-harness",
  benchmarkComparable: false,
  scenario: "single-lookup",
  catalogSize: 5,
  model: null,
  latencyMs: trial,
  toolCalls: 1,
  modelCalls: 0,
  inputTokens: null,
  outputTokens: null,
  billableTokens: null,
  completion: true,
  correct: true,
  errors: 0,
  retries: null,
  peakMemoryBytes: null,
  metricSources: { inputTokens: "unavailable" },
  details: { harnessOnly: true },
});

describe("result artifacts", () => {
  it("reports a true median and only emits p95 with at least 20 trials", () => {
    const short = summarize([makeResult(1), makeResult(2)]);
    expect(short[0]?.medianLatencyMs).toBe(1.5);
    expect(short[0]?.p95LatencyMs).toBeNull();
    const repeated = summarize(
      Array.from({ length: 20 }, (_, index) => makeResult(index + 1)),
    );
    expect(repeated[0]?.medianLatencyMs).toBe(10.5);
    expect(repeated[0]?.p95LatencyMs).toBe(19);
  });

  it("keeps different model versions in separate summary groups", () => {
    const rows = [
      {
        ...makeResult(1),
        environment: "live" as const,
        executionKind: "openai-agents-js" as const,
        model: "model-a",
      },
      {
        ...makeResult(2),
        environment: "live" as const,
        executionKind: "openai-agents-js" as const,
        model: "model-b",
      },
    ];
    expect(summarize(rows)).toHaveLength(2);
  });

  it("writes JSONL trials and summaries without filling unavailable tokens", async () => {
    const folder = await mkdtemp(join(tmpdir(), "flowbench-"));
    try {
      const paths = await writeResults(folder, [makeResult(1)]);
      expect(
        (await readFile(paths.jsonl, "utf8")).trim().split("\n"),
      ).toHaveLength(1);
      expect(await readFile(paths.markdown, "utf8")).toContain(
        "do not measure an LLM or PTC",
      );
      const summary = JSON.parse(await readFile(paths.json, "utf8")) as {
        results: Array<{
          meanInputTokens: number | null;
          p95LatencyMs: number | null;
        }>;
      };
      expect(summary.results[0]?.meanInputTokens).toBeNull();
      expect(summary.results[0]?.p95LatencyMs).toBeNull();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
