import { describe, expect, it } from "vitest";
import { emailDelivery, parseEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5435/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_FROM: "Client Status <alerts@example.com>",
};

describe("parseEnv", () => {
  it("accepts a complete configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe("development");
    expect(env.WORKER_HEALTH_PORT).toBe(3001);
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("names every invalid variable", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x", BETTER_AUTH_SECRET: "short" })).toThrow(
      /DATABASE_URL[\s\S]*BETTER_AUTH_SECRET|BETTER_AUTH_SECRET[\s\S]*DATABASE_URL/,
    );
  });

  it("treats empty optional values as unset", () => {
    const env = parseEnv({ ...valid, RESEND_API_KEY: "", EMAIL_DELIVERY: "" });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_DELIVERY).toBeUndefined();
  });
});

describe("emailDelivery", () => {
  it("sends for real in production and uses the mailbox elsewhere by default", () => {
    expect(emailDelivery(parseEnv({ ...valid, NODE_ENV: "production" }))).toBe("resend");
    expect(emailDelivery(parseEnv({ ...valid, NODE_ENV: "development" }))).toBe("mailbox");
  });

  it("respects an explicit setting", () => {
    expect(emailDelivery(parseEnv({ ...valid, NODE_ENV: "production", EMAIL_DELIVERY: "mailbox" }))).toBe("mailbox");
  });
});
