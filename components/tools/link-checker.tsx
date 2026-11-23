"use client";

import { useState } from "react";
import type { LinkToolResult } from "@/lib/tools/crawl";
import { UrlForm } from "@/components/tools/url-form";
import { Facts, postTool, ResultBox, Verdict } from "@/components/tools/shared";
import { useRun } from "@/components/tools/use-run";

export function LinkChecker() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const run = useRun<LinkToolResult>(runId);
  const busy = pending || run.status === "queued" || run.status === "running";

  async function check(url: string) {
    setPending(true);
    setError(null);
    setRunId(null);
    const res = await postTool("/api/tools/broken-link-checker", { url });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setRunId(res.runId ?? null);
  }

  return (
    <div className="flex flex-col gap-5">
      <UrlForm
        label="Website"
        placeholder="example.com"
        button="Find broken links"
        pending={busy}
        error={error}
        onSubmit={check}
      />
      {run.status === "queued" || run.status === "running" ? (
        <ResultBox>
          <Verdict tone="muted" label={run.status === "queued" ? "Waiting to start…" : "Crawling…"}>
            We pace requests so the site isn’t overloaded. This usually takes a minute or two; keep this page open.
          </Verdict>
        </ResultBox>
      ) : null}
      {run.status === "failed" ? (
        <ResultBox>
          <Verdict tone="muted" label="Couldn’t finish">
            {run.error}
          </Verdict>
        </ResultBox>
      ) : null}
      {run.status === "completed" ? <LinkResult r={run.result} /> : null}
    </div>
  );
}

function LinkResult({ r }: { r: LinkToolResult }) {
  return (
    <ResultBox>
      <Verdict
        tone={r.brokenTotal ? "bad" : "ok"}
        label={
          r.brokenTotal ? `${r.brokenTotal} broken link${r.brokenTotal === 1 ? "" : "s"}` : "No broken links found"
        }
      >
        Checked {r.linksChecked.toLocaleString("en-US")} links on {r.pagesVisited} page{r.pagesVisited === 1 ? "" : "s"}
        {r.status === "partial" ? ` — partial: ${r.partialReasons.join("; ")}` : "."}
      </Verdict>
      {r.broken.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] tracking-[0.03em] text-muted uppercase">
                <th className="py-2 pr-4 font-normal">Broken link</th>
                <th className="py-2 pr-4 font-normal">Found on</th>
                <th className="py-2 font-normal">Result</th>
              </tr>
            </thead>
            <tbody>
              {r.broken.map((b, i) => (
                <tr key={`${b.target}-${b.source}-${i}`} className="border-t border-rule align-top">
                  <td className="py-2 pr-4 font-mono break-all">{b.target}</td>
                  <td className="py-2 pr-4 font-mono break-all text-ink-2">{b.source ?? "—"}</td>
                  <td className="py-2 text-ink-2">{b.statusCode ?? b.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.brokenTotal > r.broken.length ? (
            <p className="m-0 mt-2 text-[12.5px] text-muted">Showing the first {r.broken.length}.</p>
          ) : null}
        </div>
      ) : null}
      <Facts
        items={[
          ["Pages crawled", `${r.pagesVisited} of up to ${r.pageBudget}`],
          [
            "Not verifiable",
            r.inconclusiveLinks ? `${r.inconclusiveLinks} links (bot challenges, rate limits or restricted)` : "None",
          ],
          ["Skipped by robots.txt", String(r.skippedByRobots)],
          ...r.otherFindings.map((f): [string, string] => [
            f.label,
            `${f.count} — e.g. ${f.examples.slice(0, 2).join(", ")}`,
          ]),
        ]}
      />
    </ResultBox>
  );
}
