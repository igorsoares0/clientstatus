import { createHash } from "node:crypto";
import type { FindingSeverity } from "@/lib/generated/prisma/enums";
import type { PageFacts } from "@/lib/crawler/html";
import { sameSite } from "@/lib/crawler/normalize";
import type { RobotsPolicy } from "@/lib/crawler/robots";

// Audit findings (FR-SEO-01..07, FR-CRAWL-03). Basic technical checks only —
// never presented as a complete SEO audit.

export type FindingType =
  | "broken_link"
  | "redirect_chain"
  | "redirect_loop"
  | "missing_title"
  | "missing_meta_description"
  | "missing_canonical"
  | "malformed_canonical"
  | "missing_h1"
  | "multiple_h1"
  | "robots_unavailable"
  | "sitemap_unavailable";

export type FindingDraft = {
  type: FindingType;
  severity: FindingSeverity;
  sourceUrl: string | null;
  targetUrl: string | null;
  statusCode: number | null;
  summary: string;
};

/** Stable identity across audits, so a finding keeps its "first found" date. */
export function findingKey(f: Pick<FindingDraft, "type" | "sourceUrl" | "targetUrl">): string {
  return createHash("sha1")
    .update(`${f.type}|${f.sourceUrl ?? ""}|${f.targetUrl ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

export function pageFindings(pageUrl: string, facts: PageFacts): FindingDraft[] {
  // noindex pages aren't meant for search results; title/description/canonical don't apply.
  if (facts.noindex) return [];
  const out: FindingDraft[] = [];
  const at = (
    type: FindingType,
    severity: FindingSeverity,
    summary: string,
    targetUrl: string | null = null,
  ): FindingDraft => ({
    type,
    severity,
    sourceUrl: pageUrl,
    targetUrl,
    statusCode: null,
    summary,
  });
  if (!facts.title)
    out.push(at("missing_title", "medium", facts.title === "" ? "Empty <title> tag" : "Missing <title> tag"));
  if (!facts.metaDescription) {
    out.push(
      at(
        "missing_meta_description",
        "low",
        facts.metaDescription === "" ? "Empty meta description" : "Missing meta description",
      ),
    );
  }
  if (facts.canonicalRaw === null) out.push(at("missing_canonical", "low", "No canonical URL"));
  else if (facts.canonical === null)
    out.push(at("malformed_canonical", "medium", `Canonical URL is malformed: “${facts.canonicalRaw.slice(0, 120)}”`));
  else if (!sameSite(facts.canonical, pageUrl))
    out.push(at("malformed_canonical", "low", "Canonical URL points to another domain", facts.canonical));
  if (facts.h1Count === 0) out.push(at("missing_h1", "low", "No <h1> heading"));
  else if (facts.h1Count > 1)
    out.push(at("multiple_h1", "info", `${facts.h1Count} <h1> headings — usually one is clearer (advisory)`));
  return out;
}

export function robotsFinding(origin: string, robots: RobotsPolicy): FindingDraft | null {
  if (robots.state !== "error") return null;
  return {
    type: "robots_unavailable",
    severity: "low",
    sourceUrl: null,
    targetUrl: `${origin}/robots.txt`,
    statusCode: robots.status,
    summary: robots.status ? `robots.txt returned HTTP ${robots.status}` : "robots.txt couldn’t be fetched",
  };
}

export function sitemapFinding(url: string, status: number | null, listedInRobots: boolean): FindingDraft | null {
  if (status === 200) return null;
  // A missing /sitemap.xml that nobody points to is common and fine; a listed one that fails isn't.
  if (!listedInRobots && (status === 404 || status === 410)) return null;
  return {
    type: "sitemap_unavailable",
    severity: "low",
    sourceUrl: null,
    targetUrl: url,
    statusCode: status,
    summary: status
      ? `Sitemap returned HTTP ${status}${listedInRobots ? " (listed in robots.txt)" : ""}`
      : "Sitemap couldn’t be fetched",
  };
}
