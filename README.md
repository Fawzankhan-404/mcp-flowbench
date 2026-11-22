<div align="center">

# MCP FlowBench

### A reproducible benchmark for MCP-backed tool calling

Compare direct calls with **real Programmatic Tool Calling (PTC)** in OpenAI Agents JS using controlled tasks, schemas, permissions, and fixtures.

[![CI](https://img.shields.io/github/actions/workflow/status/Fawzankhan-404/mcp-flowbench/ci.yml?branch=main&label=CI)](https://github.com/Fawzankhan-404/mcp-flowbench/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Fawzankhan-404/mcp-flowbench?label=release)](https://github.com/Fawzankhan-404/mcp-flowbench/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f62.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-43853d.svg)](https://nodejs.org/)

</div>

> **Research MVP · v0.1.0** — Offline correctness checks are ready. Live model evaluations are opt-in and have not yet been run. No speed, cost, or token-savings claims are made.

## Why FlowBench?

As tool catalogs grow, developers need a clear way to study how agents select and orchestrate tools. FlowBench provides a small, deterministic environment for comparing direct invocation with OpenAI Agents JS's supported PTC API under the same benchmark conditions.

| At a glance             |                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------- |
| **10 scenarios**        | Lookup, parallel and dependent calls, pagination, errors, permissions, and more |
| **4 catalog sizes**     | 5, 20, 50, and 100 synthetic MCP tools                                          |
| **Two execution modes** | Offline deterministic validation and opt-in live Agents JS runs                 |
| **Auditable outputs**   | JSONL trial records with JSON and Markdown summaries                            |

## What is actually evaluated

| Mode                    | What runs                                                                                                                                       | What it tells you                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Offline**             | Official MCP TypeScript SDK client/server protocol, shared schemas, permissions, scenario verifiers, and a deterministic harness                | Correctness and harness behavior. No model runs, PTC simulation, or token estimates. Offline rows are marked non-comparable.                               |
| **Live · direct**       | A real model through OpenAI Agents JS function tools, restricted to `allowedCallers: ['direct']`                                                | Direct tool invocation behavior on the selected task and fixture.                                                                                          |
| **Live · programmatic** | A real Responses model through `programmaticToolCallingTool()`, with the same MCP-backed tools restricted to `allowedCallers: ['programmatic']` | Genuine Agents JS PTC behavior. Generated code uses the provider-supported execution boundary; FlowBench never runs model-generated code in local Node.js. |

Both live strategies use the same task, tool schemas, permissions, and fixed fixture data. They run against separate fixture instances through a local MCP client adapter and deterministic in-memory MCP server. This does **not** measure OpenAI's hosted `hostedMcpTool`, a remote MCP transport, or its network overhead.

## Quick start: offline mode

**Requirements:** Node.js 20 or later and pnpm 11.25.0.

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run flowbench -- --environment offline --strategy direct --scenario all --catalog-size 5,20,50,100 --trials 1 --output results
```

Offline mode needs no API key. It validates the deterministic harness and scenario verifiers; it does not execute an agent or imitate PTC.

### Development checks

```bash
pnpm format:check
pnpm lint
pnpm licenses:check
pnpm typecheck
pnpm test
pnpm build
```

## Opt-in: live Agents JS runs

Live evaluations make model requests and may incur API charges. Select a supported Responses model and set `OPENAI_API_KEY` in the process environment before running. The CLI does not load `.env` files.

```bash
pnpm run build

pnpm run flowbench -- --environment live --strategy direct \
  --scenario dependent-calls --catalog-size 20 --trials 20 \
  --model <supported-responses-model> --output results

pnpm run flowbench -- --environment live --strategy programmatic \
  --scenario dependent-calls --catalog-size 20 --trials 20 \
  --model <supported-responses-model> --output results
```

Use the same scenario, catalog size, model, and trial count for each strategy. The strategy instruction and `allowedCallers` intentionally differ to select direct versus PTC execution. PTC trials without scenario-specific successful MCP evidence are marked non-comparable.

Results are separated by mode and strategy. Median latency is reported; p95 is omitted below 20 trials. Provider usage, retries, billable tokens, and peak memory are `null` when the provider does not supply them. Runs abort after 90 seconds.

An opt-in six-trial example is available in [`configs/live-smoke.json`](configs/live-smoke.json). It is not run automatically. Its cost estimate is an assumption, **not a spending limit**; actual charges may be higher. Set an explicit spend cap before authorizing live runs.

## Scenarios and data

The synthetic catalog covers employee lookup, department retrieval, task search and pagination, report aggregation, and classroom queries. The 10 scenarios are:

`single-lookup` · `independent-calls` · `dependent-calls` · `large-catalog` · `large-response` · `pagination` · `partial-failure` · `concurrent-discovery` · `cache-invalidation` · `permission-denied`

Ordinary benchmark runs use fixed synthetic data. Live JSONL records synthetic tool arguments and outputs, so review results before sharing. Never put credentials in source, prompts, or result artifacts.

## Research scope

- [OpenAI Agents JS PTC guide](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling) documents the live PTC mechanism; offline mode does not simulate it.
- [Cloudflare Code Mode](https://developers.cloudflare.com/agent-setup/command-code/) is a related code-oriented tool design with a sandboxed runtime; it is not implemented or measured here.
- [MCPMark](https://github.com/eval-sys/mcpmark) and [MCP-Atlas](https://github.com/scaleapi/mcp-atlas) study broader tasks and realistic MCP environments. FlowBench's synthetic fixture is smaller and aimed at controlled comparisons.
- [PTC-Bench](https://arxiv.org/abs/2611.01446) studies long-horizon programmatic tool use. FlowBench covers short, deterministic scenarios and does not reproduce its scope.

These projects address different questions. FlowBench does not claim to be first, comprehensive, or superior. See [`docs/benchmarks/methodology.md`](docs/benchmarks/methodology.md) and [`docs/research/gap-analysis.md`](docs/research/gap-analysis.md) for the benchmark rationale and limitations.

## Contributing

Contributions that improve reproducibility, scenario coverage, verifier quality, or documentation are welcome. Please include the exact command and environment for benchmark or bug reports, and distinguish measured results from estimates.

FlowBench's [Agents JS issue #2047 follow-up](https://github.com/openai/openai-agents-js/issues/2047#issuecomment-7076888746) shares an independently verified reproduction on Agents SDK 0.22.0. It is a confirmation of an existing report, not a claim of discovering the issue.

## License

MIT — see [`LICENSE`](LICENSE).

**Topics:** #MCP #OpenAI #AgentsSDK #TypeScript #Benchmarking #ProgrammaticToolCalling #DeveloperTools
