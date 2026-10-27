import { describe, expect, it } from "vitest";
import { redact } from "@/lib/log";

describe("redact", () => {
  it("removes secrets at any depth", () => {
    const out = redact({
      email: "a@b.co",
      password: "hunter2hunter2",
      headers: { Authorization: "Bearer abc", cookie: "s=1", "x-request-id": "r1" },
      nested: [{ apiKey: "re_123", sessionToken: "t" }],
      reportToken: "private",
    });
    expect(out).toEqual({
      email: "a@b.co",
      password: "[redacted]",
      headers: { Authorization: "[redacted]", cookie: "[redacted]", "x-request-id": "r1" },
      nested: [{ apiKey: "[redacted]", sessionToken: "[redacted]" }],
      reportToken: "[redacted]",
    });
  });

  it("serialises errors without losing the message", () => {
    const out = redact({ error: new Error("boom") }) as { error: { message: string } };
    expect(out.error.message).toBe("boom");
  });

  it("stops at a bounded depth", () => {
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 20; i++) cur = cur.next = {} as Record<string, unknown>;
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });
});
