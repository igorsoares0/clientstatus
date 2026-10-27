// Minimal structured logger. Never log secrets (FR-OPS-05): sensitive keys are
// redacted recursively before anything is written.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|session|credential|signature/i;
const REDACTED = "[redacted]";
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Fields = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: Level, scope: string, msg: string, fields?: Fields) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(fields ? (redact(fields) as Fields) : {}),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export function logger(scope: string) {
  return {
    debug: (msg: string, fields?: Fields) => write("debug", scope, msg, fields),
    info: (msg: string, fields?: Fields) => write("info", scope, msg, fields),
    warn: (msg: string, fields?: Fields) => write("warn", scope, msg, fields),
    error: (msg: string, fields?: Fields) => write("error", scope, msg, fields),
  };
}
