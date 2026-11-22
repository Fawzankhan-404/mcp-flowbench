# Benchmark methodology

## Comparison boundary

Both live strategies expose the same MCP tool names, descriptions, Zod schemas, fixture data, verifier, and permission checks. The Agents JS adapter forwards calls through the official MCP TypeScript SDK client to an in-memory MCP server. Direct tools use `allowedCallers: ['direct']`; PTC tools use `allowedCallers: ['programmatic']` and `programmaticToolCallingTool()`. PTC is only recorded as an Agents SDK execution when the live run actually invokes the programmatic-only tools.

Offline runs execute deterministic harness steps over the MCP protocol and adapter. They validate data, errors, permissions, discovery behavior, and reporting only. They do not run an Agent, simulate program code, or provide comparable model measurements.

## Metrics

Latency, adapter tool calls, and adapter errors are measured locally. Live request and token counts are read from `RunResult.state.usage`; no tokenizer estimates or inferred billable-token values are emitted. Model usage missing from provider results stays null. Retries and peak memory are null because this MVP does not have a reliable SDK retry counter or sampling profiler.

Every raw trial is JSONL with the selected model, environment, strategy, scenario, catalog size, correctness, completion, latency, calls, errors, and metric provenance. Summary latency is median; p95 uses nearest-rank and is omitted below 20 trials. Failures are retained as trial rows.

## Synthetic data and scenarios

The fixture contains fixed fake employees, departments, tasks, courses, assignments, and reports. Tool errors are deterministic for the `failure-case` search. `D-RESTRICTED` is denied by the shared client adapter before MCP dispatch; the synthetic handler also returns an MCP error if called directly. Large output is bounded to 80 records.
