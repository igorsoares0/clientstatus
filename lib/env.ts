import { z } from "zod";

// Shared by the web app and the worker, so no "server-only" import here.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  /** "mailbox" writes emails to .dev-mailbox/ instead of sending (dev and e2e). Defaults by NODE_ENV. */
  EMAIL_DELIVERY: z.preprocess((v) => v || undefined, z.enum(["resend", "mailbox"]).optional()),
  EMAIL_FROM: z.string().min(3),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});

export type Env = z.infer<typeof schema>;

export function emailDelivery(e: Env): "resend" | "mailbox" {
  return e.EMAIL_DELIVERY ?? (e.NODE_ENV === "production" ? "resend" : "mailbox");
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated environment. Parsed on first use so tooling can import modules without a full env. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
