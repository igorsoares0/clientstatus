import type { Metadata } from "next";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { OnboardingFrame, Panel } from "@/components/onboarding-frame";
import { CRAWLER_TOKEN } from "@/lib/crawler/robots";
import { env } from "@/lib/env";
import { USER_AGENT } from "@/lib/monitoring/safe-fetch";
import { PLANS } from "@/lib/plans";

// Public page the crawler's User-Agent points to (lib/monitoring/safe-fetch.ts): what the bot
// requests, how to opt out and whom to contact. Linked from site owners' logs, not from the app.

export const metadata: Metadata = {
  title: CRAWLER_TOKEN,
  description: "What ClientStatusBot requests from your website and how to opt out.",
};

const plans = Object.values(PLANS);
const minutes = plans.map((p) => p.uptimeIntervalSeconds / 60);
const maxRequests = Math.max(...plans.map((p) => p.maxRequestsPerAudit));
const maxMinutes = Math.max(...plans.map((p) => p.maxAuditMinutes));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// The address comes from the runtime environment, not the build.
async function Contact() {
  await connection();
  const email = env().SUPPORT_EMAIL;
  if (!email) return <p className="m-0 leading-normal text-ink-2">Contact details are not configured yet.</p>;
  return (
    <p className="m-0 leading-normal text-ink-2">
      Write to <a href={`mailto:${email}`}>{email}</a> with the address of your site and we will stop all requests to
      it.
    </p>
  );
}

export default function BotPage() {
  return (
    <OnboardingFrame>
      <Panel
        title={CRAWLER_TOKEN}
        intro="ClientStatusBot is the monitor behind Client Status, a service web agencies use to watch the websites they build and maintain for their clients. If it shows up in your logs, an agency has added your site, or a site that links to yours."
      >
        <Section title="How it identifies itself">
          <p className="m-0 leading-normal text-ink-2">Every request carries this User-Agent:</p>
          <code className="block border border-rule bg-canvas px-3 py-2 font-mono text-[12.5px] break-all">
            {USER_AGENT}
          </code>
        </Section>

        <Section title="What it requests">
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 leading-normal text-ink-2">
            <li>
              <strong>Uptime:</strong> one GET request to the address the agency added, every {Math.min(...minutes)} to{" "}
              {Math.max(...minutes)} minutes.
            </li>
            <li>
              <strong>SSL:</strong> a TLS connection to read the certificate, every 6 hours.
            </li>
            <li>
              <strong>Domain expiry:</strong> looked up in public registry data (RDAP), never on your server.
            </li>
            <li>
              <strong>Audits:</strong> about once a week, a crawl of the site&apos;s own pages to find broken links and
              basic SEO problems. One request at a time, at least half a second apart (longer if your robots.txt sets a
              Crawl-delay), and never more than {maxRequests.toLocaleString("en-US")} requests or {maxMinutes} minutes
              per audit.
            </li>
            <li>
              <strong>Link checks:</strong> when an audited site links to yours, that link gets a single request, and
              one retry only if the first one failed.
            </li>
          </ul>
          <p className="m-0 leading-normal text-ink-2">
            It does not run JavaScript, submit forms, sign in, or follow links to private or internal addresses.
          </p>
        </Section>

        <Section title="How to opt out">
          <p className="m-0 leading-normal text-ink-2">To stop audits from crawling your site, add to robots.txt:</p>
          <pre className="m-0 border border-rule bg-canvas px-3 py-2 font-mono text-[12.5px]">
            {`User-agent: ${CRAWLER_TOKEN}\nDisallow: /`}
          </pre>
          <p className="m-0 leading-normal text-ink-2">
            Audits follow robots.txt and its Crawl-delay by default. An agency can turn that off only for websites it
            manages. Uptime and SSL checks touch the single address the agency added and don&apos;t read robots.txt; if
            nobody asked for your site to be monitored, contact us below.
          </p>
        </Section>

        <Section title="Contact">
          <Suspense fallback={<p className="m-0 leading-normal text-ink-2">&nbsp;</p>}>
            <Contact />
          </Suspense>
        </Section>
      </Panel>
    </OnboardingFrame>
  );
}
