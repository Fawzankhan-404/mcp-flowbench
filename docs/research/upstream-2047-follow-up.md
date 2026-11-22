# OpenAI Agents JS issue #2047 follow-up

Checked 2026-11-22. This note is a preparation draft only; no upstream comment was submitted.

## Current upstream state

- [Issue #2047](https://github.com/openai/openai-agents-js/issues/2047) is open. Its body reports the race and supplies a complete delayed, sessionless HTTP reproducer. The thread has one maintainer/community follow-up comment, which independently traces the generation invalidation, suggests a two-hunk alternative, and supplies a lifecycle regression test plus validation results. The original issue author proposed coalescing the sessionless in-flight request.
- The issue already contains expected behavior, actual error, lifecycle explanation, two fix directions, and test coverage. Do not repost those as a new discovery.
- [PR #1605](https://github.com/openai/openai-agents-js/pull/1605) merged on 2026-08-15 as `c122399de74a705b5972bc734ee6f77185b63893`. It introduced lifecycle invalidation and generation guards across MCP tool caches; the issue and follow-up identify this guard as the behavior that makes one overlapping sessionless listing stale.
- PR #2026 concerns bounded termination of stateful Streamable HTTP sessions during `close()`, not concurrent sessionless listing. Searching PRs for “sessionless” and “MCPServerStreamableHttp” found no active PR specific to #2047; unrelated MCP cache PRs were not treated as fixes.
- The current upstream `main` head observed on 2026-11-22 is `d447a78e313f3b48e21cc6b20e7fade4de213d28` (2026-11-20). In `packages/agents-core/src/mcp.ts`, `MCPServerStreamableHttp.listTools()` still calls `toolsLifecycle.invalidate()` and awaits `invalidateToolsCaches()` in the `sessionId === undefined` branch before awaiting `underlying.listTools()`. The current branch therefore retains the code path from the report.
- `CONTRIBUTING.md` says pull requests are restricted to repository collaborators and explicitly welcomes minimal reproductions and root-cause analysis through issues. This draft follows the allowed issue discussion path, but is not posted pending review.

## Local verification

The project uses `@openai/agents@0.22.0` and resolves `@openai/agents-core@0.22.0`; `pnpm view` confirmed both are the latest published versions checked on 2026-11-22. The reproduction ran on Node `v24.16.0`, Windows x64, using a local sessionless Streamable HTTP server; it requires no model or API key. The test parks the first `tools/list` until the server has received it, starts a second `listTools()`, then waits for both outcomes. `pnpm exec vitest run tests/agents-mcp-2047.test.ts` passed: 1 test file, 1 test. The test asserts one rejection containing `MCP tool listing became stale` and a successful one-tool listing.

This adds one useful confirmation beyond the October report: the same behavior remains reproducible on the latest published SDK 0.22.0, and the latest upstream main commit still contains the implicated invalidation path. It does not add a novel root cause or fix; those are already covered in the issue thread.

## Proposed issue comment (not submitted)

> Follow-up confirmation, not a new finding: I repeated the delayed, sessionless Streamable HTTP reproduction in this issue against `@openai/agents@0.22.0` / `@openai/agents-core@0.22.0` on Node `v24.16.0` (Windows x64). With no `mcp-session-id`, a 150 ms `tools/list` response, and two overlapping `listTools()` calls, the expected result is that both listings resolve; the actual result remains one rejection with `MCP tool listing became stale before it completed.` and one successful one-tool listing. `pnpm exec vitest run tests/agents-mcp-2047.test.ts` passed (Vitest 5.1.1: 1 test passed; it asserts both outcomes).
>
> I also checked upstream `main` at `d447a78e313f3b48e21cc6b20e7fade4de213d28` (2026-11-20): the sessionless branch still invalidates the lifecycle and underlying tool-cache generation before awaiting the listing. This is consistent with the lifecycle race described here. No model or API request was involved. The issue and existing reply already cover root cause, fix options, and regression-test design; this note only confirms the behavior on a later published version/current head.

No duplicate issue, patch claim, or unsupported upstream fix is proposed.
