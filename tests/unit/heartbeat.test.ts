import { describe, expect, it } from "vitest";
import { classifyWorker, HEARTBEAT_STALE_MS } from "@/lib/heartbeat";

describe("classifyWorker", () => {
  const now = new Date("2026-10-25T09:48:00Z");

  it("reports never-started when there is no heartbeat", () => {
    expect(classifyWorker(null, now)).toEqual({ kind: "never-started" });
  });

  it("is running within the stale window and delayed beyond it", () => {
    const fresh = new Date(now.getTime() - HEARTBEAT_STALE_MS);
    const stale = new Date(now.getTime() - HEARTBEAT_STALE_MS - 1);
    expect(classifyWorker(fresh, now).kind).toBe("running");
    expect(classifyWorker(stale, now)).toEqual({ kind: "delayed", lastSeenAt: stale });
  });
});
