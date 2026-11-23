"use client";

import { useState } from "react";
import type { DomainToolResult } from "@/lib/tools/checks";
import { UrlForm } from "@/components/tools/url-form";
import { Facts, formatDate, postTool, ResultBox, type Tone, Verdict } from "@/components/tools/shared";

const VERDICT: Record<DomainToolResult["state"], { tone: Tone; label: string }> = {
  ok: { tone: "ok", label: "Registered" },
  expiring: { tone: "warn", label: "Expiring soon" },
  unsupported: { tone: "muted", label: "n/a — no expiry date published" },
  unknown: { tone: "muted", label: "Couldn’t check" },
};

export function DomainChecker({ placeholder = "example.com" }: { placeholder?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DomainToolResult | null>(null);

  async function check(domain: string) {
    setPending(true);
    setError(null);
    const res = await postTool<DomainToolResult>("/api/tools/domain-expiry-checker", { domain });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setResult(res.result ?? null);
  }

  const v = result ? VERDICT[result.state] : null;
  return (
    <div className="flex flex-col gap-5">
      <UrlForm
        label="Domain"
        placeholder={placeholder}
        button="Check expiry"
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
                "Domain",
                <span key="d" className="font-mono">
                  {result.domain}
                </span>,
              ],
              ["Expires", formatDate(result.expiresAt)],
              ["Days left", result.daysLeft === null ? "—" : String(Math.max(result.daysLeft, 0))],
              ["Source", result.source ?? "—"],
            ]}
          />
        </ResultBox>
      ) : null}
    </div>
  );
}
