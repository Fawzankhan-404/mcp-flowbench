# Research gap analysis

## Finding

OpenAI Agents JS already supports Programmatic Tool Calling (PTC), including programmatic-only tool callers. Cloudflare also provides Code Mode. Existing MCPMark, MCP-Atlas, and PTC-Bench cover broader MCP task evaluation or PTC comparisons. FlowBench should therefore focus on a reproducible TypeScript/OpenAI Agents JS comparison using the same local MCP-backed tools in direct and PTC modes, with explicit metric provenance. It must not claim to be the first PTC benchmark or implement a code sandbox.

## Candidate: sessionless `listTools()` lifecycle race

- **Problem:** overlapping stateless Streamable HTTP listings can conflict with cache invalidation.
- **Evidence:** OpenAI Agents JS issue #2047 and its proposed in-flight coalescing approach.
- **Unverified gap:** cache invalidation while a listing is pending may let a subsequent caller join stale work. This is an inference and requires a regression reproduction.
- **Risk / fit:** medium lifecycle risk; upstream fix belongs in Agents JS, not FlowBench.
- **Validation:** suspend one listing, invalidate, start another listing before releasing the first, then verify the newer listing reaches the server and returns current tools.
- **Upstream policy:** Agents JS limits PRs to collaborators; if reproduced and still unresolved, contribute a concise test/evidence comment to issue #2047 rather than opening a duplicate issue or PR.
