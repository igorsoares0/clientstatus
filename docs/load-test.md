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

- Achieved sits a little under needed only inside the measured window, while sites move from the start-up burst to
  their own slot (that move also makes interval p95 ≈ 85 s once). The queue ends empty in every scenario.
- The remaining lag (≤ 5 s) is the scheduler's 5-second tick, well inside a 1-minute interval.
- Inconclusive share stayed at 0.3–0.6% (the hanging tail) and never opened incidents.

**Capacity rule of thumb:** one worker does roughly **1 check/s per slot** with this latency mix (≈ 0.63 s network +
≈ 0.3 s database per check). Size `WORKER_CONCURRENCY` at 1.3–1.5 × the checks/s you need:

| Plan    | One full workspace | Workspaces per worker at 32 slots | at 64 slots |
| ------- | -----------------: | --------------------------------: | ----------: |
| Starter |   25 sites / 5 min → 0.08 /s |                         ~300 |        ~600 |
| Growth  | 100 sites / 2 min → 0.83 /s |                          ~28 |         ~56 |
| Pro     |   300 sites / 1 min → 5 /s  |                            ~5 |         ~10 |

Workspaces rarely sit at their limit, so real headroom is larger. Watch "oldest due" on `/ops`: above ~10 s on a
1-minute plan means add slots or a second worker (workers share the queue safely).

## Audits (calculated, not load-tested)

Crawls are paced at about 1 request/s per host and capped per plan (`maxAuditMinutes` 15/30/45). Worst case — every
site hits its time cap on every scheduled audit:

| Plan    | Audits / day (full workspace) | Worst-case audit time / day | Typical (≈ 5 min per audit) |
| ------- | ----------------------------: | --------------------------: | --------------------------: |
| Starter |               25 / 7 d ≈ 3.6 |                     54 min |                      18 min |
| Growth  |             100 / 7 d ≈ 14.3 |                    7.1 h |                       1.2 h |
| Pro     |               300 / 3 d = 100 |                     **75 h** |                     8.3 h |

One audit slot gives 24 h of crawling a day; the worker now runs 4 (`WORKER_AUDIT_CONCURRENCY`), i.e. 96 h/day. A
single full Pro workspace at worst case would use most of that, so before launch either confirm real crawl times in the
beta (`/ops` shows audit jobs and their age) or lower Pro's audit frequency or time cap. Audits never take uptime slots:
they run in their own lane.
