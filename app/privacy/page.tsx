import type { Metadata } from "next";
import { Clause, LegalPage } from "@/components/legal-page";
import { RETENTION_DAYS } from "@/lib/monitoring/scheduler";
import { CHANGE_NOTICE_DAYS, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal data Client Status collects, why, and your rights.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" path="/privacy">
      {({ name, email }) => (
        <>
          <Clause title="1. Who is responsible">
            <p>
              Client Status is operated by {name}, an individual based in Brazil, who is the controller of the personal
              data described here under Brazil&apos;s General Data Protection Law (LGPD) and, where it applies, the EU
              and UK GDPR. Contact for anything about your data: {email}.
            </p>
            <p>
              Some data in a workspace is about your clients and their contacts. For that data you (the agency) are the
              controller and we process it on your behalf, only to provide the service to you.
            </p>
          </Clause>

          <Clause title="2. What we collect">
            <ul>
              <li>
                <strong>Account:</strong> your name, email address and password (stored only as a one-way hash), and
                whether your email is verified.
              </li>
              <li>
                <strong>Sign-in sessions:</strong> the IP address and browser user agent of each session, to keep you
                signed in and protect your account.
              </li>
              <li>
                <strong>Workspace content:</strong> workspace name and time zone, report branding (logo, colours,
                footer, contact line), team members, clients and their optional contact name, email and notes, report
                recipients&apos; email addresses, and the website addresses and settings you add.
              </li>
              <li>
                <strong>Monitoring results:</strong> outcomes of checks on those websites (status codes, response times,
                certificate and domain details) and audit findings (page and link addresses with the problem found). We
                don&apos;t store the contents of the pages we check.
              </li>
              <li>
                <strong>Billing:</strong> Paddle handles checkout and payment. We receive your subscription&apos;s plan
                and status, invoice numbers and amounts, and the card brand, last four digits and expiry date. We never
                see or store full card numbers.
              </li>
              <li>
                <strong>Emails we send:</strong> a copy of each alert, account and report email (recipient, subject and
                body) and its delivery status, including bounces and complaints.
              </li>
              <li>
                <strong>Security records:</strong> a log of actions taken in your workspace, and rate-limit counters
                keyed by a SHA-256 hash of an IP address or email address.
              </li>
            </ul>
          </Clause>

          <Clause title="3. Why we use it">
            <ul>
              <li>
                <strong>To provide the service you signed up for</strong> (performance of a contract): your account,
                monitoring, audits, alerts, reports and billing.
              </li>
              <li>
                <strong>To keep the service secure and reliable</strong> (legitimate interest): sessions, rate limits,
                abuse prevention and the workspace activity log.
              </li>
              <li>
                <strong>To meet legal obligations</strong>: billing and tax records, mostly kept by Paddle as Merchant
                of Record.
              </li>
            </ul>
            <p>
              We don&apos;t sell personal data, show advertising or use analytics or advertising trackers. We email you
              about your account and the service, not marketing, unless you ask for it.
            </p>
          </Clause>

          <Clause title="4. Cookies">
            <p>
              We use only the cookies needed to keep you signed in. The Billing page loads Paddle&apos;s checkout, which
              may set its own cookies for payment and fraud prevention under Paddle&apos;s privacy policy.
            </p>
          </Clause>

          <Clause title="5. Who we share it with">
            <p>We use these service providers, each bound to process the data only on our instructions:</p>
            <ul>
              {SUBPROCESSORS.map((s) => (
                <li key={s.name}>
                  <strong>{s.name}</strong>: {s.purpose} ({s.location}).
                </li>
              ))}
            </ul>
            <p>
              We disclose data to authorities only when the law requires it. Report emails and private report links go
              to the recipients you choose.
            </p>
          </Clause>

          <Clause title="6. International transfers">
            <p>
              We are in Brazil, our servers are in the European Union and some providers are in the United States or the
              United Kingdom. Where data leaves its country of origin, we rely on the safeguards the LGPD and GDPR
              allow, such as the standard contractual clauses our providers offer.
            </p>
          </Clause>

          <Clause title="7. How long we keep it">
            <ul>
              <li>Raw check results and copies of sent emails: {RETENTION_DAYS} days.</li>
              <li>Finished background jobs: 7 days. Rate-limit counters: until their time window ends.</li>
              <li>
                Account, workspace content, reports, incidents and audit findings: while your account exists, or until
                you delete them.
              </li>
              <li>Billing records: as long as tax and accounting law requires.</li>
            </ul>
            <p>
              When you ask us to delete your account, we delete your data within 30 days, except records the law
              requires us to keep. Copies in backups disappear as the backups rotate.
            </p>
          </Clause>

          <Clause title="8. Your rights">
            <p>
              You can ask us to confirm whether we process your data, give you access to it or a portable copy, correct
              it, delete it, tell you who we share it with, or stop processing that relies on legitimate interest. Write
              to {email}; we reply within 15 days. You can also complain to Brazil&apos;s data protection authority
              (ANPD) or, in the EU or UK, to your local supervisory authority.
            </p>
            <p>
              If you are a client contact or report recipient of an agency that uses Client Status, please contact that
              agency first. We will help them answer your request.
            </p>
          </Clause>

          <Clause title="9. Security">
            <p>
              Data travels over TLS. Passwords are hashed, private report links are stored only as hashes, and every
              request is checked against the workspace it belongs to. No system is perfectly secure; if a breach affects
              your data, we will tell you and the authorities as the law requires.
            </p>
          </Clause>

          <Clause title="10. Children">
            <p>Client Status is a business service and is not meant for anyone under 18.</p>
          </Clause>

          <Clause title="11. Changes">
            <p>
              We will update this policy when our practices change. For material changes we will email workspace owners
              at least {CHANGE_NOTICE_DAYS} days before they take effect.
            </p>
          </Clause>
        </>
      )}
    </LegalPage>
  );
}
