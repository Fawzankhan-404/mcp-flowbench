import { Agent, programmaticToolCallingTool, run } from "@openai/agents";
import { performance } from "node:perf_hooks";
import { DiscoveryCache, McpToolAdapter } from "./adapter.js";
import { createSyntheticMcpFixture, type ToolDescriptor } from "./fixture.js";
import { scenarioPrompt } from "./scenarios.js";
import { strategyInstruction } from "./scenarios.js";
import type {
  BenchmarkConfig,
  CatalogSize,
  Scenario,
  TrialResult,
} from "./types.js";

const familyTool = (
  catalog: ToolDescriptor[],
  family: ToolDescriptor["family"],
): ToolDescriptor => {
  const match = catalog.find((item) => item.family === family);
  if (!match) throw new Error(`Catalog lacks required tool family ${family}`);
  return match;
};

const sampleArgs = (descriptor: ToolDescriptor): Record<string, unknown> => {
  switch (descriptor.family) {
    case "employee_lookup":
      return { employeeId: "E-0042" };
    case "department_retrieve":
      return { departmentId: "D-07" };
    case "task_search":
      return { query: "all", pageSize: 2 };
    case "report_aggregate":
      return { departmentId: "D-07", detail: "summary" };
    case "classroom_query":
      return { query: "MCP", kind: "courses" };
  }
};

const parseFinalJson = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (typeof value !== "string")
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

function verify(
  scenario: Scenario,
  observed: Record<string, unknown> | undefined,
): boolean {
  if (!observed) return false;
  switch (scenario) {
    case "single-lookup":
    case "large-catalog":
    case "concurrent-discovery":
    case "cache-invalidation":
      return observed.employeeId === "E-0042" && observed.name === "Asha Rao";
    case "independent-calls":
      return (
        observed.employeeId === "E-0042" && observed.departmentId === "D-07"
      );
    case "dependent-calls":
      return observed.departmentId === "D-07" && observed.totalTasks === 7;
    case "large-response":
      return (
        observed.departmentId === "D-07" && Number(observed.itemCount) >= 80
      );
    case "pagination": {
      const ids = observed.uniqueTaskIds;
      return (
        Array.isArray(ids) &&
        ids.length >= 4 &&
        new Set(ids).size === ids.length
      );
    }
    case "partial-failure":
      return observed.searchFailed === true && observed.totalTasks === 7;
    case "permission-denied":
      return observed.denied === true;
  }
}

function hasRequiredEvidence(
  config: BenchmarkConfig,
  ledger: McpToolAdapter["callLedger"],
  discoveryDetails: Record<string, unknown>,
): boolean {
  const ok = ledger.filter((entry) => entry.ok);
  const named = (family: string) =>
    ok.filter((entry) => entry.name.startsWith(`${family}_`));
  switch (config.scenario) {
    case "single-lookup":
      return named("employee_lookup").some(
        (entry) =>
          (entry.arguments as { employeeId?: string }).employeeId === "E-0042",
      );
    case "large-catalog":
      return ok.some(
        (entry) =>
          entry.name === employeeTargetName(config.catalogSize) &&
          (entry.arguments as { employeeId?: string }).employeeId === "E-0042",
      );
    case "concurrent-discovery": {
      const counts = discoveryDetails.concurrentDiscoveryToolCounts;
      return (
        Array.isArray(counts) &&
        counts.length === 2 &&
        counts.every((count) => count === config.catalogSize) &&
        named("employee_lookup").some(
          (entry) =>
            (entry.arguments as { employeeId?: string }).employeeId ===
            "E-0042",
        )
      );
    }
    case "cache-invalidation":
      return (
        discoveryDetails.discoveryLoads === 2 &&
        discoveryDetails.refreshedToolCount === config.catalogSize &&
        named("employee_lookup").some(
          (entry) =>
            (entry.arguments as { employeeId?: string }).employeeId ===
            "E-0042",
        )
      );
    case "independent-calls":
      return (
        named("employee_lookup").length > 0 &&
        named("department_retrieve").some(
          (entry) =>
            (entry.arguments as { departmentId?: string }).departmentId ===
            "D-07",
        )
      );
    case "dependent-calls": {
      const department = named("department_retrieve").find(
        (entry) =>
          (entry.arguments as { departmentId?: string }).departmentId ===
          "D-07",
      );
      return (
        !!department &&
        named("report_aggregate").some(
          (entry) =>
            (entry.arguments as { departmentId?: string }).departmentId ===
            "D-07",
        )
      );
    }
    case "large-response":
      return named("report_aggregate").some(
        (entry) =>
          (entry.arguments as { detail?: string }).detail === "large" &&
          (entry.result as { items?: unknown[] } | undefined)?.items?.length ===
            80,
      );
    case "pagination": {
      const searches = named("task_search");
      if (searches.length < 2) return false;
      const firstResult = searches[0]!.result as
        { nextCursor?: string } | undefined;
      const secondArgs = searches[1]!.arguments as { cursor?: string };
      return (
        !!firstResult?.nextCursor &&
        secondArgs.cursor === firstResult.nextCursor
      );
    }
    case "partial-failure":
      return (
        ledger.some(
          (entry) =>
            entry.name.startsWith("task_search_") &&
            !entry.ok &&
            (entry.arguments as { query?: string }).query === "failure-case",
        ) && named("report_aggregate").length > 0
      );
    case "permission-denied":
      return ledger.some(
        (entry) =>
          entry.name.startsWith("department_retrieve_") &&
          !entry.ok &&
          (entry.arguments as { departmentId?: string }).departmentId ===
            "D-RESTRICTED" &&
          entry.error?.includes("Permission denied"),
      );
  }
}

function employeeTargetName(size: CatalogSize): string {
  const employeeOrdinal = Math.floor((size - 1 - 0) / 5) + 1;
  return `employee_lookup_${String(employeeOrdinal).padStart(3, "0")}`;
}

async function runOfflineScenario(
  scenario: Scenario,
  catalogSize: CatalogSize,
  trial: number,
  runId?: string,
): Promise<TrialResult> {
  const resultRunId =
    runId ?? `offline-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const start = performance.now();
  const fixture = await createSyntheticMcpFixture(catalogSize);
  const adapter = new McpToolAdapter(fixture.client, fixture.catalog);
  const details: Record<string, unknown> = {
    harnessOnly: true,
    note: "No model or PTC execution occurred.",
  };
  let correct = false;
  let completion = true;
  const callFamily = (
    family: ToolDescriptor["family"],
    args: Record<string, unknown>,
  ) => adapter.call(familyTool(fixture.catalog, family).name, args);
  try {
    switch (scenario) {
      case "single-lookup": {
        const employee = await callFamily("employee_lookup", {
          employeeId: "E-0042",
        });
        details.observed = employee;
        correct = verify(scenario, employee as Record<string, unknown>);
        break;
      }
      case "independent-calls": {
        const [employee, department] = await Promise.all([
          callFamily("employee_lookup", { employeeId: "E-0042" }),
          callFamily("department_retrieve", { departmentId: "D-07" }),
        ]);
        const observed = { ...(employee as object), ...(department as object) };
        details.observed = observed;
        correct = verify(scenario, observed);
        break;
      }
      case "dependent-calls": {
        const department = (await callFamily("department_retrieve", {
          departmentId: "D-07",
        })) as { departmentId: string };
        const report = await callFamily("report_aggregate", {
          departmentId: department.departmentId,
          detail: "summary",
        });
        details.observed = report;
        correct = verify(scenario, report as Record<string, unknown>);
        break;
      }
      case "large-catalog": {
        const last = fixture.catalog
          .filter((item) => item.family === "employee_lookup")
          .at(-1)!;
        const observed = await adapter.call(last.name, sampleArgs(last));
        details.targetTool = last.name;
        details.observed = observed;
        correct = verify(scenario, observed as Record<string, unknown>);
        break;
      }
      case "large-response": {
        const report = (await callFamily("report_aggregate", {
          departmentId: "D-07",
          detail: "large",
        })) as { departmentId: string; items: unknown[] };
        const observed = {
          departmentId: report.departmentId,
          itemCount: report.items.length,
        };
        details.observed = observed;
        details.responseItemCount = report.items.length;
        correct = verify(scenario, observed);
        break;
      }
      case "pagination": {
        const first = (await callFamily("task_search", {
          query: "all",
          pageSize: 2,
        })) as { items: Array<{ taskId: string }>; nextCursor: string };
        const second = (await callFamily("task_search", {
          query: "all",
          cursor: first.nextCursor,
          pageSize: 2,
        })) as { items: Array<{ taskId: string }> };
        const observed = {
          uniqueTaskIds: [...first.items, ...second.items].map(
            (item) => item.taskId,
          ),
        };
        details.observed = observed;
        correct = verify(scenario, observed);
        break;
      }
      case "partial-failure": {
        let searchFailed = false;
        try {
          await callFamily("task_search", {
            query: "failure-case",
            pageSize: 2,
          });
        } catch {
          searchFailed = true;
        }
        const report = (await callFamily("report_aggregate", {
          departmentId: "D-07",
          detail: "summary",
        })) as { totalTasks: number };
        const observed = { searchFailed, totalTasks: report.totalTasks };
        details.observed = observed;
        correct = verify(scenario, observed);
        break;
      }
      case "concurrent-discovery": {
        const [first, second] = await Promise.all([
          fixture.client.listTools(),
          fixture.client.listTools(),
        ]);
        const employee = await callFamily("employee_lookup", {
          employeeId: "E-0042",
        });
        const observed = { ...(employee as object) };
        details.discoveryRequestCount = 2;
        details.discoveredToolCounts = [
          first.tools.length,
          second.tools.length,
        ];
        correct =
          first.tools.length === catalogSize &&
          second.tools.length === catalogSize &&
          verify(scenario, observed);
        details.observed = observed;
        break;
      }
      case "cache-invalidation": {
        let loads = 0;
        const cache = new DiscoveryCache(async () => {
          loads += 1;
          return fixture.client.listTools();
        });
        let mark = performance.now();
        await cache.get();
        const coldDiscoveryLatencyMs = performance.now() - mark;
        mark = performance.now();
        await cache.get();
        const warmDiscoveryLatencyMs = performance.now() - mark;
        cache.invalidate();
        mark = performance.now();
        const fresh = await cache.get();
        const refreshedDiscoveryLatencyMs = performance.now() - mark;
        const employee = await callFamily("employee_lookup", {
          employeeId: "E-0042",
        });
        details.discoveryLoads = loads;
        details.coldDiscoveryLatencyMs = coldDiscoveryLatencyMs;
        details.warmDiscoveryLatencyMs = warmDiscoveryLatencyMs;
        details.refreshedDiscoveryLatencyMs = refreshedDiscoveryLatencyMs;
        details.refreshedToolCount = fresh.tools.length;
        details.observed = employee;
        correct =
          loads === 2 &&
          fresh.tools.length === catalogSize &&
          verify(scenario, employee as Record<string, unknown>);
        break;
      }
      case "permission-denied": {
        let denied = false;
        try {
          await callFamily("department_retrieve", {
            departmentId: "D-RESTRICTED",
          });
        } catch {
          denied = true;
        }
        const departmentCalls = [...fixture.callCounts.entries()]
          .filter(([name]) => name.startsWith("department_retrieve"))
          .reduce((sum, [, count]) => sum + count, 0);
        const observed = { denied };
        details.observed = observed;
        details.serverDispatchCount = departmentCalls;
        correct = denied && departmentCalls === 0 && verify(scenario, observed);
        break;
      }
    }
  } catch (error) {
    completion = false;
    details.failure = error instanceof Error ? error.message : String(error);
  } finally {
    await fixture.close();
  }
  const latencyMs = performance.now() - start;
  return {
    schemaVersion: 1,
    runId: resultRunId,
    trial,
    timestamp: new Date().toISOString(),
    environment: "offline",
    strategy: "direct",
    executionKind: "offline-harness",
    benchmarkComparable: false,
    scenario,
    catalogSize,
    model: null,
    latencyMs,
    toolCalls: adapter.calls,
    modelCalls: 0,
    inputTokens: null,
    outputTokens: null,
    billableTokens: null,
    completion,
    correct,
    errors: adapter.errors,
    retries: null,
    peakMemoryBytes: null,
    metricSources: {
      latencyMs: "instrumented",
      toolCalls: "instrumented",
      errors: "instrumented",
      tokens: "unavailable",
      modelCalls: "instrumented",
      discoveryLatency:
        scenario === "cache-invalidation" ? "instrumented" : "unavailable",
    },
    details,
  };
}

function extractJson(value: unknown): Record<string, unknown> | undefined {
  return parseFinalJson(value);
}

async function runLiveScenario(
  config: BenchmarkConfig,
  trial: number,
): Promise<TrialResult> {
  if (!process.env.OPENAI_API_KEY)
    throw new Error("Live mode requires OPENAI_API_KEY.");
  if (!config.model)
    throw new Error("Live mode requires --model <supported Responses model>.");
  const resultRunId =
    config.runId ??
    `live-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const start = performance.now();
  const fixture = await createSyntheticMcpFixture(config.catalogSize);
  try {
    const adapter = new McpToolAdapter(fixture.client, fixture.catalog);
    const targetTool = fixture.catalog
      .filter((item) => item.family === "employee_lookup")
      .at(-1)!.name;
    const discoveryDetails: Record<string, unknown> = {};
    if (config.scenario === "concurrent-discovery") {
      const [first, second] = await Promise.all([
        fixture.client.listTools(),
        fixture.client.listTools(),
      ]);
      discoveryDetails.concurrentDiscoveryToolCounts = [
        first.tools.length,
        second.tools.length,
      ];
    }
    if (config.scenario === "cache-invalidation") {
      let loads = 0;
      const cache = new DiscoveryCache(async () => {
        loads += 1;
        return fixture.client.listTools();
      });
      let mark = performance.now();
      await cache.get();
      discoveryDetails.coldDiscoveryLatencyMs = performance.now() - mark;
      mark = performance.now();
      await cache.get();
      discoveryDetails.warmDiscoveryLatencyMs = performance.now() - mark;
      cache.invalidate();
      mark = performance.now();
      const fresh = await cache.get();
      discoveryDetails.refreshedDiscoveryLatencyMs = performance.now() - mark;
      discoveryDetails.discoveryLoads = loads;
      discoveryDetails.refreshedToolCount = fresh.tools.length;
    }
    const mcpTools = await adapter.agentsTools(config.strategy);
    const tools =
      config.strategy === "programmatic"
        ? [...mcpTools, programmaticToolCallingTool()]
        : mcpTools;
    const agent = new Agent({
      name: `MCP FlowBench ${config.strategy}`,
      model: config.model,
      instructions: `Complete the requested synthetic MCP task accurately. Use the exposed tools; tool errors may be returned as {error}. ${strategyInstruction(config.strategy)} Return only a JSON object with the requested fields.`,
      tools,
    });
    let completion = false;
    let observed: Record<string, unknown> | undefined;
    let failure: string | undefined;
    let modelCalls: number | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    try {
      const result = await run(
        agent,
        scenarioPrompt(config.scenario, targetTool),
        { signal: AbortSignal.timeout(90_000) },
      );
      completion =
        typeof result.finalOutput === "string" && result.finalOutput.length > 0;
      observed = extractJson(result.finalOutput);
      modelCalls = result.state.usage.requests;
      inputTokens = result.state.usage.inputTokens;
      outputTokens = result.state.usage.outputTokens;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    const correct =
      verify(config.scenario, observed) &&
      hasRequiredEvidence(config, adapter.callLedger, discoveryDetails);
    return {
      schemaVersion: 1,
      runId: resultRunId,
      trial,
      timestamp: new Date().toISOString(),
      environment: "live",
      strategy: config.strategy,
      executionKind: "openai-agents-js",
      benchmarkComparable: hasRequiredEvidence(
        config,
        adapter.callLedger,
        discoveryDetails,
      ),
      scenario: config.scenario,
      catalogSize: config.catalogSize,
      model: config.model,
      latencyMs: performance.now() - start,
      toolCalls: adapter.calls,
      modelCalls,
      inputTokens,
      outputTokens,
      billableTokens: null,
      completion,
      correct,
      errors: adapter.errors,
      retries: null,
      peakMemoryBytes: null,
      metricSources: {
        latencyMs: "instrumented",
        toolCalls: "instrumented",
        errors: "instrumented",
        modelCalls: modelCalls === null ? "unavailable" : "provider",
        inputTokens: inputTokens === null ? "unavailable" : "provider",
        outputTokens: outputTokens === null ? "unavailable" : "provider",
        billableTokens: "unavailable",
        retries: "unavailable",
        peakMemoryBytes: "unavailable",
        discoveryLatency:
          config.scenario === "cache-invalidation"
            ? "instrumented"
            : "unavailable",
      },
      details: {
        ...discoveryDetails,
        observed: observed ?? null,
        failure: failure ?? null,
        executionPath:
          config.strategy === "programmatic"
            ? "Agents JS programmaticToolCallingTool with programmatic-only function tools"
            : "Agents JS direct function-tool calls",
        allowlistedToolCount: fixture.catalog.length,
        callLedger: adapter.callLedger,
      },
    };
  } finally {
    await fixture.close();
  }
}

export async function runTrial(
  config: BenchmarkConfig,
  trial: number,
): Promise<TrialResult> {
  if (config.environment === "offline") {
    if (config.strategy !== "direct")
      throw new Error(
        "Offline mode does not simulate PTC. Use live mode with --strategy programmatic for genuine Agents JS PTC.",
      );
    return runOfflineScenario(
      config.scenario,
      config.catalogSize,
      trial,
      config.runId,
    );
  }
  return runLiveScenario(config, trial);
}
