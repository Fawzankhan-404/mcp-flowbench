#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { runTrial } from "./engine.js";
import { writeResults } from "./report.js";
import {
  catalogSizes,
  scenarios,
  type BenchmarkConfig,
  type CatalogSize,
  type Environment,
  type Scenario,
  type Strategy,
} from "./types.js";

interface CliOptions {
  environment: Environment;
  strategy: Strategy;
  scenario: Scenario[];
  catalogSize: CatalogSize[];
  trials: number;
  output: string;
  model?: string;
}

function value(
  args: string[],
  flag: string,
  fallback?: string,
): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const next = args[index + 1];
  if (!next || next.startsWith("--"))
    throw new Error(`${flag} requires a value`);
  return next;
}

export function parseArgs(args: string[]): CliOptions {
  if (args[0] === "--") args = args.slice(1);
  if (args.includes("--help") || args.includes("-h")) throw new Error("HELP");
  const allowed = new Set([
    "--environment",
    "--strategy",
    "--scenario",
    "--catalog-size",
    "--trials",
    "--output",
    "--model",
  ]);
  for (const arg of args) {
    if (arg.startsWith("--") && !allowed.has(arg))
      throw new Error(`Unknown option: ${arg}`);
  }
  const environment = value(args, "--environment", "offline") as Environment;
  const strategy = value(args, "--strategy", "direct") as Strategy;
  if (!["offline", "live"].includes(environment))
    throw new Error("--environment must be offline or live");
  if (!["direct", "programmatic"].includes(strategy))
    throw new Error("--strategy must be direct or programmatic");
  if (environment === "offline" && strategy !== "direct")
    throw new Error(
      "Offline mode does not emulate programmatic execution. Use live mode for real PTC.",
    );
  const requestedScenarios = (value(args, "--scenario", "all") ?? "all").split(
    ",",
  );
  const selectedScenarios = requestedScenarios.includes("all")
    ? [...scenarios]
    : requestedScenarios;
  if (selectedScenarios.some((item) => !scenarios.includes(item as Scenario)))
    throw new Error(`Unknown scenario. Choose: ${scenarios.join(", ")}`);
  const requestedSizes = (value(args, "--catalog-size", "5") ?? "5")
    .split(",")
    .map(Number);
  if (
    requestedSizes.some((size) => !catalogSizes.includes(size as CatalogSize))
  )
    throw new Error("Catalog size must be one of 5, 20, 50, 100");
  const trials = Number(value(args, "--trials", "1"));
  if (!Number.isSafeInteger(trials) || trials < 1 || trials > 1000)
    throw new Error("--trials must be an integer from 1 to 1000");
  const output = resolve(value(args, "--output", "results")!);
  const model = value(args, "--model");
  if (environment === "live" && !model)
    throw new Error("Live mode requires --model <supported Responses model>");
  return {
    environment,
    strategy,
    scenario: selectedScenarios as Scenario[],
    catalogSize: requestedSizes as CatalogSize[],
    trials,
    output,
    ...(model ? { model } : {}),
  };
}

const help = `MCP FlowBench\n\nUsage:\n  pnpm run build\n  pnpm run flowbench -- --environment offline --strategy direct --scenario all --catalog-size 5,20,50,100 --trials 1 --output results\n  OPENAI_API_KEY=... pnpm run flowbench -- --environment live --strategy programmatic --scenario dependent-calls --catalog-size 20 --trials 20 --model <supported-model>\n\nLive mode uses real OpenAI Agents JS calls and may incur API charges. Offline mode is a deterministic MCP harness only; it does not simulate PTC.\n`;

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof Error && error.message === "HELP") {
      process.stdout.write(help);
      return;
    }
    throw error;
  }
  if (options.environment === "live" && !process.env.OPENAI_API_KEY)
    throw new Error("Live mode requires OPENAI_API_KEY");
  const results = [];
  const runId = `${options.environment}-${randomUUID()}`;
  for (const catalogSize of options.catalogSize) {
    for (const scenario of options.scenario) {
      for (let trial = 1; trial <= options.trials; trial += 1) {
        const config: BenchmarkConfig = {
          environment: options.environment,
          strategy: options.strategy,
          scenario,
          catalogSize,
          trials: options.trials,
          outputDir: options.output,
          runId,
          ...(options.model ? { model: options.model } : {}),
        };
        const result = await runTrial(config, trial);
        results.push(result);
        process.stdout.write(
          `${scenario} ${catalogSize} ${trial}/${options.trials}: ${result.correct ? "correct" : "incorrect"} (${result.latencyMs.toFixed(1)} ms)\n`,
        );
      }
    }
  }
  const resultClass =
    options.environment === "offline" ? "offline" : `live-${options.strategy}`;
  const paths = await writeResults(
    resolve(options.output, resultClass),
    results,
  );
  process.stdout.write(
    `Raw results: ${paths.jsonl}\nJSON summary: ${paths.json}\nMarkdown summary: ${paths.markdown}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
