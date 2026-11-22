# GitHub release-readiness checklist

Prepared 2026-11-22 for the review-only preparation step. This checklist does not authorize publication.

## Repository metadata prepared

- Repository: `Fawzankhan-404/mcp-flowbench`
- Target URL: https://github.com/Fawzankhan-404/mcp-flowbench
- Description: `Reproducible benchmarks for MCP-backed direct and programmatic tool calling with OpenAI Agents JS.`
- Visibility: Public
- License: MIT (repository `LICENSE` and `package.json` agree)
- Suggested topics: `mcp`, `openai`, `agents-sdk`, `typescript`, `benchmarking`, `programmatic-tool-calling`, `developer-tools`, `open-source`
- Authenticated GitHub lookup returned 404 for the target repository on 2026-11-22. No repository was created.

## Local preparation

- [x] Existing project files, milestone reports, and benchmark artifacts preserved.
- [x] `.gitignore` covers dependency/build output, all generated benchmark results, environment files, common credential files, keys/certificates, logs, coverage, and temporary files.
- [x] README explains benchmark scope, architecture, limitations, commands, data handling, and related work without performance claims.
- [x] `pnpm install --frozen-lockfile`, formatting, lint, license check, typecheck, tests, build, local Gitleaks, and offline matrix checked; see final task report for exact outputs.
- [x] Initial local commit created and working tree checked clean.
- [x] Live benchmark remains pending; no API request was made.
- [x] Upstream #2047 follow-up draft prepared; not posted.

## Before a public launch

- [ ] Review the local commit and approve the public repository creation/push step.
- [ ] Create the public repository with the prepared metadata and confirm the `main` default branch.
- [ ] Push the reviewed commit; confirm public source, README, MIT license, CI and secret scanning are visible and no results/credentials were included.
- [ ] Verify GitHub Actions on the published commit; local results are not evidence of remote CI.
- [ ] Confirm public commit author presentation and account attribution.
- [ ] Revisit the proposed upstream issue comment against the issue's then-current discussion; post only if the 0.22.0/current-main confirmation is still useful and non-duplicative.
- [ ] Decide separately whether to authorize a live smoke run with an explicit spend cap; the $3.84 estimate is not a cap.
- [ ] Prepare a release only after review of repository setup and CI. Label it an initial research harness; do not claim speed, cost, or token savings.

## Current blockers and limitations

- No GitHub repository or remote exists yet, and no push, publication, or release has happened.
- GitHub Actions cannot be tested until a repository exists.
- The managed Standard security scan stalled and was canceled; local Gitleaks passed, but the managed review is incomplete.
- Live PTC performance evaluation is still pending credentials and authorized spend.
- The current local initial commit is not based on Git history because this workspace had no repository metadata before initialization.
