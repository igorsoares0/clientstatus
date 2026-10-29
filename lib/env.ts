import { z } from "zod";

// Shared by the web app and the worker, so no "server-only" import here.
const optional = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined);

/** Paddle price ids look like pri_01h…; anything else is a copy-paste mistake. */
const priceId = optional.pipe(
  z
    .string()
    .regex(/^pri_[a-z\d_]+$/, "must be a Paddle price id (pri_…)")
    .optional(),
);

const schema = z
  .object({
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
    /**
     * Reverse proxies in front of the web app that append to X-Forwarded-For (lib/rate-limit.ts).
     * 1 = one proxy or load balancer; 2 = e.g. Cloudflare in front of nginx.
     */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
    /** Header your edge sets to the client address, overwriting any sent by the client (e.g. cf-connecting-ip). */
    CLIENT_IP_HEADER: optional.pipe(
      z
        .string()
        .regex(/^[a-z0-9-]+$/, "must be a lowercase header name")
        .optional(),
    ),
    /** Paddle billing. All optional: without them the Billing page explains billing isn't configured. */
    PADDLE_ENVIRONMENT: z.preprocess((v) => v || undefined, z.enum(["sandbox", "production"]).default("sandbox")),
    PADDLE_API_KEY: optional,
    PADDLE_WEBHOOK_SECRET: optional,
    /** Client-side token for Paddle.js (safe to expose; passed to the checkout component). */
    PADDLE_CLIENT_TOKEN: optional,
    /** Paddle price ids, one per plan and billing interval. Yearly is optional, but all three or none. */
    PADDLE_PRICE_STARTER: priceId,
    PADDLE_PRICE_GROWTH: priceId,
    PADDLE_PRICE_PRO: priceId,
    PADDLE_PRICE_STARTER_YEARLY: priceId,
    PADDLE_PRICE_GROWTH_YEARLY: priceId,
    PADDLE_PRICE_PRO_YEARLY: priceId,
    /** Comma-separated emails allowed into the internal ops page (/ops). */
    OPS_ADMIN_EMAILS: optional,
    /** Shown when a workspace on the largest plan runs out of website slots. */
    SUPPORT_EMAIL: optional.pipe(z.email().optional()),
  })
  .superRefine((e, ctx) => {
    const yearly = [e.PADDLE_PRICE_STARTER_YEARLY, e.PADDLE_PRICE_GROWTH_YEARLY, e.PADDLE_PRICE_PRO_YEARLY];
    if (yearly.some(Boolean) && !yearly.every(Boolean)) {
      ctx.addIssue({
        code: "custom",
        path: ["PADDLE_PRICE_STARTER_YEARLY"],
        message: "set all three yearly Paddle prices (starter, growth, pro) or none",
      });
    }
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
