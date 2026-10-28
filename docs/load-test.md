# Load test: plan assumptions (Phase 5)

Spec §5 says the uptime intervals per plan are hypotheses that must be load-tested before launch. This is what
`npm run load-test` measured on 2026-10-27, and what changed because of it.

## Method

`scripts/load-test.ts` runs the real scheduler, Postgres queue, runner and uptime handler (`safeFetch`, classification,
incident logic, one transaction per check) for N workspaces of a plan, every site at its plan interval. Sites point at a
local HTTP server with a realistic latency mix — 70% 80–400 ms, 25% 0.4–1.5 s, 4.5% 1.5–6 s, 0.5% hanging past the
10 s timeout (≈ 0.63 s mean) — so no third-party site is contacted. It reports throughput, pickup lag (how late a check
starts versus when it was due), the real interval between two checks of the same site, and queue depth. The first
interval is excluded: every site starts due at once.

Environment: one worker process, Postgres 17 in Docker, WSL2 on a laptop. Production hardware will differ; re-run on the
production worker size before the beta ([private-beta.md](private-beta.md)).

## What the first runs found (and the fixes)

| Problem                                                        | Evidence (before)                                       | Fix                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| Intervals stretched: next check counted from when one finished | 1 Pro workspace: median interval **65.9 s** for 60 s    | Each site has a fixed slot (stable phase from its id)           |
| Slots idle up to 1 s after every check (claims ran once a second) | 10 Growth workspaces at 8 slots: **4.2** checks/s of 8.3 | Runner claims again as soon as a job finishes (`refill`)        |
| Database pool (pg default 10) smaller than the concurrency     | 32 slots reached only 20 checks/s of 25                 | Worker pool = concurrency + audit lane + 4                      |
| Sites started together stayed bunched (all due the same second) | Pickup lag p95 23–31 s after the first two fixes        | The per-site phase also spreads checks evenly across the interval |
| Default concurrency 8 ≈ 8 checks/s per worker                  | 5 Pro workspaces at 8 slots: 8.4 checks/s of 25         | Default `WORKER_CONCURRENCY` raised to 32                       |

## Results after the fixes

| Scenario                              | Sites | Needed   | Achieved | Pickup lag p50 / p95 | Interval p50 |
| ------------------------------------- | ----: | -------: | -------: | -------------------: | -----------: |
| 1 Pro workspace, 8 slots              |   300 |  5.0 /s  |  4.8 /s  |        2.9 s / 4.8 s |       60.1 s |
| 10 Growth workspaces, 8 slots         | 1,000 |  8.3 /s  |  8.0 /s  |        3.8 s / 4.9 s |      121.0 s |
| 5 Pro workspaces, 32 slots            | 1,500 | 25.0 /s  | 24.4 /s  |        3.4 s / 5.0 s |       59.9 s |
| 10 Pro workspaces, 64 slots           | 3,000 | 50.0 /s  | 47.7 /s  |        3.5 s / 5.0 s |       60.1 s |
| 5 Pro workspaces at 150 sites, 32 slots (28 Oct 2026) | 750 | 12.5 /s | 11.5 /s | 2.8 s / 4.8 s | 60.1 s |

- Achieved sits a little under needed only inside the measured window, while sites move from the start-up burst to
  their own slot (that move also makes interval p95 ≈ 85 s once). The queue ends empty in every scenario.
- The remaining lag (≤ 5 s) is the scheduler's 5-second tick, well inside a 1-minute interval.
- Inconclusive share stayed at 0.3–0.6% (the hanging tail) and never opened incidents.

**Capacity rule of thumb:** one worker does roughly **1 check/s per slot** with this latency mix (≈ 0.63 s network +
≈ 0.3 s database per check). Size `WORKER_CONCURRENCY` at 1.3–1.5 × the checks/s you need:

| Plan    | One full workspace (plan limits of 28 Oct 2026) | Workspaces per worker at 32 slots | at 64 slots |
| ------- | ----------------------------------------------: | --------------------------------: | ----------: |
| Starter |                       15 sites / 5 min → 0.05 /s |                              ~460 |        ~920 |
| Growth  |                       50 sites / 2 min → 0.42 /s |                               ~55 |        ~110 |
| Pro     |                      150 sites / 1 min → 2.5 /s |                                ~9 |         ~18 |

Workspaces rarely sit at their limit, so real headroom is larger. Watch "oldest due" on `/ops`: above ~10 s on a
1-minute plan means add slots or a second worker (workers share the queue safely).

## Audits (calculated, not load-tested)

Crawls are paced at about 1 request/s per host and capped per plan (`maxAuditMinutes` 15/30/45). Worst case — every
site hits its time cap on every scheduled audit:

| Plan    | Audits / day (full workspace) | Worst-case audit time / day | Typical (≈ 5 min per audit) |
| ------- | ----------------------------: | --------------------------: | --------------------------: |
| Starter |               15 / 7 d ≈ 2.1 |                     32 min |                      11 min |
| Growth  |               50 / 7 d ≈ 7.1 |                     3.6 h |                      36 min |
| Pro     |             150 / 7 d ≈ 21.4 |                      16 h |                       1.8 h |

One audit slot gives 24 h of crawling a day; the worker runs 4 (`WORKER_AUDIT_CONCURRENCY`), i.e. 96 h/day, so one
worker covers about six full Pro workspaces even in the worst case. Audits never take uptime slots: they run in their
own lane.

**Why the plans changed (28 Oct 2026).** With the first plan hypotheses (Pro: 300 sites, audits every 3 days), one
full Pro workspace was 100 audits a day and up to **75 h** of crawling — most of a worker's 96 h on its own. Pro now
holds 150 sites and audits weekly like the other plans (≈ 21 audits a day, 16 h worst case), Growth 50 and Starter 15.
Confirm real crawl times in the beta (`/ops` shows audit jobs and their age) before raising either again.
