"use client";

import { useState } from "react";
import type { SslToolResult } from "@/lib/tools/checks";
import { UrlForm } from "@/components/tools/url-form";
import { Facts, formatDate, postTool, ResultBox, type Tone, Verdict } from "@/components/tools/shared";

const VERDICT: Record<SslToolResult["state"], { tone: Tone; label: string }> = {
  valid: { tone: "ok", label: "Valid certificate" },
  expiring: { tone: "warn", label: "Renewal due" },
  expired: { tone: "bad", label: "Expired" },
  invalid: { tone: "bad", label: "Problem with the certificate" },
  unknown: { tone: "muted", label: "Couldn’t check" },
};

export function SslChecker() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SslToolResult | null>(null);

  async function check(url: string) {
    setPending(true);
    setError(null);
    const res = await postTool<SslToolResult>("/api/tools/ssl-checker", { url });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setResult(res.result ?? null);
  }

  const v = result ? VERDICT[result.state] : null;
  return (
    <div className="flex flex-col gap-5">
      <UrlForm
        label="Website"
        placeholder="example.com"
        button="Check certificate"
        pending={pending}
        error={error}
        onSubmit={check}
      />
      {result && v ? (
        <ResultBox>
          <Verdict tone={v.tone} label={v.label}>
            {result.summary}
          </Verdict>
          <Facts
            items={[
              [
                "Hostname",
                <span key="h" className="font-mono">
                  {result.hostname}
                </span>,
              ],
              ["Issuer", result.issuer ?? "—"],
              ["Expires", formatDate(result.expiresAt)],
              ["Days left", result.daysLeft === null ? "—" : String(Math.max(result.daysLeft, 0))],
              [
                "Client Status would warn",
                result.nextWarningDays !== null
                  ? `${result.nextWarningDays} days before expiry (warnings at ${result.thresholds.join(", ")} days)`
                  : result.state === "unknown"
                    ? "After checking again — one failed connection isn’t an alert"
                    : result.state === "expired" || result.state === "invalid"
                      ? "Straight away: invalid and expired certificates alert immediately"
                      : "On the day it expires",
              ],
            ]}
          />
        </ResultBox>
      ) : null}
    </div>
  );
}
