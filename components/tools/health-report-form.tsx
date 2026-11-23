"use client";

import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { MARKETING_OPT_IN_TEXT, REPORT_CONSENT_TEXT } from "@/lib/tools/consent";
import { postTool, ResultBox, Verdict } from "@/components/tools/shared";
import { useRun } from "@/components/tools/use-run";

const [CONSENT_BEFORE, CONSENT_AFTER] = REPORT_CONSENT_TEXT.split("Privacy Policy");

export function HealthReportForm() {
  const id = useId();
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [trap, setTrap] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const run = useRun<{ emailed: boolean }>(runId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setRunId(null);
    const res = await postTool("/api/tools/website-health-report", {
      url: url.trim(),
      email: email.trim(),
      marketingOptIn: optIn,
      website: trap,
    });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setSentTo(email.trim());
    setRunId(res.runId ?? null);
  }

  const working = pending || run.status === "queued" || run.status === "running";
  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="flex max-w-[560px] flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-url`} className="text-[13px] font-semibold">
            Website to check
          </label>
          <TextInput
            id={`${id}-url`}
            name="url"
            inputMode="url"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="client-website.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            mono
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-email`} className="text-[13px] font-semibold">
            Your email
          </label>
          <TextInput
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {/* Honeypot: hidden from people and screen readers; bots tend to fill every field. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Leave this empty
            <input
              tabIndex={-1}
              autoComplete="off"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              name="website"
            />
          </label>
        </div>
        <label className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink-2">
          <input type="checkbox" className="mt-0.5" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          <span>{MARKETING_OPT_IN_TEXT}</span>
        </label>
        <p className="m-0 text-[12.5px] leading-relaxed text-muted">
          {CONSENT_BEFORE}
          <Link href="/privacy">Privacy Policy</Link>
          {CONSENT_AFTER}
        </p>
        <div>
          <Button type="submit" size="lg" disabled={working || !url.trim() || !email.trim()}>
            {working ? "Preparing…" : "Email me the report"}
          </Button>
        </div>
        <p aria-live="polite" className="m-0 min-h-[1.25em] text-[12.5px] text-down">
          {error}
        </p>
      </form>
      {runId && (run.status === "queued" || run.status === "running") ? (
        <ResultBox>
          <Verdict tone="muted" label="Preparing your report…">
            We’re checking the site and running a quick audit. The PDF will arrive at {sentTo} in a few minutes; you can
            close this page.
          </Verdict>
        </ResultBox>
      ) : null}
      {run.status === "completed" ? (
        <ResultBox>
          <Verdict tone="ok" label="Report sent">
            Check {sentTo} for “Sample website health report”. If it isn’t there in a few minutes, look in spam.
          </Verdict>
        </ResultBox>
      ) : null}
      {run.status === "failed" ? (
        <ResultBox>
          <Verdict tone="muted" label="Couldn’t prepare the report">
            {run.error}
          </Verdict>
        </ResultBox>
      ) : null}
    </div>
  );
}
