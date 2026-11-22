# Milestone 3 audit and implementation report

Date: 2026-11-22

## Scope reviewed

Reviewed the source and tests in `src/fixture.ts`, `src/adapter.ts`, `src/engine.ts`, `src/scenarios.ts`, `src/types.ts`, `src/report.ts`, and `src/cli.ts`; all `tests/*.test.ts`; `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.github/workflows/ci.yml`, `README.md`, and `docs/benchmarks/methodology.md`. Existing Milestone 2 report and `results/milestone2` data were inspected and preserved. `docs/research/gap-analysis.md` was not edited.

## Findings and changes

### Medium — tool allowlist was not reflected in exposed schemas (fixed)

`McpToolAdapter.agentsTools(strategy, allowedTools)` exposed tools allowed by the adapter constructor even if the per-run allowlist excluded them. The callback denied those calls later, but the model could still see them. Tool definitions are now filtered to the intersection of both allowlists, and the same effective set is checked during execution. Added an adapter test proving a disallowed tool is neither exposed nor dispatched.

### Medium — live correctness and comparability lacked call evidence (fixed)

Live correctness previously checked only final JSON values, while comparability required only one tool call. A model could return fabricated values or make an irrelevant call and still be counted. Each adapter call now records tool name, arguments, success, result, and error. Live verification requires the relevant scenario trace: correct lookup arguments, both independent calls, department then report, the large response, pagination cursor handoff, partial failure plus success, discovery/cache conditions, or a pre-dispatch permission denial. Final-answer correctness remains a separate criterion.

### Medium — direct instructions biased the paired PTC condition (fixed)

Both conditions use the same scenario task prompt, fixture data, schemas, allowlist policy, and verifiers. Strategy-specific instructions now select direct calls versus PTC; the tools themselves enforce `allowedCallers: ['direct']` or `allowedCallers: ['programmatic']`, respectively. The difference in routing instruction, schema exposure overhead, and program execution overhead is intentional and should be included in any later paired analysis.

### Low — result aggregation could combine models (fixed)

Summary grouping omitted model identity. Model is now part of the aggregation key. CLI artifact roots are explicitly classified as `offline`, `live-direct`, or `live-programmatic`.

### Low — live setup cleanup and timeout (fixed)

The 90-second Agents JS run timeout uses its supported `AbortSignal` option. The synthetic MCP fixture is closed in a `finally` covering discovery, tool construction, agent construction, and execution, so setup failures do not leak connections.

### Informational — no approval-based operation is implemented

The fixture contains read-only synthetic operations and one hard-denied restricted department identifier. The adapter denies it before MCP dispatch and tests assert the server sees zero calls. There is no user approval workflow, write-capable operation, or approval-gated tool in this MVP; no such behavior is claimed.

### Informational — local MCP transport and tool definitions

The deterministic server and client use the official MCP TypeScript SDK over `InMemoryTransport`. The live comparison adapts MCP tool schemas into Agents JS function tools. It is not a hosted `hostedMcpTool` comparison, nor a network transport benchmark. PTC program execution is delegated to the official Agents JS `programmaticToolCallingTool()` path and is never evaluated in local Node.js.

## Upstream issue #2047

The current public issue remains open and has an existing proposed coalescing remedy plus a competing two-file cache-semantics remedy. No upstream comment was posted. A local HTTP-only reproduction was added at `tests/agents-mcp-2047.test.ts`: it creates a sessionless Streamable HTTP MCP endpoint, delays `tools/list`, overlaps two calls, and verifies one rejection with `MCP tool listing became stale`. Run it with `pnpm exec vitest run tests/agents-mcp-2047.test.ts`. This reproduced against installed `@openai/agents` / `@openai/agents-core` 0.22.0. The installed `dist/mcp.mjs` still invalidates the underlying listing generation for each sessionless request before awaiting the list. No model or API key is used. The installed package metadata does not record a `gitHead`, and this workspace has no Git checkout, so an exact source commit cannot be attributed to the pinned npm package.

The failure is in the Agents SDK's `MCPServerStreamableHttp` wrapper, which this benchmark does not use: FlowBench routes tools using its own MCP SDK client adapter. Therefore the reproduction is an upstream characterization, not evidence that FlowBench concurrent discovery fails. Correct behavior for the wrapper is that two overlapping fresh sessionless listings both resolve; any upstream remedy should also preserve post-invalidation freshness and avoid stale cache writes. The minimal suggested fix already present in the issue is to share/coalesce the in-flight sessionless listing promise, then clear it when settled; an alternative existing suggestion removes cache-generation invalidation on the sessionless path while forcing uncached underlying listings. The project does not duplicate or submit either proposal.

## Live smoke configuration and cost gate

`configs/live-smoke.json` records direct and PTC runs for single lookup, independent calls, and dependent calls, with catalog size 5 and one trial per condition. GPT-6.2 Astra is used as the candidate because the official PTC guide demonstrates it with `programmatic_tool_calling` and programmatic-only tools. The config itself is inert; separate CLI invocations are documented in the README.

Planning estimate: six trials × 20,000 assumed input tokens × $8/M + six × 4,000 assumed output tokens × $40/M = $1.92; 2× headroom gives **$3.84**. This is an estimate, not an enforceable cap; actual prompt, reasoning, tool cycles, token mix, and billing can exceed it. Live evaluation was not run: no `OPENAI_API_KEY` was present and no authorized budget limit was configured. There are no live token or latency measurements, and no performance or savings claim is made.

## Publication-readiness status

- Frozen install and local quality gates are recorded in the final task report.
- CI runs install, formatting, lint, license allowlist check, typecheck, tests, and build; Gitleaks secret scanning is configured. The workflow actions use Node 24-compatible releases (`checkout@v6`, `setup-node@v7`, Gitleaks `@v3`, pnpm setup `@v6`). The workflow itself was not run on GitHub because no Git remote/repository is present.
- Local Gitleaks scan completed with no leaks. A managed Standard security review was launched but made no progress beyond its threat-model phase for about 14 minutes; it was canceled without findings. Therefore this report is a source-level review plus the local secret scan, not a completed managed security assessment.
- Production dependency licenses installed locally were MIT, Apache-2.0, ISC, and BlueOak-1.0.0. The full installed dependency tree also includes BSD-2-Clause, BSD-3-Clause, and MPL-2.0. The MPL-2.0 packages are `lightningcss` and its Windows binary, pulled transitively by Vite for Vitest tooling; they are development-only. The CI allowlist checks all installed dependency licenses and fails on an unreviewed identifier. The lockfile pins direct dependencies.
- This workspace has no `.git` metadata or remote, so clean-tree state, commit provenance, and first-release history cannot be independently established here. No repository, remote, commit, push, package publication, or issue comment was created.
- Release readiness remains conditional on a Git-backed review, CI execution on GitHub, a live smoke authorized with an explicit spend ceiling, and review of the observed PTC traces/results. No live comparison is claimed.

## Reproduction commands

```powershell
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm licenses:check
pnpm typecheck
pnpm test
pnpm build
pnpm run flowbench -- --environment offline --strategy direct --scenario all --catalog-size 5,20,50,100 --trials 1 --output results/milestone3
```
