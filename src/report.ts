import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cpus, totalmem } from "node:os";
import type { TrialResult } from "./types.js";

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? sorted.at(-1)!;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

export function summarize(results: TrialResult[]) {
  const groups = new Map<string, TrialResult[]>();
  for (const result of results) {
    const key = [
      result.environment,
      result.strategy,
      result.model ?? "<offline>",
      result.scenario,
      result.catalogSize,
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups.values()].map((rows) => {
    const latencies = rows.map((row) => row.latencyMs);
    const p95 = rows.length >= 20 ? percentile(latencies, 0.95) : null;
    return {
      environment: rows[0]!.environment,
      strategy: rows[0]!.strategy,
      executionKind: rows[0]!.executionKind,
      benchmarkComparable: rows.every((row) => row.benchmarkComparable),
      model: rows[0]!.model,
      scenario: rows[0]!.scenario,
      catalogSize: rows[0]!.catalogSize,
      trials: rows.length,
      medianLatencyMs: median(latencies),
      p95LatencyMs: p95,
      completionRate: rows.filter((row) => row.completion).length / rows.length,
      correctnessRate: rows.filter((row) => row.correct).length / rows.length,
      meanToolCalls:
        rows.reduce((sum, row) => sum + row.toolCalls, 0) / rows.length,
      meanModelCalls: meanNullable(rows.map((row) => row.modelCalls)),
      meanInputTokens: meanNullable(rows.map((row) => row.inputTokens)),
      meanOutputTokens: meanNullable(rows.map((row) => row.outputTokens)),
      meanColdDiscoveryMs: meanNullable(
        rows.map((row) => numericDetail(row, "coldDiscoveryLatencyMs")),
      ),
      meanWarmDiscoveryMs: meanNullable(
        rows.map((row) => numericDetail(row, "warmDiscoveryLatencyMs")),
      ),
      errors: rows.reduce((sum, row) => sum + row.errors, 0),
      tokenDataSource: rows[0]!.metricSources.inputTokens,
    };
  });
}

function meanNullable(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length
    ? available.reduce((sum, value) => sum + value, 0) / available.length
    : null;
}

function numericDetail(row: TrialResult, key: string): number | null {
  const value = row.details[key];
  return typeof value === "number" ? value : null;
}

export async function writeResults(
  outputDir: string,
  results: TrialResult[],
): Promise<{ jsonl: string; json: string; markdown: string }> {
  await mkdir(outputDir, { recursive: true });
  const suffix = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const jsonl = join(outputDir, `flowbench-${suffix}.jsonl`);
  const json = join(outputDir, `flowbench-${suffix}.summary.json`);
  const markdown = join(outputDir, `flowbench-${suffix}.summary.md`);
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? null,
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      sdkVersions: { agentsJs: "0.22.0", mcpTypeScriptSdk: "2.4.0" },
    },
    notes: [
      "Offline rows are deterministic MCP harness runs, not model evaluations and not simulated PTC.",
      "Live PTC rows use OpenAI Agents JS programmaticToolCallingTool with programmatic-only MCP-backed function tools.",
      "Token fields are provider-reported only in live runs; unavailable values remain null.",
      "p95 is omitted when fewer than 20 trials are present.",
    ],
    results: summarize(results),
  };
  const table = summary.results
    .map(
      (row) =>
        `| ${row.environment} | ${row.strategy} | ${row.model ?? "—"} | ${row.scenario} | ${row.catalogSize} | ${row.trials} | ${row.medianLatencyMs?.toFixed(2) ?? "—"} | ${row.p95LatencyMs?.toFixed(2) ?? "n<20"} | ${row.correctnessRate.toFixed(2)} | ${row.meanInputTokens?.toFixed(1) ?? "—"} | ${row.meanOutputTokens?.toFixed(1) ?? "—"} |`,
    )
    .join("\n");
  const md = [
    "# MCP FlowBench results",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "> Offline rows validate the deterministic MCP harness only. They do not measure an LLM or PTC. Live programmatic rows execute through the OpenAI Agents JS SDK.",
    "",
    "| Environment | Strategy | Model | Scenario | Tools | Trials | Median ms | p95 ms | Correctness | Input tokens | Output tokens |",
    "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|",
    table,
    "",
    "Raw trials are stored in the paired JSONL file. Null token values mean provider usage was unavailable or no provider call was made; no values are estimated.",
    "",
  ].join("\n");
  await writeFile(
    jsonl,
    `${results.map((row) => JSON.stringify(row)).join("\n")}\n`,
    "utf8",
  );
  await writeFile(json, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(markdown, md, "utf8");
  return { jsonl, json, markdown };
}
