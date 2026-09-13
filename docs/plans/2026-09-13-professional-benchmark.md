# Professional Benchmark Monitoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade ModelPulse with reproducible benchmark runs, professional performance metrics, rolling health summaries, structured failures, and developer-oriented diagnostics without adding cloud or team features.

**Architecture:** Keep all network and persistence work in the Electron main process. Extend individual result records compatibly, add pure modules for validation and aggregation, and introduce run modes in the existing IPC flow. The renderer consumes a richer snapshot while old records continue to render with missing metrics.

**Tech Stack:** Electron, Node.js CommonJS, sql.js/SQLite, browser ES modules, ECharts, Node test runner, Playwright smoke tests.

---

### Task 1: Add benchmark output validation and professional metrics

**Files:**
- Create: `src/core/validation.cjs`
- Modify: `src/core/benchmark.cjs`
- Test: `test/benchmark.test.cjs`
- Test: `test/validation.test.cjs`

**Steps:**

1. Add failing tests for strict validation of the built-in 1–120 response and unchecked custom prompts.
2. Add failing benchmark tests for generation duration, generation token throughput, character throughput, usage source, validation state, and structured error categories.
3. Implement a pure validator that recognizes the versioned built-in profile.
4. Capture the first text timestamp and terminal timestamp, calculate the new metrics, and retain `tokensPerSecond` as the compatible end-to-end metric.
5. Map HTTP, timeout, connection, protocol, invalid output and cancellation failures to stable error codes without exposing upstream response bodies.
6. Run focused tests, then the complete unit suite.

### Task 2: Add run modes, sampling plans, and aggregation

**Files:**
- Create: `src/core/aggregate.cjs`
- Create: `src/core/run-plan.cjs`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Test: `test/aggregate.test.cjs`
- Test: `test/run-plan.test.cjs`

**Steps:**

1. Add failing tests for median, nearest-rank P95, coefficient of variation, sample eligibility, and stability labels.
2. Add failing tests for quick, standard and scheduled execution plans. Verify that standard mode creates one warmup and three measured rounds with alternating shuffled order.
3. Implement pure aggregation and plan-building modules with injectable randomness for deterministic tests.
4. Extend `runTests` to accept a validated mode, execute the plan, exclude warmups from persisted results, and broadcast sample-level progress.
5. Keep tray and scheduler invocations on quick/scheduled one-sample behavior.
6. Run focused and complete unit tests.

### Task 3: Add compatible persistence and rolling model summaries

**Files:**
- Modify: `src/core/store.cjs`
- Modify: `src/main.cjs`
- Test: `test/config-store.test.cjs`
- Test: `test/aggregate.test.cjs`

**Steps:**

1. Add failing tests proving legacy records remain readable and new records preserve run metadata.
2. Add queries for recent per-model samples, 24-hour failure counts, last-run statistics, and exportable filtered history.
3. Produce per-model rolling summaries from the latest five eligible scheduled samples.
4. Return overview statistics and summaries in the snapshot without changing credential handling.
5. Reset ranking state when the metric/profile compatibility key changes.
6. Run store and full unit tests.

### Task 4: Replace raw latest-result ranking with stable rolling ranking

**Files:**
- Modify: `src/core/ranking.cjs`
- Modify: `src/main.cjs`
- Test: `test/ranking.test.cjs`

**Steps:**

1. Add failing tests for minimum sample count, incompatible profiles, invalid output, estimated token usage, rolling median comparison, and consecutive degradation confirmation.
2. Update ranking inputs to use eligible rolling summaries rather than one raw result.
3. Emit structured availability, performance and ranking notification data.
4. Preserve the existing pairwise hysteresis behavior for compatible summaries.
5. Run ranking and full unit tests.

### Task 5: Upgrade the overview and benchmark controls

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/shared.js`
- Test: `test/ui-contract.test.cjs`

**Steps:**

1. Add failing UI contract tests for overview metrics, model health, quick test, standard benchmark, comparison deltas and richer progress.
2. Replace ambiguous global cards with healthy-model count, latest-run success rate, P50 TTFT, P50 generation throughput, 24-hour incidents and next scheduled run.
3. Add quick and standard actions with an explicit request-count/cost warning for standard mode.
4. Render health, rolling P50, comparison delta, success rate, stability, validation and usage-source states per model.
5. Ensure empty, loading, insufficient-data, stale and failure states remain understandable.
6. Run UI contract and desktop smoke tests.

### Task 6: Extend history diagnostics and safe exports

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/chart.js`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Test: `test/ui-contract.test.cjs`
- Test: `test/config-store.test.cjs`

**Steps:**

1. Add failing tests for new metric selectors, mode/status/error filters and export IPC.
2. Add chart metrics for generation throughput and characters per second while preserving legacy end-to-end throughput.
3. Add sample detail fields without storing or exposing complete output content.
4. Add CSV and JSON exports that exclude credentials, headers and output text.
5. Validate export filters in the main process and escape CSV cells safely.
6. Run UI, store and full test suites.

### Task 7: Finish compatibility, documentation and release validation

**Files:**
- Modify: `README.md`
- Modify: `scripts/smoke.cjs`
- Modify: `test/suite.test.cjs`
- Modify: `package.json` only if a script change is required

**Steps:**

1. Document the three run modes, metric definitions, ranking eligibility and API cost implications.
2. Update the smoke path to exercise quick and standard controls with the mock provider.
3. Run `npm run check`, `npm test`, and `npm run test:desktop`.
4. Inspect the working-tree diff for accidental credential, fixture or generated-file changes.
5. Commit the completed implementation in reviewable logical commits.

## Completion criteria

- Existing model configuration and history remain usable after upgrade.
- Quick, standard and scheduled modes follow their documented request counts.
- Professional metrics and validity state are recorded for all supported protocols.
- Rolling summaries drive health and ranking; single noisy samples do not.
- Diagnostic views and exports contain no secrets or complete model output.
- Static checks, unit tests and desktop smoke tests pass.

